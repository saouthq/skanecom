/* Les mots de la facturation SkanFact du commerçant, pour ses écrans (la
   page SkanFact, la fiche d'une commande). */

export const GENRES_SKANFACT: Record<"facture" | "paiement" | "retour", string> = {
  facture: "Facture",
  paiement: "Paiement à la livraison",
  retour: "Retour (avoir)",
};

export const GESTES_SKANFACT: Record<string, string> = {
  "ventes.boutique.facturer": "facturer les commandes de la boutique",
  "ventes.pieces.voir": "voir les pièces de vente",
};

/** Le lien vers l'écran de SkanFact d'une pièce (un chemin relatif que SkanFact a rendu), ou rien. */
export function ecranSkanFact(url: string | null, chemin: string | null | undefined): string | null {
  return url && chemin && /^\/(?!\/)/.test(chemin) ? `${url}${chemin}` : null;
}
