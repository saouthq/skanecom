/* ============================================================================
   LES DOMAINES DES BOUTIQUES, CHEZ CLOUDFLARE (migration …_domaines_branchement)
   · brancher le domaine qu'un commerçant possède déjà (un .tn acheté chez un
     registrar tunisien) : Cloudflare for SaaS crée un « nom personnalisé »
     sur la zone de la plateforme ; le commerçant pose un CNAME vers la cible
     (NEXT_PUBLIC_CIBLE_DNS) et un TXT de propriété ; Cloudflare émet le
     certificat. Secret CLOUDFLARE_DOMAINES = « zone:<id de zone>:<jeton> »
     (droits « SSL and Certificates: Edit » sur la zone), ou « relais » en local.
   · en acheter un : l'API Registrar (bêta) — vérifier (disponible ? prix ?)
     juste avant, puis enregistrer (facturé au compte Cloudflare, sans
     remboursement). Secret CLOUDFLARE_REGISTRAR = « compte:<id>:<jeton> »
     (droits Registrar), ou « relais ». Cloudflare ne vend pas les .tn.
   Sans secret : « non branché », dit tel quel ; rien n'est inventé.
   ========================================================================== */

export type Mode = "cloudflare" | "relais" | "aucun";
export type Reponse<T> = { ok: true; valeur: T } | { ok: false; raison: string };
export type EnregistrementDns = { type: "CNAME" | "TXT"; nom: string; valeur: string; role: string };
export type Branchement = { ref: string; statut: "a_poser" | "actif" | "refuse"; enregistrements: EnregistrementDns[]; erreurs: string[] };
export type Verification = { nom: string; achetable: boolean; prix: string | null; devise: string | null; raison: string | null };

const API = "https://api.cloudflare.com/client/v4";

function lire(secret: string | undefined, genre: "zone" | "compte"): { mode: Mode; id: string; jeton: string } {
  const s = (secret ?? "").trim();
  if (s === "relais") return { mode: "relais", id: "dev", jeton: "relais-local-cloudflare" };
  const [g, id, jeton] = s.split(":");
  return g === genre && id && jeton ? { mode: "cloudflare", id, jeton } : { mode: "aucun", id: "", jeton: "" };
}

export function configDomaines() {
  return {
    saas: lire(process.env.CLOUDFLARE_DOMAINES, "zone"),
    registrar: lire(process.env.CLOUDFLARE_REGISTRAR, "compte"),
    /** Le CNAME que le commerçant pose (www.maymar.tn → cette cible). */
    cible: (process.env.NEXT_PUBLIC_CIBLE_DNS ?? "").trim().toLowerCase() || null,
    /** Les adresses provisoires : <identifiant>.<racine> (skanecom.tn ; localhost en local). */
    racine: (process.env.NEXT_PUBLIC_DOMAINE_BOUTIQUES ?? "").trim().toLowerCase() || null,
  };
}

/** L'adresse provisoire d'une boutique (maymar.skanecom.tn), ou null sans racine réglée. */
export function adresseProvisoire(slug: string): string | null {
  const { racine } = configDomaines();
  return racine && slug ? `${slug}.${racine}` : null;
}

/** Un hôte que la plateforme sert elle-même (adresse provisoire, .localhost) : rien à brancher. */
export function hotePlateforme(hote: string): boolean {
  const { racine } = configDomaines();
  return hote.endsWith(".localhost") || hote === "localhost" || Boolean(racine && hote.endsWith(`.${racine}`));
}

function base(mode: Mode): string {
  return mode === "relais" ? `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")}/cloudflare-dev/client/v4` : API;
}

