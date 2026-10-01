/* La comparaison (structure Commerce) : ce que partagent le serveur (la page
   /comparer) et le navigateur (lib/comparaison.ts). */

/** Quatre pièces au plus, côte à côte : au-delà, le tableau ne se lit plus. */
export const MAX_COMPARAISON = 4;

/** Ce que la barre du bas garde de chaque pièce, pour se montrer sans requête. */
export type PieceComparee = { slug: string; nom: string; photo: string | null };
