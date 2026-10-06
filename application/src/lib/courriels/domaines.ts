import { lireEnvoi } from "./envoi";

/* ============================================================================
   LE DOMAINE D'ENVOI D'UNE BOUTIQUE, CHEZ LE FOURNISSEUR D'E-MAILS
   (migration …_courriels_expediteur) — pour que Maymar écrive depuis
   commandes@maymar.tn : le domaine s'ajoute chez le fournisseur (celui du
   secret COURRIELS_ENVOI, sa clé n'en sort jamais), qui répond par les
   enregistrements DNS à poser ; puis il les vérifie. On lit aussi le DNS
   public (cloudflare-dns.com) : la console dit quel enregistrement manque,
   sans attendre le fournisseur.
   · resend : l'API des domaines (une clé « Full access » ; une clé d'envoi
     seule ne gère pas les domaines : on le dit) ;
   · brevo : /v3/senders/domains ;
   · relais : en local, outils/resend-dev.mjs parle comme Resend ;
   · apercu : l'aperçu en ligne n'envoie rien — des enregistrements
     d'exemple, dits tels, et la lecture du DNS public pour de vrai.
   ========================================================================== */

export type Fournisseur = "resend" | "brevo" | "apercu" | "relais" | "aucun";
export type StatutDomaine = "en_attente" | "verifie" | "echec";
export type EtatDns = "ok" | "attente" | "echec";

export type Enregistrement = {
  /** SPF, DKIM, DMARC, Code Brevo… */
  role: string;
  type: string;
  /** Le nom complet (send.maymar.tn). */
  nom: string;
  valeur: string;
  priorite?: number | null;
  /** L'état chez le fournisseur (null : il ne le dit pas). */
  etat: EtatDns | null;
  /** Présent dans le DNS public ; null : pas lu (réseau, ou en local). */
  vu?: boolean | null;
  /** Conseillé (DMARC), pas exigé par le fournisseur. */
  conseille?: boolean;
  /** Une valeur d'exemple (l'aperçu en ligne) : à ne pas recopier. */
  exemple?: boolean;
};

export type EtatDomaine = { ref: string; statut: StatutDomaine; enregistrements: Enregistrement[] };
export type Reponse<T> = { ok: true; valeur: T } | { ok: false; raison: string };

export const LIBELLES_FOURNISSEUR: Record<Fournisseur, string> = {
  resend: "Resend", brevo: "Brevo", apercu: "Aperçu (rien ne part)", relais: "Relais local", aucun: "Aucun",
};

export function fournisseurCourant(): { fournisseur: Fournisseur; cle: string; expediteur: string } {
  const { fournisseur, cle, expediteur } = lireEnvoi(process.env.COURRIELS_ENVOI ?? "");
  const connu = (["resend", "brevo", "apercu", "relais"] as const).find((f) => f === fournisseur);
  return { fournisseur: connu ?? "aucun", cle, expediteur };
}

/** « send » sous maymar.tn : ce qu'on écrit dans la zone DNS (« @ » : le domaine lui-même). */
export function hoteRelatif(nom: string, domaine: string): string {
  const n = nom.toLowerCase().replace(/\.$/, "");
  if (n === domaine) return "@";
  return n.endsWith(`.${domaine}`) ? n.slice(0, -(domaine.length + 1)) : n;
}

const complet = (nom: string, domaine: string) => {
  const n = String(nom ?? "").toLowerCase().replace(/\.$/, "");
  if (!n || n === "@") return domaine;
  return n === domaine || n.endsWith(`.${domaine}`) ? n : `${n}.${domaine}`;
};

/** DMARC : demandé par Gmail et Yahoo aux expéditeurs ; conseillé s'il manque. */
function avecDmarc(liste: Enregistrement[], domaine: string): Enregistrement[] {
  if (liste.some((x) => x.nom === `_dmarc.${domaine}`)) return liste;
  return [...liste, { role: "DMARC", type: "TXT", nom: `_dmarc.${domaine}`, valeur: "v=DMARC1; p=none;", etat: null, conseille: true }];
}

// ---------------------------------------------------------------------------
// Resend (et le relais local, qui parle comme lui)
// ---------------------------------------------------------------------------
type DomaineResend = {
  id: string; name: string; status?: string;
  records?: { record?: string; name?: string; type?: string; value?: string; priority?: number | null; status?: string }[];
};

const etatResend = (s: string | undefined): EtatDns =>
  s === "verified" ? "ok" : s === "failed" ? "echec" : "attente";
const statutResend = (s: string | undefined): StatutDomaine =>
  s === "verified" ? "verifie" : s === "failed" ? "echec" : "en_attente";

function depuisResend(d: DomaineResend, domaine: string): EtatDomaine {
  return {
    ref: d.id,
    statut: statutResend(d.status),
    enregistrements: avecDmarc((d.records ?? []).map((r) => ({
      role: r.record ?? r.type ?? "",
      type: String(r.type ?? "TXT").toUpperCase(),
      nom: complet(r.name ?? "", domaine),
      valeur: String(r.value ?? ""),
      priorite: r.priority ?? null,
      etat: etatResend(r.status),
    })), domaine),
  };
}

