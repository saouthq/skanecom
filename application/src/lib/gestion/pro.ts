import type { Role } from "@/lib/console/session";

/* ============================================================================
   LES COMPTES PROFESSIONNELS AU BACKOFFICE (module comptes_pro) — types,
   libellés et messages des écrans (supabase/migrations/…_comptes_pro.sql).
   ========================================================================== */

export type StatutPro = "demande" | "valide" | "refuse" | "retire";

export type ComptePro = {
  statut: StatutPro;
  raison_sociale: string;
  matricule_fiscal: string | null;
  metier: string | null;
  message: string | null;
  motif: string | null;
  demande_le: string;
  decide_le: string | null;
  decide_par?: string | null;
};

export type LigneComptePro = ComptePro & {
  client_id: string;
  nom: string | null;
  telephone: string;
  commandes: number;
  refus: number;
  niveau_risque: "normal" | "surveille" | "bloque";
};

export type FiltrePro = "demandes" | "valides" | "refuses";

export const FILTRES_PRO: { cle: FiltrePro; libelle: string; vide: string }[] = [
  { cle: "demandes", libelle: "Demandes", vide: "Aucune demande en attente : elles arrivent depuis « Mes commandes » de la boutique en ligne." },
  { cle: "valides", libelle: "Comptes ouverts", vide: "Aucun compte professionnel ouvert." },
  { cle: "refuses", libelle: "Refusés ou retirés", vide: "Aucun compte refusé ni retiré." },
];

export type ListeComptesPro = {
  filtre: FiltrePro;
  actif: boolean;
  compteurs: Record<FiltrePro, number>;
  comptes: LigneComptePro[];
};

export type FicheComptePro = {
  actif: boolean;
  compte: ComptePro | null;
  journal: { le: string; avant: { statut: StatutPro } | null; apres: { statut: StatutPro; motif: string | null } | null; auteur: string | null }[];
};

export const LIBELLES_STATUT_PRO: Record<StatutPro, string> = {
  demande: "Demande en attente",
  valide: "Compte ouvert",
  refuse: "Refusée",
  retire: "Retiré",
};

export const CLASSES_STATUT_PRO: Record<StatutPro, string> = {
  demande: "ui-etat ui-etat-point ui-etat-ambre",
  valide: "ui-etat ui-etat-point ui-etat-vert",
  refuse: "ui-etat ui-etat-point ui-etat-rouge",
  retire: "ui-etat",
};

/** Qui ouvre, refuse ou retire un compte pro, et fixe les prix pro : un prix. */
export const PEUT_DECIDER_PRO: Role[] = ["proprietaire", "admin"];

export function messagePro(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Votre rôle dans l'équipe ne permet pas ce geste : un compte professionnel ouvre des prix, il revient à la direction.";
    case "change":
      return "Le compte a changé entre-temps (un collègue, ou le client) : il est à jour ci-dessous, vérifiez avant de recommencer.";
    case "module":
      return "Le module des comptes professionnels n'est pas actif pour cette boutique.";
    case "client":
      return "Ce client n'existe pas dans cette boutique.";
    default:
      return message;
  }
}
