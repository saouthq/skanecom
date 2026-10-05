import { numeroLisible } from "@/lib/legal";

/* ============================================================================
   LES PROSPECTS — les commerces à qui SkanEcom veut vendre
   (supabase/migrations/…_console_prospects.sql) : leurs étapes, d'où ils
   viennent, et ce que la page en tire (ce qui est à relancer).
   ========================================================================== */

export type EtapeProspect = "a_contacter" | "contacte" | "demo" | "offre" | "gagne" | "perdu";

export type Prospect = {
  id: string;
  nom: string;
  contact_nom: string | null;
  telephone: string | null;
  email: string | null;
  ville: string | null;
  metier: string | null;
  metier_nom: string | null;
  source: string;
  etape: EtapeProspect;
  prochaine_action: string | null;
  prochaine_le: string | null;
  motif_perte: string | null;
  note: string | null;
  boutique: { slug: string; nom: string } | null;
  cree_le: string;
  modifie_le: string;
  par: string | null;
};

/** Les étapes, dans l'ordre d'une vente. */
export const ETAPES_PROSPECT: { code: EtapeProspect; libelle: string; court: string }[] = [
  { code: "a_contacter", libelle: "À contacter", court: "À contacter" },
  { code: "contacte", libelle: "Contacté", court: "Contactés" },
  { code: "demo", libelle: "Démonstration montrée", court: "Démo" },
  { code: "offre", libelle: "Offre faite", court: "Offre" },
  { code: "gagne", libelle: "Gagné", court: "Gagnés" },
  { code: "perdu", libelle: "Perdu", court: "Perdus" },
];

export const LIBELLE_ETAPE = Object.fromEntries(ETAPES_PROSPECT.map((e) => [e.code, e.libelle])) as Record<EtapeProspect, string>;

export const SOURCES_PROSPECT: Record<string, string> = {
  bouche_a_oreille: "Bouche-à-oreille",
  reseaux: "Réseaux sociaux",
  salon: "Salon, foire",
  demarchage: "Démarchage",
  site: "Le site de SkanEcom",
  autre: "Autre",
};

export const enCours = (p: Prospect) => p.etape !== "gagne" && p.etape !== "perdu";

/** « 2026-10-05 » : le jour, à Tunis. */
export function aujourdhui(maintenant = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(maintenant);
}

/** Où en est la prochaine action : en retard, aujourd'hui, à venir (ou rien de prévu). */
export function echeance(p: Prospect, jour = aujourdhui()): "retard" | "aujourdhui" | "a_venir" | null {
  if (!enCours(p) || !p.prochaine_le) return null;
  return p.prochaine_le < jour ? "retard" : p.prochaine_le === jour ? "aujourdhui" : "a_venir";
}

/** Ceux qu'il faut relancer : en cours, prochaine action aujourd'hui ou passée. */
export const aRelancer = (liste: Prospect[], jour = aujourdhui()) =>
  liste.filter((p) => { const e = echeance(p, jour); return e === "retard" || e === "aujourdhui"; }).length;

/** « Créer sa boutique » : l'assistant de création, déjà rempli de ce qu'on sait. */
export function lienCreation(p: Prospect): string {
  const q = new URLSearchParams({ nom: p.nom, prospect: p.id });
  if (p.contact_nom) q.set("contact_nom", p.contact_nom);
  if (p.telephone) q.set("contact_telephone", numeroLisible(p.telephone));
  if (p.metier) q.set("metier", p.metier);
  return `/nouvelle-boutique?${q}`;
}
