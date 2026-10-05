/* ============================================================================
   LES PACKS AU BACKOFFICE (module promotions, …_lots.sql : « lots » dans la
   base et le code, le mot « lot » étant pris par SkanFact) — deux à quatre
   produits vendus ensemble à un prix : types et phrases de l'écran.
   ========================================================================== */

export type ProduitDuLot = {
  id: string;
  slug: string;
  nom: string;
  publie: boolean;
  prix_min_millimes: number | null;
  image: string | null;
};

export type LotGestion = {
  id: string;
  nom: string;
  accroche: string | null;
  prix_millimes: number;
  actif: boolean;
  cree_le: string;
  produits: ProduitDuLot[];
  commandes: number;
  remises_millimes: number;
};

/** Un produit en vente qu'on peut mettre dans un lot. */
export type ProduitAuCatalogue = { id: string; nom: string; rayon: string | null; prix_min_millimes: number };

export type EcranLots = { actif: boolean; lots: LotGestion[]; produits: ProduitAuCatalogue[] };

/** Ce que valent les produits du lot achetés un à un, au plus bas (null : un produit n'est plus en vente). */
export function valeurDu(lot: Pick<LotGestion, "produits">): number | null {
  if (lot.produits.some((p) => !p.publie || p.prix_min_millimes === null)) return null;
  return lot.produits.reduce((s, p) => s + (p.prix_min_millimes ?? 0), 0);
}

/** « −12 % » : ce que le lot retire, en pourcentage de la valeur. */
export function pourcentage(valeur: number, prix: number): string {
  return `−${Math.round(((valeur - prix) / valeur) * 100)} %`;
}

export function messageLots(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Votre rôle dans l'équipe ne permet pas ce geste : un pack est un prix, il revient à la direction.";
    case "module":
      return "Les promotions ne sont pas ouvertes pour cette boutique : elles s'activent depuis la console SkanEcom.";
    case "introuvable":
      return "Ce pack n'existe plus dans cette boutique.";
    case "produits":
      return "Un pack réunit de 2 à 4 produits différents, chacun en vente dans la boutique.";
    default:
      return message;
  }
}
