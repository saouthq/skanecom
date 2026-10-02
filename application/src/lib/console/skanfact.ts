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

/** L'adresse de SkanFact seule (les commerçants y facturent avec leur propre entreprise et leur clé). */
export function adresseSkanFact(): string | null {
  const url = (process.env.SKANFACT_URL ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/]/.test(url) ? url : null;
}

/* SKANECOM, PARTENAIRE DÉCLARÉ DE SKANFACT (B0, « Connecter SkanFact ») :
   le secret de SkanEcom (SKANFACT_SECRET, 32 octets tirés au hasard, posé
   une fois dans les secrets du Worker — jamais dans le dépôt ni dans le
   navigateur) et l'adresse exacte de la page de retour. SkanFact ne garde
   que l'EMPREINTE du secret (SHA-256) et l'adresse : la console les montre
   à l'administrateur, pour qu'il les lui transmette. */
export function secretPartenaire(): string | null {
  const s = (process.env.SKANFACT_SECRET ?? "").trim();
  return s.length >= 32 ? s : null;
}

/** Le cookie qui garde l'état de « Connecter SkanFact » dans le navigateur du commerçant (dix minutes). */
export const COOKIE_ETAT_SKANFACT = "skanecom_skanfact_etat";

/** L'adresse exacte (sans paramètres) où SkanFact renvoie le commerçant : la console, /skanfact/retour. */
export function adresseRetourSkanFact(): string | null {
  const hote = (process.env.NEXT_PUBLIC_CONSOLE_HOTE ?? "").trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(hote)) return null;
  const local = hote === "localhost" || hote.endsWith(".localhost");
  return local ? `http://${hote}:${process.env.PORT || "4200"}/skanfact/retour` : `https://${hote}/skanfact/retour`;
}

/** L'empreinte du secret, telle que `printf %s "$SECRET" | sha256sum` la donne. */
export async function empreinteSecret(): Promise<string | null> {
  const s = secretPartenaire();
  if (!s) return null;
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((o) => o.toString(16).padStart(2, "0")).join("");
}

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

/** S8 — un contrat d'abonnement (« Facturation récurrente »), les prix HT en texte. */
export type ContratSkanFact = {
  id: string;
  client: string | null;
  objet: string;
  periode: "mois" | "trimestre" | "annee";
  jour: number;
  prochaine: string;
  derniere: string | null;
  actif: boolean;
  emettreSeul: boolean;
  refus: { le: string; echeance: string; motif: string } | null;
  lignes: { designation: string; quantite: string; prixUnitaire: string; tauxTva: string }[];
  ecran: string | null;
};

export type CorpsContrat = {
  client: string;
  objet: string;
  periode: ContratSkanFact["periode"];
  prochaine: string;
  lignes: { designation: string; quantite: string; prixUnitaire: string; tauxTva: string }[];
  emettreSeul: boolean;
};

export type Lecture<T> = { ok: true; donnees: T } | { ok: false; statut: number; raison: string };

const DELAI_MS = 6000;
// Une écriture attend plus longtemps : un contrat créé sans réponse se retrouve dans la liste du client.
const DELAI_ECRITURE_MS = 12000;
const RAISONS: Record<number, string> = {
  0: "SkanFact ne répond pas",
  401: "SkanFact refuse la clé de la console (révoquée, ou mal posée dans SKANFACT_CLE)",
  403: "La clé de la console n'a pas le droit de lire les ventes dans SkanFact (geste ventes.pieces.voir)",
  404: "Introuvable dans l'entreprise SkanEcom de SkanFact",
  429: "Trop d'appels à SkanFact : réessayez dans une minute",
};

type Ecriture = { methode: "POST" | "PUT"; corps?: unknown; refus: string };

async function appel<T>(c: ConfigSkanFact, chemin: string, ecriture?: Ecriture): Promise<Lecture<T>> {
  let r: Response;
  try {
    r = await fetch(`${c.url}/v1/entreprises/${encodeURIComponent(c.entreprise)}${chemin}`, {
      method: ecriture?.methode ?? "GET",
      headers: {
        authorization: `Bearer ${c.cle}`, accept: "application/json",
        ...(ecriture?.corps !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: ecriture?.corps !== undefined ? JSON.stringify(ecriture.corps) : undefined,
      signal: AbortSignal.timeout(ecriture ? DELAI_ECRITURE_MS : DELAI_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, statut: 0, raison: RAISONS[0] };
  }
  if (!r.ok) {
    let champ: string | null = null;
    try {
      champ = ((await r.json()) as { champ?: string }).champ ?? null;
    } catch {
      // pas de corps lisible
    }
    const raison = r.status === 403 && ecriture ? ecriture.refus
      : r.status === 400 && champ ? `SkanFact refuse le champ « ${champ} »`
      : RAISONS[r.status] ?? (r.status >= 500 ? `SkanFact ne répond pas pour l'instant (erreur ${r.status})` : `SkanFact a refusé (erreur ${r.status})`);
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

const REFUS_CONTRAT = "La clé de la console n'a pas le droit de créer ou de changer un contrat dans SkanFact "
  + "(geste ventes.contrat.modifier ; « Émise seule » demande une clé créée par le propriétaire ou un administrateur)";

/** S8 — les contrats d'abonnement d'un client. */
export async function contratsDuClient(c: ConfigSkanFact, client: string): Promise<Lecture<ContratSkanFact[]>> {
  const r = await appel<{ contrats: ContratSkanFact[] }>(c, `/contrats?client=${encodeURIComponent(client)}`);
  return r.ok ? { ok: true, donnees: r.donnees.contrats ?? [] } : r;
}

/** S8 — créer le contrat d'abonnement d'un client. */
export function creerContrat(c: ConfigSkanFact, corps: CorpsContrat): Promise<Lecture<ContratSkanFact>> {
  return appel<ContratSkanFact>(c, "/contrats", { methode: "POST", corps, refus: REFUS_CONTRAT });
}

/** S8 — suspendre ou reprendre un contrat (repris, il ne facture pas les échéances passées). */
export function changerContrat(c: ConfigSkanFact, contrat: string, geste: "suspendre" | "reprendre"): Promise<Lecture<ContratSkanFact>> {
  return appel<ContratSkanFact>(c, `/contrats/${encodeURIComponent(contrat)}/${geste}`, { methode: "POST", refus: REFUS_CONTRAT });
}

export const PERIODES: Record<ContratSkanFact["periode"], string> = { mois: "chaque mois", trimestre: "chaque trimestre", annee: "chaque année" };

/** Un prix HT de SkanFact (jusqu'à six décimales) au millime : « 75.5 » → « 75.500 » ; au-delà du
 *  millime, seuls des zéros s'ôtent (« 210.084034 » reste exact). */
export function prixHT(texte: string): string {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(texte.trim());
  if (!m) return texte;
  const decimales = (m[2] ?? "").replace(/0+$/, "");
  return `${m[1]}.${decimales.length > 3 ? decimales : decimales.padEnd(3, "0")}`;
}

/** L'objet d'un contrat, ses marques lisibles : « {mois} » → « ‹mois› ». */
export const objetLisible = (objet: string) => objet.replaceAll("{mois}", "‹mois›").replaceAll("{annee}", "‹année›");

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
export function montant(texte: string | null | undefined, devise = "TND", symboleImpose?: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(texte ?? "").trim());
  const symbole = symboleImpose ?? SYMBOLES[devise] ?? devise;
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
