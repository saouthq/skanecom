import type { Role } from "@/lib/console/session";

/* ============================================================================
   LES AVIS AU BACKOFFICE (module avis) — types, libellés et messages de
   l'écran (supabase/migrations/…_avis.sql).
   ========================================================================== */

export type StatutAvis = "en_attente" | "publie" | "ecarte";
export type FiltreAvis = "a_moderer" | "publies" | "ecartes";

export const FILTRES_AVIS: { cle: FiltreAvis; libelle: string; vide: string }[] = [
  { cle: "a_moderer", libelle: "À relire", vide: "Aucun avis à relire : ils arrivent de « Mes commandes », une fois la commande livrée." },
  { cle: "publies", libelle: "Publiés", vide: "Aucun avis publié pour le moment." },
  { cle: "ecartes", libelle: "Écartés", vide: "Aucun avis écarté." },
];

export type AvisGestion = {
  id: string;
  note: number;
  texte: string | null;
  auteur: string;
  statut: StatutAvis;
  motif: string | null;
  reponse: string | null;
  repondu_le: string | null;
  cree_le: string;
  modere_le: string | null;
  modere_par: string | null;
  produit: { id: string; nom: string; slug: string };
  variante_libelle: string | null;
  commande: string;
  client: { id: string; nom: string | null; telephone: string };
  /** Les photos jointes par le client (réglage avis.photos). */
  photos: { id: string; chemin: string; largeur: number | null; hauteur: number | null }[];
};

export type ListeAvis = {
  actif: boolean;
  moderation: "a_priori" | "automatique";
  compteurs: { a_moderer: number; publies: number; ecartes: number; moyenne: number | null };
  avis: AvisGestion[];
};

export const LIBELLES_STATUT_AVIS: Record<StatutAvis, string> = {
  en_attente: "À relire",
  publie: "Publié",
  ecarte: "Écarté",
};

export const CLASSES_STATUT_AVIS: Record<StatutAvis, string> = {
  en_attente: "ui-etat ui-etat-point ui-etat-ambre",
  publie: "ui-etat ui-etat-point ui-etat-vert",
  ecarte: "ui-etat",
};

/** Qui publie, écarte et répond : c'est la parole publique de la boutique. */
export const PEUT_MODERER: Role[] = ["proprietaire", "admin"];

export function messageAvis(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Votre rôle dans l'équipe ne permet pas ce geste : ce que la boutique publie revient à la direction.";
    case "module":
      return "Le module des avis n'est pas actif pour cette boutique.";
    default:
      return message;
  }
}
