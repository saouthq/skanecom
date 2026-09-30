import type { Role } from "@/lib/console/session";

/* ============================================================================
   LE RÉASSORT AU BACKOFFICE — les demandes « Prévenez-moi de son retour »
   (supabase/migrations/…_alertes_retour.sql) : types, message et phrases.
   ========================================================================== */

export type ContactAPrevenir = {
  id: string;
  telephone: string | null;
  email: string | null;
  demande_le: string;
  disponible_le: string | null;
};

export type PieceAttendue = {
  variante_id: string;
  produit_id: string;
  produit: string;
  slug: string;
  libelle: string | null;
  sku: string;
  stock: number;
  minimum: number;
  /** Le stock atteint le minimum d'une commande : elle se commande. */
  disponible: boolean;
  image: string | null;
  a_prevenir: ContactAPrevenir[];
  /** Ceux qui attendent encore (demandes faites depuis le retour, ou pièce épuisée). */
  attend: number;
  depuis: string;
  revenue_le: string | null;
};

export type EcranReassort = {
  actif: boolean;
  compteurs: { a_prevenir: number; attend: number; prevenues_30j: number };
  pieces: PieceAttendue[];
};

/** Qui prévient les clients : ceux qui leur parlent. */
export const PEUT_PREVENIR: Role[] = ["proprietaire", "admin", "confirmateur"];

/** « +21620300001 » → « 20 300 001 ». */
export function telephoneLisible(tel: string): string {
  const c = tel.replace(/\D/g, "").replace(/^216(?=\d{8}$)/, "");
  return c.length === 8 ? `${c.slice(0, 2)} ${c.slice(2, 5)} ${c.slice(5)}` : tel;
}

/** Le message à envoyer : la pièce, la boutique, le lien de la fiche. */
export function messageRetour(p: Pick<PieceAttendue, "produit" | "libelle">, boutique: string, lien: string | null): string {
  const piece = p.libelle ? `${p.produit} (${p.libelle})` : p.produit;
  return `Bonjour, bonne nouvelle : ${piece} est de retour chez ${boutique}.${lien ? ` À retrouver ici : ${lien}` : ""}`;
}

export function messageReassort(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Votre rôle dans l'équipe ne permet pas ce geste : prévenir les clients revient à la direction et à la confirmation.";
    case "etat":
      return "Ces demandes ont déjà été traitées par un collègue.";
    default:
      return message;
  }
}
