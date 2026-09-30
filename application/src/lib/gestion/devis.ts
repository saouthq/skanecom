import type { Role } from "@/lib/console/session";

/* ============================================================================
   LES DEVIS AU BACKOFFICE (module devis) — types, libellés et messages des
   écrans (supabase/migrations/…_devis.sql).
   ========================================================================== */

export type StatutDevis = "demande" | "envoye" | "accepte" | "refuse" | "annule" | "expire";
export type FiltreDevis = "a_chiffrer" | "envoyes" | "acceptes" | "clos";

export const FILTRES_DEVIS: { cle: FiltreDevis; libelle: string; vide: string }[] = [
  { cle: "a_chiffrer", libelle: "À chiffrer", vide: "Aucune demande à chiffrer : elles arrivent du panier de la boutique en ligne (« Demander un devis »)." },
  { cle: "envoyes", libelle: "Envoyés", vide: "Aucun devis en attente de la réponse du client." },
  { cle: "acceptes", libelle: "Acceptés", vide: "Aucun devis accepté pour le moment." },
  { cle: "clos", libelle: "Refusés, annulés, expirés", vide: "Rien ici." },
];

export type LigneListeDevis = {
  numero: string;
  statut: StatutDevis;
  cree_le: string;
  envoye_le: string | null;
  valide_jusqu_au: string | null;
  clos_le: string | null;
  message: string | null;
  client: { id: string; nom: string | null; telephone: string };
  articles: number;
  pieces: number;
  catalogue_millimes: number;
  total_millimes: number | null;
  commande: string | null;
};

export type ListeDevis = {
  filtre: FiltreDevis;
  actif: boolean;
  compteurs: Record<FiltreDevis, number>;
  devis: LigneListeDevis[];
};

export type LigneDevisGestion = {
  id: string;
  produit_nom: string;
  variante_libelle: string | null;
  sku: string | null;
  quantite: number;
  prix_catalogue_millimes: number;
  prix_actuel_millimes: number;
  prix_pro_millimes: number | null;
  prix_devis_millimes: number | null;
  stock: number;
  en_vente: boolean;
  produit_id: string;
};

export type FicheDevis = {
  numero: string;
  statut: StatutDevis;
  version: string;
  cree_le: string;
  envoye_le: string | null;
  valide_jusqu_au: string | null;
  clos_le: string | null;
  envoye_par: string | null;
  message: string | null;
  note: string | null;
  motif: string | null;
  frais_livraison_millimes: number | null;
  total_millimes: number | null;
  commande: string | null;
  client: { id: string; nom: string | null; telephone: string; commandes: number; refus: number; niveau_risque: string; pro: string | null };
  lignes: LigneDevisGestion[];
  journal: { le: string; action: string; apres: { total?: number; motif?: string } | null; auteur: string | null }[];
};

export const LIBELLES_STATUT_DEVIS: Record<StatutDevis, string> = {
  demande: "À chiffrer",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé par le client",
  annule: "Annulé",
  expire: "Expiré",
};

export const CLASSES_STATUT_DEVIS: Record<StatutDevis, string> = {
  demande: "ui-etat ui-etat-point ui-etat-ambre",
  envoye: "ui-etat ui-etat-point ui-etat-violet",
  accepte: "ui-etat ui-etat-point ui-etat-vert",
  refuse: "ui-etat",
  annule: "ui-etat",
  expire: "ui-etat ui-etat-rouge",
};

/** Qui chiffre, envoie et annule un devis : c'est un prix. */
export const PEUT_CHIFFRER: Role[] = ["proprietaire", "admin"];

export function messageDevis(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Votre rôle dans l'équipe ne permet pas ce geste : un devis engage un prix, il revient à la direction.";
    case "change":
      return "Le devis a changé entre-temps (un collègue) : il est à jour ci-dessous, vérifiez avant de recommencer.";
    case "module":
      return "Le module des devis n'est pas actif pour cette boutique.";
    default:
      return message;
  }
}
