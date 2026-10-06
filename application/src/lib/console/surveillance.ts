import { clientService } from "@/lib/console/service";
import { hoteLocal, phraseErreur } from "@/lib/console/etat";
import { verifierDomaine } from "@/lib/courriels/domaines";

/* ============================================================================
   LA SURVEILLANCE (migration …_surveillance) — chaque heure (le déclencheur
   planifié du Worker, src/worker.ts), ou d'un geste dans la console (État
   technique → Vérifier maintenant).
   · chaque vitrine ouverte : la page d'accueil répond-elle, en combien de
     temps ? (https : une page qui s'ouvre a son certificat) ;
   · le domaine d'envoi propre à une boutique, une fois par jour, chez le
     fournisseur d'e-mails ;
   · la base compte d'elle-même les files (e-mails de commande, SkanFact).
   Ce module ne parle qu'au service (clé de service) : il est appelé par une
   route de la console qui a vérifié l'administrateur, ou par le Worker.
   ========================================================================== */

/** Au-delà, une page « répond lentement » (le signal reste ambre). */
export const SEUIL_LENT_MS = 3000;
const ATTENTE_MS = 10_000;
const PAR_VAGUE = 8;

type AVerifier = {
  hotes: { boutique_id: string; hote: string; principal: boolean }[];
  domaines_envoi: { boutique_id: string; domaine: string; fournisseur: string | null; ref: string | null }[];
};

export type Releve = {
  genre: "page" | "domaine_envoi";
  boutique_id: string;
  cible: string;
  ok: boolean;
  lent?: boolean;
  duree_ms?: number;
  statut_http?: number;
  detail?: string | null;
  /** Une erreur de certificat (le domaine passe « sans certificat valable »). */
  certificat?: boolean;
  /** L'état chez le fournisseur, pour un domaine d'envoi. */
  statut?: string;
};

export type Bilan = { passage: number; verifies: number; defauts: number; pannes: number };

/** La vitrine d'un hôte : son accueil, sans suivre de redirection (une
 *  redirection est une réponse : l'hôte secondaire vers le principal). Sur
 *  le poste de développement, par le relais, qui ouvre la vitrine du poste
 *  sous cet hôte : « .localhost » ne se résout pas depuis le Worker, et un
 *  vrai domaine (acheté ou branché par les simulateurs) ne mène pas au poste. */
async function verifierPage(h: AVerifier["hotes"][number]): Promise<Releve | null> {
  const local = hoteLocal(h.hote);
  const relais = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const poste = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(relais);
  // Un hôte « .localhost » hors du poste (l'aperçu en ligne) : rien à ouvrir.
  if (local && !poste) return null;
  const url = poste ? `${relais}/vitrine-locale/${h.hote}/` : `https://${h.hote}/`;
  const debut = Date.now();
  try {
    const r = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "SkanEcom-surveillance/1" },
      signal: AbortSignal.timeout(ATTENTE_MS),
    });
    const duree = Date.now() - debut;
    await r.body?.cancel().catch(() => {});
    const ok = r.status < 400;
    const lent = ok && duree > SEUIL_LENT_MS;
    return {
      genre: "page", boutique_id: h.boutique_id, cible: h.hote, ok, lent, duree_ms: duree, statut_http: r.status,
      detail: !ok ? `La vitrine répond ${r.status}` : lent ? `Lente : ${(duree / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s` : null,
    };
  } catch (e) {
    const phrase = phraseErreur(e).replace("8 secondes", `${ATTENTE_MS / 1000} secondes`);
    return { genre: "page", boutique_id: h.boutique_id, cible: h.hote, ok: false, duree_ms: Date.now() - debut, detail: phrase, certificat: /certificat/i.test(phrase) };
  }
}

/** Le domaine d'envoi d'une boutique, chez le fournisseur. Un fournisseur qui
 *  ne répond pas ne dit rien du domaine : pas de relevé (on n'éteint pas un
 *  domaine pour une panne qui n'est pas la sienne). */
async function verifierEnvoi(d: AVerifier["domaines_envoi"][number]): Promise<Releve | null> {
  const r = await verifierDomaine(d.ref, d.domaine);
  if (!r.ok) return null;
  const ok = r.valeur.statut === "verifie";
  return {
    genre: "domaine_envoi", boutique_id: d.boutique_id, cible: d.domaine, ok, statut: r.valeur.statut,
    detail: ok ? null : r.valeur.statut === "en_attente" ? "Plus vérifié chez le fournisseur (en attente)" : "Vérification perdue chez le fournisseur",
  };
}

async function parVagues<T, R>(elements: T[], f: (x: T) => Promise<R>): Promise<R[]> {
  const sortie: R[] = [];
  for (let i = 0; i < elements.length; i += PAR_VAGUE) sortie.push(...(await Promise.all(elements.slice(i, i + PAR_VAGUE).map(f))));
  return sortie;
}

/** Un passage complet : vérifier, puis tout noter d'un coup. `acteur` :
 *  l'administrateur qui l'a demandé, ou null (le passage de l'heure). */
export async function lancerSurveillance(declencheur: "heure" | "console", acteur: string | null, ip?: string | null):
  Promise<{ ok: true; bilan: Bilan } | { ok: false; raison: string }> {
  const service = clientService(ip);
  const debut = new Date().toISOString();
  const { data, error } = await service.rpc("surveillance_a_verifier");
  if (error) return { ok: false, raison: error.message };
  const a = data as AVerifier;
  const pages = (await parVagues(a.hotes.slice(0, 200), verifierPage)).filter((x): x is Releve => x !== null);
  const envois = (await parVagues(a.domaines_envoi.slice(0, 50), verifierEnvoi)).filter((x): x is Releve => x !== null);
  const { data: bilan, error: e2 } = await service.rpc("surveillance_noter", {
    p_acteur: acteur, p_declencheur: declencheur, p_debut: debut, p_releves: [...pages, ...envois],
  });
  if (e2) return { ok: false, raison: e2.message };
  return { ok: true, bilan: bilan as Bilan };
}

/* ---- Ce que la console en lit (public.console_surveillance) ---- */

export type ReleveLu = {
  boutique_id: string | null; boutique: string | null; slug: string | null;
  genre: "page" | "courriels" | "skanfact" | "domaine_envoi"; cible: string; ok: boolean; lent: boolean;
  duree_ms: number | null; statut_http: number | null; detail: string | null;
};
export type DonneesSurveillance = {
  dernier: { id: number; debut: string; fin: string | null; declencheur: "heure" | "console"; verifies: number; defauts: number; releves: ReleveLu[] } | null;
  derniere_heure: string | null;
  disponibilite: { cible: string; boutique: string; slug: string; releves: number; ok: number; duree_mediane: number | null }[];
  passages: { debut: string; declencheur: "heure" | "console"; verifies: number; defauts: number; pannes: number }[];
};

export const LIBELLES_GENRE: Record<ReleveLu["genre"], string> = {
  page: "Vitrine", courriels: "E-mails de commande", skanfact: "SkanFact", domaine_envoi: "Domaine d'envoi",
};

/** Le passage de l'heure ne tourne plus : le dernier date de plus de deux heures. */
export function surveillanceMuette(d: Pick<DonneesSurveillance, "derniere_heure">, maintenant = new Date()): boolean {
  return Boolean(d.derniere_heure) && maintenant.getTime() - new Date(d.derniere_heure!).getTime() > 2 * 3600_000;
}
