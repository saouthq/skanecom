import type { Structure } from "@/lib/theme";

/* ============================================================================
   LES PRÉRÉGLAGES PAR MÉTIER (…_metiers.sql) — ce que rend
   public.console_metiers : de quoi les présenter avant de choisir.
   ========================================================================== */

export type Metier = {
  code: string;
  nom: string;
  description: string;
  /** La structure que le métier pose (migration 74). */
  gabarit: Structure;
  accent: string | null;
  rayons: number;
  sous_rayons: number;
  caracteristiques: number;
  /** Les sections de son accueil (0 : celui du gabarit). */
  sections: number;
};

/** « 4 rayons et 7 sous-rayons · 3 caractéristiques · son accueil » : ce que le métier pose. */
export function cePose(m: Metier): string {
  const rayons = `${m.rayons} rayon${m.rayons > 1 ? "s" : ""}${m.sous_rayons ? ` et ${m.sous_rayons} sous-rayon${m.sous_rayons > 1 ? "s" : ""}` : ""}`;
  return `${rayons} · ${m.caracteristiques} caractéristique${m.caracteristiques > 1 ? "s" : ""}${m.sections ? " · son accueil" : ""}`;
}

/** Le refus d'un préréglage, en mots. */
export function messageMetier(indice: string | undefined, message: string): string {
  switch (indice) {
    case "catalogue":
      return "Cette boutique a déjà un catalogue : un préréglage ne vient que sur une boutique vide.";
    case "metier":
      return "Métier inconnu.";
    default:
      return message;
  }
}
