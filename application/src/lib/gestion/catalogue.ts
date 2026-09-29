import type { Role } from "@/lib/console/session";
import { slug } from "@/lib/console/import";

/* ============================================================================
   LE CATALOGUE AU BACKOFFICE — types, libellés et petits outils des écrans
   (supabase/migrations/…_gestion_catalogue.sql).
   ========================================================================== */

export const FILTRES_CATALOGUE = [
  { cle: "tous", libelle: "Tous", vide: "Aucun produit pour le moment. Créez le premier, ou importez un catalogue depuis la console." },
  { cle: "publies", libelle: "En vitrine", vide: "Aucun produit en vitrine." },
  { cle: "brouillons", libelle: "Brouillons", vide: "Aucun brouillon : tout est en vitrine." },
  { cle: "stock_bas", libelle: "Stock bas", vide: "Aucune déclinaison sous son seuil d'alerte." },
  { cle: "rupture", libelle: "En rupture", vide: "Aucun produit en rupture." },
] as const;
export type FiltreCatalogue = (typeof FILTRES_CATALOGUE)[number]["cle"];

export type LigneProduit = {
  id: string;
  slug: string;
  nom: string;
  marque: string | null;
  publie: boolean;
  mis_en_avant: boolean;
  categorie: string | null;
  image: string | null;
  nb_variantes: number;
  stock_total: number;
  variantes_bas: number;
  prix_min: number | null;
  prix_max: number | null;
  modifie_le: string;
};

export type ListeProduits = {
  filtre: FiltreCatalogue;
  total: number;
  compteurs: Record<FiltreCatalogue, number>;
  produits: LigneProduit[];
};

export type Declinaison = {
  id: string;
  sku: string;
  options: Record<string, string>;
  libelle: string | null;
  prix: number;
  prix_barre: number | null;
  stock: number;
  seuil: number;
  actif: boolean;
  poids: number | null;
};

export type FicheProduit = {
  id: string;
  slug: string;
  nom: string;
  description: string | null;
  marque: string | null;
  categorie_id: string | null;
  publie: boolean;
  mis_en_avant: boolean;
  version: string;
  cree_le: string;
  axes: { cle: string; label: string; valeurs: string[] }[];
  variantes: Declinaison[];
  images: { id: string; chemin: string; variante_id: string | null; alt: string | null }[];
  categories: { id: string; nom: string }[];
  mouvements: {
    le: string;
    sku: string;
    libelle: string | null;
    delta: number;
    stock_apres: number;
    motif: string;
    commentaire: string | null;
    commande: string | null;
    auteur: string | null;
  }[];
};

export const LIBELLES_MOTIF: Record<string, string> = {
  reception: "Réception",
  vente: "Vente",
  retour_refus: "Retour (refus à la livraison)",
  annulation: "Retour (commande annulée)",
  correction: "Inventaire",
  casse: "Casse",
};

export const MODES_STOCK = [
  { cle: "reception", libelle: "Réception", aide: "Ajouter les pièces reçues" },
  { cle: "inventaire", libelle: "Inventaire", aide: "Le nombre compté en rayon" },
  { cle: "casse", libelle: "Casse", aide: "Retirer des pièces abîmées ou perdues" },
] as const;

/** Qui modifie la fiche et les prix ; qui tient le stock. */
export const PEUT_MODIFIER: Role[] = ["proprietaire", "admin"];
export const PEUT_STOCKER: Role[] = ["proprietaire", "admin", "preparateur"];

/** L'état du stock d'une déclinaison, pour sa pastille. */
export function etatStock(stock: number, seuil: number): { texte: string; classe: string } {
  if (stock <= 0) return { texte: "Rupture", classe: "ui-etat ui-etat-point ui-etat-rouge" };
  if (stock <= seuil) return { texte: `Stock bas · ${stock}`, classe: "ui-etat ui-etat-point ui-etat-ambre" };
  return { texte: `${stock} en stock`, classe: "ui-etat ui-etat-point ui-etat-vert" };
}

/** Le message à l'équipe pour un refus de la base. */
export function messageCatalogue(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Votre rôle dans l'équipe ne permet pas ce geste.";
    case "change":
      return "La fiche a été modifiée entre-temps par un collègue : elle est à jour ci-dessous, vérifiez avant de recommencer.";
    case "produit":
      return "Ce produit n'existe pas dans cette boutique.";
    default:
      return message;
  }
}

/** Une référence proposée pour une déclinaison : la base, puis trois lettres
 *  par valeur (« VALISE-CABINE-GRA-NOI »). */
export function referenceProposee(base: string, valeurs: string[]): string {
  const tete = slug(base, 24).toUpperCase() || "REF";
  const queue = valeurs.map((v) => slug(v, 12).replace(/-/g, "").slice(0, 3).toUpperCase()).filter(Boolean);
  return [tete, ...queue].join("-").slice(0, 60);
}

/** Toutes les combinaisons des valeurs d'axes (produit cartésien). */
export function combinaisons(axes: { cle: string; valeurs: string[] }[]): Record<string, string>[] {
  return axes.reduce<Record<string, string>[]>(
    (acc, axe) => acc.flatMap((o) => axe.valeurs.map((v) => ({ ...o, [axe.cle]: v }))),
    [{}],
  );
}
