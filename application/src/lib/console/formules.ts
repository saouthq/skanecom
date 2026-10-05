/* ============================================================================
   LES FORMULES — ce que SkanEcom vend (supabase/migrations/…_formules.sql).
   Une formule ouvre des droits : des fonctions que le commerçant allume
   dans ses réglages, et des modules que la console active.
   ========================================================================== */

export type Droit = {
  code: string;
  genre: "reglage" | "module";
  groupe: string;
  libelle: string;
  description: string | null;
  disponible: boolean;
};

export type Formule = {
  code: string;
  nom: string;
  description: string | null;
  prix: number | null;
  position: number;
  droits: string[];
  boutiques: number;
};

export type DonneesFormules = {
  formules: Formule[];
  droits: Droit[];
  boutiques: { id: string; slug: string; nom: string; formule: string | null; demonstration: boolean; statut?: string }[];
};

export const GROUPES_DROITS: { cle: string; titre: string; aide: string }[] = [
  { cle: "fideliser", titre: "Faire revenir", aide: "Ce qui ramène l'acheteur." },
  { cle: "vendre", titre: "Vendre plus", aide: "Ce qui fait passer de la fiche à la commande." },
  { cle: "mesurer", titre: "Mesurer", aide: "Savoir ce que rapportent la vitrine et la publicité." },
  { cle: "modules", titre: "Modules", aide: "Activés par la console, dans la limite de la formule." },
];

/** « Sur mesure » : une boutique sans formule, où tout est ouvert. */
export const SANS_FORMULE = "Sur mesure";
