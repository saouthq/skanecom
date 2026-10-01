import type { Role } from "@/lib/console/session";

/* ============================================================================
   LA LETTRE AU BACKOFFICE (…_lettre_information.sql) — les inscrits, leurs
   comptes, et qui peut retirer une adresse ou les exporter.
   ========================================================================== */

export type EcranLettre = {
  actif: boolean;
  compteurs: { inscrits: number; a_confirmer: number; nouveaux_30j: number; desinscrits_30j: number };
  semaines: { semaine: string; inscrits: number; desinscrits: number }[];
  trouves: number;
  abonnes: { id: string; email: string; inscrit_le: string; page: string | null }[];
};

/** Retirer une adresse, exporter la liste : propriétaire, administrateur. */
export const PEUT_RETIRER: Role[] = ["proprietaire", "admin"];

export function messageLettre(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Seuls le propriétaire et l'administrateur retirent une adresse.";
    case "inconnu":
      return "Cette adresse n'est plus inscrite : un collègue l'a peut-être déjà retirée.";
    default:
      return message;
  }
}
