import { clientService } from "./service";

/* ============================================================================
   SKANFACT — LA FACTURATION DES CLIENTS DE SKANECOM (cadrage 06, D20).
   Les factures se font dans SkanFact ; la console les lit par son API
   (brique 127 de la plateforme, docs/api-situation.md) et ne calcule rien :
   un montant est celui que SkanFact a dit, en texte décimal ("1073.190"),
   jamais repassé par un nombre à virgule.

   Trois secrets du Worker (jamais dans le navigateur ni dans le dépôt) :
   SKANFACT_URL (l'adresse de SkanFact), SKANFACT_ENTREPRISE (l'entreprise
   SkanEcom dans SkanFact) et SKANFACT_CLE (une clé de cette entreprise qui
   n'a que le geste ventes.pieces.voir). Sans eux (ou « aucune », comme sur
   l'aperçu en ligne), la console le dit et ne lit rien. En local, SkanFact
   est simulé par le relais (outils/skanfact-dev.mjs).
   ========================================================================== */

export type ConfigSkanFact = { url: string; entreprise: string; cle: string };

export function configSkanFact(): ConfigSkanFact | null {
  const url = (process.env.SKANFACT_URL ?? "").trim().replace(/\/+$/, "");
  const entreprise = (process.env.SKANFACT_ENTREPRISE ?? "").trim();
  const cle = (process.env.SKANFACT_CLE ?? "").trim();
  return /^https?:\/\/[^/]/.test(url) && entreprise && cle ? { url, entreprise, cle } : null;
}

/** S1 — un client de l'entreprise, tel que SkanFact le range. */
export type ClientSkanFact = {
  id: string;
  raison_sociale: string;
  nature: string | null;
  identifiant: string | null;
  pays: string | null;
  devise: string | null;
  ecran: string | null;
};

/** S2 — une facture qui reste à payer. */
export type FactureAPayer = {
  id: string;
  numero: string | null;
  datePiece: string;
  echeance: string | null;
  devise: string;
  symbole: string | null;
  netAPayer: string;
  reste: string;
  clientId: string;
  client: string | null;
  objet: string | null;
  ecran: string | null;
};

/** S3 — la situation d'un client, un jour donné (à Tunis). */
export type SituationSkanFact = {
  client: { id: string; raisonSociale: string; identifiant: string | null; ecran: string | null };
  au: string;
  soldes: { devise: string; reste: string; echu: string; facturesAPayer: number; facturesEchues: number }[];
  retard: { depuis: string; jours: number; numero: string | null; ecran: string | null } | null;
  dernierReglement: { date: string; montant: string; devise: string; facture: string | null } | null;
};

export type Lecture<T> = { ok: true; donnees: T } | { ok: false; statut: number; raison: string };

const DELAI_MS = 6000;
const RAISONS: Record<number, string> = {
  0: "SkanFact ne répond pas",
  401: "SkanFact refuse la clé de la console (révoquée, ou mal posée dans SKANFACT_CLE)",
  403: "La clé de la console n'a pas le droit de lire les ventes dans SkanFact (geste ventes.pieces.voir)",
  404: "Introuvable dans l'entreprise SkanEcom de SkanFact",
  429: "Trop d'appels à SkanFact : réessayez dans une minute",
};

