/* ============================================================================
   LES PRIX PAR QUANTITÉ (« 2 pour 99 DT », migration 71) — le même calcul
   que la base (private.chiffre_commande), pour AFFICHER : la fiche, le
   tiroir du panier. Le prix dû est toujours celui que la base recalcule.

   Une ligne de Q pièces prend le palier le plus haut qui ne dépasse pas Q,
   au prorata (Q = N : le prix du palier, exactement) ; jamais plus cher
   que sans palier.
   ========================================================================== */

export type Palier = { quantite: number; prixMillimes: number };

/** Les paliers lus en base (vitrine_produits.paliers), propres et rangés. */
export function paliersDe(brut: unknown): Palier[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((p) => ({ quantite: Number(p?.quantite ?? p?.q), prixMillimes: Number(p?.prix_millimes ?? p?.prixMillimes) }))
    .filter((p) => Number.isInteger(p.quantite) && p.quantite >= 2 && p.quantite <= 50 && Number.isInteger(p.prixMillimes) && p.prixMillimes > 0)
    .sort((a, b) => a.quantite - b.quantite)
    .slice(0, 3);
}

export type TotalLigne = { total: number; sansPalier: number; palier: Palier | null };

export function totalAvecPaliers(prixUnitaire: number, quantite: number, paliers: Palier[] | undefined): TotalLigne {
  const sansPalier = prixUnitaire * quantite;
  const palier = [...(paliers ?? [])].reverse().find((p) => p.quantite <= quantite) ?? null;
  if (!palier) return { total: sansPalier, sansPalier, palier: null };
  const auPalier = Math.round((palier.prixMillimes * quantite) / palier.quantite);
  return auPalier < sansPalier ? { total: auPalier, sansPalier, palier } : { total: sansPalier, sansPalier, palier: null };
}

/** L'économie d'un palier sur N pièces au prix unitaire, en pour cent arrondi. */
export function remisePalier(prixUnitaire: number, p: Palier): number {
  return Math.round((1 - p.prixMillimes / (prixUnitaire * p.quantite)) * 100);
}
