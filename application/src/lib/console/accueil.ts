import type { LignePilotage, Vigilance } from "./pilotage";

/* ============================================================================
   L'ACCUEIL DE LA CONSOLE — ce qu'on fait de la liste des boutiques et des
   signaux : les filtres et le tri (la page et son export disent la même
   chose), « À surveiller » rangé (l'urgent d'abord, les simples
   informations regroupées par genre, ce qu'on a mis à plus tard à part).
   ========================================================================== */

/** Les filtres de la liste : par défaut, les boutiques en activité (les fermées à part). */
export const STATUTS_FILTRE = [
  { cle: "", titre: "En activité" },
  { cle: "active", titre: "Ouvertes" },
  { cle: "en_preparation", titre: "En préparation" },
  { cle: "suspendue", titre: "Suspendues" },
  { cle: "fermee", titre: "Fermées" },
  { cle: "toutes", titre: "Tout statut" },
] as const;

export const TRIS = [
  { cle: "", titre: "Ce qui attend d'abord" },
  { cle: "nom", titre: "Nom, de A à Z" },
  { cle: "commandes", titre: "Commandes sur 7 jours" },
  { cle: "recentes", titre: "Les plus récentes" },
  { cle: "mise-en-place", titre: "Mise en place à finir" },
] as const;

export type Filtres = { q: string; statut: string; formule: string; type: "" | "clientes" | "demos"; tri: string };

/** Pour chercher sans se soucier des accents ni des majuscules. */
export const plat = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Les filtres lus dans l'adresse (?q=&statut=&formule=&type=&tri=), bornés à ce qui existe. */
export function lisFiltres(p: Record<string, string | undefined>, formulesConnues: string[]): Filtres {
  return {
    q: (p.q ?? "").trim().slice(0, 80),
    statut: STATUTS_FILTRE.find((x) => x.cle === p.statut)?.cle ?? "",
    formule: p.formule === "sur-mesure" || formulesConnues.includes(p.formule ?? "") ? (p.formule as string) : "",
    type: p.type === "clientes" || p.type === "demos" ? p.type : "",
    tri: TRIS.find((x) => x.cle === p.tri)?.cle ?? "",
  };
}

/** Les mêmes filtres, remis dans une adresse (vue, export). */
export function parametres(f: Filtres, en: Record<string, string> = {}): string {
  const u = new URLSearchParams(en);
  for (const [k, v] of Object.entries({ q: f.q, statut: f.statut, formule: f.formule, type: f.type, tri: f.tri })) if (v) u.set(k, v);
  const t = u.toString();
  return t ? `?${t}` : "";
}

export function filtreBoutiques(boutiques: LignePilotage[], f: Filtres, codeFormuleDe: Map<string, string | null>): LignePilotage[] {
  return boutiques.filter((b) =>
    (f.statut === "toutes" ? true : f.statut === "" ? b.statut !== "fermee" : b.statut === f.statut)
    && (f.type === "" || (f.type === "demos") === b.demonstration)
    && (f.formule === "" || (f.formule === "sur-mesure" ? !codeFormuleDe.get(b.id) : codeFormuleDe.get(b.id) === f.formule))
    && (f.q === "" || [b.nom, b.slug, b.hote ?? ""].some((t) => plat(t).includes(plat(f.q)))));
}

const RANG = { urgent: 0, attention: 1, info: 2 } as const;

/** Le tri des tuiles et de la liste. Par défaut, ce qui attend d'abord : la
 *  boutique au signal le plus grave, puis celle qui a le plus de commandes à
 *  confirmer, puis l'ordre alphabétique. */
export function trieBoutiques(liste: LignePilotage[], tri: string, signaux: Vigilance[]): LignePilotage[] {
  const parNom = (a: LignePilotage, b: LignePilotage) => a.nom.localeCompare(b.nom, "fr");
  const avancement = (b: LignePilotage) => b.mise_en_place.faites / Math.max(1, b.mise_en_place.total);
  const pire = new Map<string, number>();
  for (const v of signaux) if (v.boutique) pire.set(v.boutique.id, Math.min(pire.get(v.boutique.id) ?? 9, RANG[v.niveau]));
  const l = [...liste];
  switch (tri) {
    case "nom": return l.sort(parNom);
    case "commandes": return l.sort((a, b) => b.commandes.semaine - a.commandes.semaine || b.commandes.encaisse_semaine - a.commandes.encaisse_semaine || parNom(a, b));
    case "recentes": return l.sort((a, b) => b.creee_le.localeCompare(a.creee_le) || parNom(a, b));
    case "mise-en-place": return l.sort((a, b) => avancement(a) - avancement(b) || parNom(a, b));
    default: return l.sort((a, b) => (pire.get(a.id) ?? 9) - (pire.get(b.id) ?? 9) || b.commandes.a_confirmer - a.commandes.a_confirmer || parNom(a, b));
  }
}

/** Ce que rend public.console_vigilances_reportees : un signal mis à plus tard. */
export type Reportee = { cle: string; niveau: Vigilance["niveau"]; jusqua: string; par: string | null };

/** Les simples informations, regroupées : une ligne par genre, les boutiques à la suite. */
export const GROUPES_INFO: Record<string, string> = {
  formule: "Ouvertes sans formule : tout leur est ouvert",
  "sans-client": "Ouvertes sans client SkanFact : leurs factures ne se suivent pas ici",
  preparation: "En préparation",
  suspendue: "Suspendues : leur vitrine est fermée",
  avis: "Des avis à relire avant publication",
};

/** Le même genre, en deux mots, pour le résumé replié (« sans formule (2) »). */
export const GROUPES_INFO_COURT: Record<string, string> = {
  formule: "sans formule",
  "sans-client": "sans client SkanFact",
  preparation: "en préparation",
  suspendue: "suspendues",
  avis: "avis à relire",
};

export type GroupeInfo = { type: string; titre: string; signaux: Vigilance[] };

/** « À surveiller », rangé : ce qui presse (urgent, puis à surveiller), les
 *  informations par genre, et ce qu'on a reporté. Un signal reporté se tait
 *  jusqu'à la date dite — sauf s'il s'est aggravé depuis : il revient. */
export function rangeVigilances(signaux: Vigilance[], reportees: Reportee[]): {
  pressants: Vigilance[];
  infos: GroupeInfo[];
  reportes: (Vigilance & { jusqua: string; par: string | null })[];
} {
  const tus = new Map(reportees.map((r) => [r.cle, r]));
  const pressants: Vigilance[] = [];
  const reportes: (Vigilance & { jusqua: string; par: string | null })[] = [];
  const infos = new Map<string, Vigilance[]>();
  for (const v of signaux) {
    const r = tus.get(v.cle);
    if (r && RANG[v.niveau] >= RANG[r.niveau]) { reportes.push({ ...v, jusqua: r.jusqua, par: r.par }); continue; }
    if (v.niveau === "info") { infos.set(v.type, [...(infos.get(v.type) ?? []), v]); continue; }
    pressants.push(v);
  }
  return {
    pressants,
    infos: [...infos].map(([type, liste]) => ({ type, titre: GROUPES_INFO[type] ?? "", signaux: liste })),
    reportes,
  };
}

/** Le compteur de la navigation : ce qui presse, hors reporté ; rouge s'il y a de l'urgent. */
export function compteAlertes(pressants: Vigilance[]): { n: number; urgent: boolean } {
  return { n: pressants.length, urgent: pressants.some((v) => v.niveau === "urgent") };
}