async function resend(chemin: string, init: RequestInit = {}): Promise<Reponse<unknown>> {
  const { fournisseur, cle } = fournisseurCourant();
  const base = fournisseur === "relais"
    ? `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")}/email-dev/resend`
    : "https://api.resend.com";
  // (le relais local n'a pas de clé : « relais » seul)
  if (!cle && fournisseur !== "relais") return { ok: false, raison: "COURRIELS_ENVOI ne donne pas de clé" };
  try {
    const r = await fetch(`${base}${chemin}`, {
      ...init,
      headers: { authorization: `Bearer ${cle || "relais-local"}`, "content-type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
    const corps = await r.json().catch(() => null) as { message?: string } | null;
    if (r.ok) return { ok: true, valeur: corps };
    if (r.status === 401 || (r.status === 403 && !/already/i.test(corps?.message ?? ""))) {
      return { ok: false, raison: "La clé de Resend ne gère pas les domaines (clé d'envoi seule) : ajoutez le domaine dans Resend → Domains, puis « Vérifier » ici ; ou donnez une clé « Full access »." };
    }
    return { ok: false, raison: `Resend : ${corps?.message ?? `HTTP ${r.status}`}` };
  } catch (err) {
    return { ok: false, raison: `Resend injoignable : ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function trouverResend(domaine: string): Promise<Reponse<DomaineResend | null>> {
  const l = await resend("/domains");
  if (!l.ok) return l;
  const d = ((l.valeur as { data?: DomaineResend[] } | null)?.data ?? []).find((x) => x.name === domaine) ?? null;
  return { ok: true, valeur: d };
}

async function lireResend(ref: string | null, domaine: string): Promise<Reponse<EtatDomaine>> {
  let id = ref;
  if (!id) {
    const t = await trouverResend(domaine);
    if (!t.ok) return t;
    if (!t.valeur) return { ok: false, raison: `${domaine} n'est pas chez Resend : ajoutez-le d'abord.` };
    id = t.valeur.id;
  }
  const r = await resend(`/domains/${encodeURIComponent(id)}`);
  if (!r.ok) return r;
  return { ok: true, valeur: depuisResend(r.valeur as DomaineResend, domaine) };
}

// ---------------------------------------------------------------------------
// Brevo
// ---------------------------------------------------------------------------
type DomaineBrevo = {
  domain?: string; domain_name?: string; verified?: boolean; authenticated?: boolean;
  dns_records?: Record<string, { type?: string; value?: string; host_name?: string; status?: boolean }>;
};
const ROLES_BREVO: Record<string, string> = { dkim_record: "DKIM", brevo_code: "Code Brevo", dmarc_record: "DMARC", spf_record: "SPF" };

async function brevo(chemin: string, init: RequestInit = {}): Promise<Reponse<unknown>> {
  const { cle } = fournisseurCourant();
  if (!cle) return { ok: false, raison: "COURRIELS_ENVOI ne donne pas de clé" };
  try {
    const r = await fetch(`https://api.brevo.com/v3${chemin}`, {
      ...init,
      headers: { "api-key": cle, "content-type": "application/json", accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
    const corps = await r.json().catch(() => null) as { message?: string } | null;
    if (r.ok) return { ok: true, valeur: corps };
    if (r.status === 401) return { ok: false, raison: "La clé de Brevo est refusée." };
    return { ok: false, raison: `Brevo : ${corps?.message ?? `HTTP ${r.status}`}` };
  } catch (err) {
    return { ok: false, raison: `Brevo injoignable : ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function lireBrevo(domaine: string): Promise<Reponse<EtatDomaine>> {
  const r = await brevo(`/senders/domains/${encodeURIComponent(domaine)}`);
  if (!r.ok) return r;
  const d = r.valeur as DomaineBrevo;
  return {
    ok: true,
    valeur: {
      ref: d.domain_name ?? d.domain ?? domaine,
      statut: d.authenticated ? "verifie" : "en_attente",
      enregistrements: avecDmarc(Object.entries(d.dns_records ?? {}).map(([cle, x]) => ({
        role: ROLES_BREVO[cle] ?? cle,
        type: String(x.type ?? "TXT").toUpperCase(),
        nom: complet(x.host_name ?? "", domaine),
        valeur: String(x.value ?? ""),
        etat: x.status ? "ok" as const : "attente" as const,
      })), domaine),
    },
  };
}

// ---------------------------------------------------------------------------
// L'aperçu en ligne : des exemples, dits tels
// ---------------------------------------------------------------------------
function exemples(domaine: string): EtatDomaine {
  const ex = (x: Omit<Enregistrement, "etat" | "exemple">): Enregistrement => ({ ...x, etat: null, exemple: true });
  return {
    ref: `apercu:${domaine}`,
    statut: "en_attente",
    enregistrements: avecDmarc([
      ex({ role: "SPF", type: "MX", nom: `send.${domaine}`, valeur: "(donnée par le fournisseur en production)", priorite: 10 }),
      ex({ role: "SPF", type: "TXT", nom: `send.${domaine}`, valeur: "v=spf1 include:(fournisseur) ~all" }),
      ex({ role: "DKIM", type: "TXT", nom: `resend._domainkey.${domaine}`, valeur: "p=(la clé publique donnée par le fournisseur)" }),
    ], domaine),
  };
}

// ---------------------------------------------------------------------------
// Le DNS public : chaque enregistrement est-il posé ?
// ---------------------------------------------------------------------------
const normal = (x: string) => x.toLowerCase().replace(/"\s*"/g, "").replace(/["\s]/g, "").replace(/\.$/, "");

async function lu(e: Enregistrement): Promise<boolean | null> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(e.nom)}&type=${encodeURIComponent(e.type)}`, {
      headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(3_000),
    });
    if (!r.ok) return null;
    const j = await r.json() as { Answer?: { data?: string }[] };
    const valeurs = (j.Answer ?? []).map((a) => normal(String(a.data ?? "")));
    if (e.conseille && e.role === "DMARC") return valeurs.some((v) => v.startsWith("v=dmarc1"));
    if (e.exemple) return valeurs.length > 0 ? null : false;
    const attendu = normal(e.valeur);
    // Un MX se lit « 10 feedback-smtp… » : la priorité devant.
    return valeurs.some((v) => v === attendu || v.endsWith(attendu));
  } catch {
    return null;
  }
}

async function avecLecture(etat: EtatDomaine, fournisseur: Fournisseur): Promise<EtatDomaine> {
  if (fournisseur === "relais") return etat;
  const vus = await Promise.all(etat.enregistrements.map(lu));
  return { ...etat, enregistrements: etat.enregistrements.map((e, i) => ({ ...e, vu: vus[i] })) };
}

// ---------------------------------------------------------------------------
// Ce que la console appelle
// ---------------------------------------------------------------------------
const SANS_FOURNISSEUR = "Aucun fournisseur d'e-mails n'est branché (COURRIELS_ENVOI) : rien ne peut partir d'un domaine.";

/** Ajouter le domaine chez le fournisseur (ou le retrouver, s'il y est déjà). */
export async function ajouterDomaine(domaine: string): Promise<Reponse<EtatDomaine>> {
  const { fournisseur } = fournisseurCourant();
  switch (fournisseur) {
    case "resend":
    case "relais": {
      const t = await trouverResend(domaine);
      if (!t.ok) return t;
      if (t.valeur) return lireResend(t.valeur.id, domaine);
      const c = await resend("/domains", { method: "POST", body: JSON.stringify({ name: domaine, region: "eu-west-1" }) });
      if (!c.ok) return c;
      return { ok: true, valeur: depuisResend(c.valeur as DomaineResend, domaine) };
    }
    case "brevo": {
      const c = await brevo("/senders/domains", { method: "POST", body: JSON.stringify({ name: domaine }) });
      if (!c.ok && !/exist/i.test(c.raison)) return c;
      return lireBrevo(domaine);
    }
    case "apercu":
      return { ok: true, valeur: exemples(domaine) };
    default:
      return { ok: false, raison: SANS_FOURNISSEUR };
  }
}

/** Demander la vérification au fournisseur, puis lire l'état (et le DNS public). */
export async function verifierDomaine(ref: string | null, domaine: string): Promise<Reponse<EtatDomaine>> {
  const { fournisseur } = fournisseurCourant();
  let etat: Reponse<EtatDomaine>;
  switch (fournisseur) {
    case "resend":
    case "relais": {
      const lecture = await lireResend(ref, domaine);
      if (!lecture.ok) return lecture;
      const v = await resend(`/domains/${encodeURIComponent(lecture.valeur.ref)}/verify`, { method: "POST" });
      if (!v.ok) return v;
      etat = await lireResend(lecture.valeur.ref, domaine);
      break;
    }
    case "brevo": {
      const v = await brevo(`/senders/domains/${encodeURIComponent(domaine)}/authenticate`, { method: "PUT" });
      if (!v.ok && !/authenticat/i.test(v.raison)) return v;
      etat = await lireBrevo(domaine);
      break;
    }
    case "apercu":
      etat = { ok: true, valeur: exemples(domaine) };
      break;
    default:
      return { ok: false, raison: SANS_FOURNISSEUR };
  }
  if (!etat.ok) return etat;
  return { ok: true, valeur: await avecLecture(etat.valeur, fournisseur) };
}

/** L'état du domaine de l'adresse d'expédition de la plateforme, chez le fournisseur. */
export async function domainePlateforme(): Promise<{ domaine: string | null; statut: StatutDomaine | null; raison: string | null }> {
  const { fournisseur, expediteur } = fournisseurCourant();
  const domaine = expediteur.split("@")[1]?.toLowerCase() || null;
  if (!domaine || (fournisseur !== "resend" && fournisseur !== "brevo")) return { domaine, statut: null, raison: null };
  const r = fournisseur === "resend" ? await lireResend(null, domaine) : await lireBrevo(domaine);
  return r.ok ? { domaine, statut: r.valeur.statut, raison: null } : { domaine, statut: null, raison: r.raison };
}