async function appel<T>(c: { mode: Mode; jeton: string }, chemin: string, init?: { method?: string; corps?: unknown }): Promise<Reponse<T>> {
  if (c.mode === "aucun") return { ok: false, raison: "non_branche" };
  try {
    const r = await fetch(`${base(c.mode)}${chemin}`, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${c.jeton}`, "content-type": "application/json" },
      body: init?.corps === undefined ? undefined : JSON.stringify(init.corps),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await r.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { message?: string }[] } | null;
    if (!r.ok || !j?.success) return { ok: false, raison: j?.errors?.[0]?.message ?? `Cloudflare répond ${r.status}` };
    return { ok: true, valeur: j.result as T };
  } catch {
    return { ok: false, raison: "Cloudflare ne répond pas (réseau)" };
  }
}

type NomCf = {
  id: string; hostname: string; status: string;
  ownership_verification?: { type?: string; name?: string; value?: string };
  verification_errors?: string[];
};

function versBranchement(n: NomCf, cible: string | null): Branchement {
  const enregistrements: EnregistrementDns[] = [
    { type: "CNAME", nom: n.hostname, valeur: cible ?? "(la cible de la plateforme)", role: "Mène la vitrine" },
  ];
  if (n.ownership_verification?.name && n.ownership_verification.value) {
    enregistrements.push({ type: "TXT", nom: n.ownership_verification.name, valeur: n.ownership_verification.value, role: "Prouve le domaine" });
  }
  const statut = n.status === "active" ? "actif" : n.status === "blocked" || n.status === "moved" || n.status === "deleted" ? "refuse" : "a_poser";
  return { ref: n.id, statut, enregistrements, erreurs: n.verification_errors ?? [] };
}

/** Brancher : le nom personnalisé créé chez Cloudflare, les enregistrements à poser. */
export async function brancherDomaine(hote: string): Promise<Reponse<Branchement>> {
  const c = configDomaines();
  const r = await appel<NomCf>({ mode: c.saas.mode, jeton: c.saas.jeton }, `/zones/${c.saas.id}/custom_hostnames`, {
    method: "POST", corps: { hostname: hote, ssl: { method: "http", type: "dv" } },
  });
  return r.ok ? { ok: true, valeur: versBranchement(r.valeur, c.cible) } : r;
}

/** Où en est-il chez Cloudflare (le CNAME vu, le certificat émis) ? */
export async function etatDomaine(hote: string): Promise<Reponse<Branchement | null>> {
  const c = configDomaines();
  const r = await appel<NomCf[]>({ mode: c.saas.mode, jeton: c.saas.jeton }, `/zones/${c.saas.id}/custom_hostnames?hostname=${encodeURIComponent(hote)}`);
  return r.ok ? { ok: true, valeur: r.valeur[0] ? versBranchement(r.valeur[0], c.cible) : null } : r;
}

const RAISONS: Record<string, string> = {
  domain_unavailable: "déjà pris",
  extension_not_supported: "Cloudflare ne vend pas cette extension",
  extension_not_supported_via_api: "pas encore vendu d'un geste (à acheter dans le tableau de bord de Cloudflare)",
  extension_disallows_registration: "cette extension n'accepte pas d'achat",
};

/** Juste avant d'acheter : disponible, et à quel prix (au registre, en direct). */
export async function verifierAchat(noms: string[]): Promise<Reponse<Verification[]>> {
  const c = configDomaines().registrar;
  type Ligne = { name: string; registrable: boolean; reason?: string; pricing?: { currency?: string; registration_cost?: string } };
  const r = await appel<{ domains: Ligne[] }>(c, `/accounts/${c.id}/registrar/domain-check`, { method: "POST", corps: { domains: noms.slice(0, 20) } });
  if (!r.ok) return r;
  return {
    ok: true,
    valeur: r.valeur.domains.map((d) => ({
      nom: d.name, achetable: d.registrable, prix: d.pricing?.registration_cost ?? null, devise: d.pricing?.currency ?? null,
      raison: d.registrable ? null : d.name.endsWith(".tn") ? "un .tn s'achète chez un registrar tunisien agréé, puis se branche ici" : RAISONS[d.reason ?? ""] ?? d.reason ?? null,
    })),
  };
}

/** Acheter (facturé au compte Cloudflare de SkanEcom, sans remboursement). */
export async function acheterDomaine(nom: string): Promise<Reponse<{ nom: string; statut: string }>> {
  const c = configDomaines().registrar;
  const r = await appel<{ domain_name: string; status?: string }>(c, `/accounts/${c.id}/registrar/registrations`, { method: "POST", corps: { domain_name: nom } });
  return r.ok ? { ok: true, valeur: { nom: r.valeur.domain_name, statut: r.valeur.status ?? "en_cours" } } : r;
}
