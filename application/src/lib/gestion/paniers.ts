import type { Role } from "@/lib/console/session";
import { formateMontant } from "@/lib/prix";

/* ============================================================================
   LES PANIERS ABANDONNÉS AU BACKOFFICE (supabase/migrations/…_paniers_abandonnes.sql) :
   types, message de relance et phrases.
   ========================================================================== */

export type LignePanier = {
  variante_id: string;
  produit: string;
  slug: string;
  libelle: string | null;
  quantite: number;
  prix_millimes: number;
  /** Encore en vente et en stock (au moins le minimum d'une commande). */
  en_vente: boolean;
  image: string | null;
};

export type PanierSuivi = {
  id: string;
  etat: "a_relancer" | "relance";
  nom: string | null;
  telephone: string | null;
  email: string | null;
  sous_total_millimes: number;
  articles: number;
  depuis: string;
  relance_le: string | null;
  relance_par: string | null;
  /** La commande qui a suivi (après la relance, pour un panier relancé). */
  commande: string | null;
  lignes: LignePanier[];
};

export type EcranPaniers = {
  actif: boolean;
  /** La commande en invité est ouverte : plus aucun panier n'arrive. */
  invites: boolean;
  compteurs: { a_relancer: number; relances: number; commandes_apres_relance: number; en_cours: number };
  paniers: PanierSuivi[];
};

/** Qui relance les clients : ceux qui leur parlent. */
export const PEUT_RELANCER: Role[] = ["proprietaire", "admin", "confirmateur"];

/** Le prénom d'un nom complet : « Amel Ben Salah » → « Amel ». */
function prenom(nom: string | null): string | null {
  const p = nom?.trim().split(/\s+/)[0];
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : null;
}

/** Le message de relance : ce qu'il y avait, où le retrouver, une porte ouverte. */
export function messageRelance(p: Pick<PanierSuivi, "nom" | "lignes" | "sous_total_millimes">, boutique: string, lien: string | null): string {
  const qui = prenom(p.nom);
  const articles = p.lignes.map((l) => `${l.produit}${l.libelle ? ` (${l.libelle})` : ""}${l.quantite > 1 ? ` × ${l.quantite}` : ""}`);
  const liste = articles.length > 2 ? `${articles.slice(0, 2).join(", ")} et ${articles.length - 2} autre${articles.length > 3 ? "s" : ""}` : articles.join(" et ");
  return [
    `Bonjour${qui ? ` ${qui}` : ""}, vous aviez laissé un panier chez ${boutique} : ${liste} (${formateMontant(p.sous_total_millimes)} TND).`,
    lien ? `Il vous attend ici : ${lien}` : null,
    "Une question sur une taille, la livraison ? Répondez simplement à ce message.",
  ].filter(Boolean).join(" ");
}

export function messagePaniers(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Votre rôle dans l'équipe ne permet pas ce geste : relancer les clients revient à la direction et à la confirmation.";
    case "etat":
      return "Ce panier a déjà été traité par un collègue.";
    case "introuvable":
      return "Ce panier n'existe plus : le client l'a peut-être vidé.";
    default:
      return message;
  }
}