async function appel<T>(c: ConfigSkanFact, chemin: string): Promise<Lecture<T>> {
  let r: Response;
  try {
    r = await fetch(`${c.url}/v1/entreprises/${encodeURIComponent(c.entreprise)}${chemin}`, {
      headers: { authorization: `Bearer ${c.cle}`, accept: "application/json" },
      signal: AbortSignal.timeout(DELAI_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, statut: 0, raison: RAISONS[0] };
  }
  if (!r.ok) {
    const raison = RAISONS[r.status] ?? (r.status >= 500 ? `SkanFact ne répond pas pour l'instant (erreur ${r.status})` : `SkanFact a refusé la lecture (erreur ${r.status})`);
    return { ok: false, statut: r.status, raison };
  }
  try {
    return { ok: true, donnees: (await r.json()) as T };
  } catch {
    return { ok: false, statut: 502, raison: "La réponse de SkanFact est illisible" };
  }
}

/** S1 — les clients qui ont ce matricule (espaces et casse ignorés par SkanFact). */
export async function chercherClients(c: ConfigSkanFact, identifiant: string): Promise<Lecture<ClientSkanFact[]>> {
  const r = await appel<{ clients: ClientSkanFact[] }>(c, `/clients?identifiant=${encodeURIComponent(identifiant)}`);
  return r.ok ? { ok: true, donnees: r.donnees.clients ?? [] } : r;
}

/** S3 — la situation d'un client (404 : ce n'est pas un client de l'entreprise). */
export function situationDe(c: ConfigSkanFact, client: string): Promise<Lecture<SituationSkanFact>> {
  return appel<SituationSkanFact>(c, `/clients/${encodeURIComponent(client)}/situation`);
}

const PAGES_MAX = 5;

/** S2 — toutes ses factures à payer, les plus récentes d'abord (cinq pages de 200 au plus). */
export async function facturesAPayer(c: ConfigSkanFact, client: string): Promise<Lecture<FactureAPayer[]>> {
  const toutes: FactureAPayer[] = [];
  let avant: string | null = null;
  for (let page = 0; page < PAGES_MAX; page++) {
    const q = new URLSearchParams({ type: "facture", client, aPayer: "1", limite: "200" });
    if (avant) q.set("avant", avant);
    const r: Lecture<{ lignes: FactureAPayer[]; suite: string | null }> = await appel(c, `/ventes?${q}`);
    if (!r.ok) return r;
    toutes.push(...(r.donnees.lignes ?? []));
    avant = r.donnees.suite;
    if (!avant) break;
  }
  return { ok: true, donnees: toutes };
}

/** Ce que la console garde d'une facture : de quoi la montrer, rien de plus. */
const gardee = (f: FactureAPayer): FactureAPayer => ({
  id: f.id, numero: f.numero, datePiece: f.datePiece, echeance: f.echeance, devise: f.devise, symbole: f.symbole,
  netAPayer: f.netAPayer, reste: f.reste, clientId: f.clientId, client: f.client, objet: f.objet, ecran: f.ecran,
});

/** Relire la situation et les factures d'un client, et les garder pour sa boutique. */
export async function relire(
  c: ConfigSkanFact, boutiqueId: string, client: string,
): Promise<Lecture<{ situation: SituationSkanFact; factures: FactureAPayer[] }>> {
  const [s, f] = await Promise.all([situationDe(c, client), facturesAPayer(c, client)]);
  if (!s.ok) return s;
  if (!f.ok) return f;
  const factures = f.donnees.map(gardee);
  const { error } = await clientService().rpc("console_garder_situation", {
    p_boutique_id: boutiqueId, p_client: client, p_situation: s.donnees, p_factures: factures,
  });
  if (error) return { ok: false, statut: 500, raison: `La situation n'a pas pu être gardée : ${error.message}` };
  return { ok: true, donnees: { situation: s.donnees, factures } };
}

/** S5 — l'écran de SkanFact derrière un lien relatif ; jamais une autre adresse. */
export function lienEcran(c: ConfigSkanFact, ecran: string | null | undefined): string | null {
  return ecran && /^\/(?!\/)/.test(ecran) ? `${c.url}${ecran}` : null;
}

/** L'accueil de l'entreprise SkanEcom dans SkanFact. */
export const accueilSkanFact = (c: ConfigSkanFact) => `${c.url}/v10/?e=${encodeURIComponent(c.entreprise)}`;

/* ---------------------------------------------------------------- lecture */

const SYMBOLES: Record<string, string> = { TND: "DT", EUR: "€", USD: "$" };

/** « 1073.190 » en dinars → « 1 073,190 DT », sans passer par un nombre à virgule. */
export function montant(texte: string | null | undefined, devise = "TND"): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(texte ?? "").trim());
  const symbole = SYMBOLES[devise] ?? devise;
  if (!m) return `${texte ?? "—"} ${symbole}`;
  const entiers = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${m[1] ? "−" : ""}${entiers}${m[3] ? `,${m[3]}` : ""} ${symbole}`;
}

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** « 2026-09-15 » → « 15 sept. 2026 » (un jour du calendrier, pas un instant). */
export function jourLisible(jour: string | null | undefined): string {
  if (!jour || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) return "—";
  return JOUR.format(new Date(`${jour}T00:00:00Z`));
}

const AUJOURDHUI = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis", year: "numeric", month: "2-digit", day: "2-digit" });

/** Les jours écoulés depuis un jour du calendrier, à Tunis (0 le jour même). */
export function joursDepuis(jour: string, maintenant: number): number {
  const auj = AUJOURDHUI.format(new Date(maintenant));
  return Math.round((Date.parse(`${auj}T00:00:00Z`) - Date.parse(`${jour}T00:00:00Z`)) / 86_400_000);
}

/** Au-delà, une facture échue passe dans « À surveiller » (cadrage 06 § 5 : à confirmer par Skander). */
export const SEUIL_RETARD_JOURS = 15;
