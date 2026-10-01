import { unstable_cache } from "next/cache";

/* ============================================================================
   L'ÉTIQUETTE DE CACHE D'UNE BOUTIQUE — chaque page de sa vitrine la porte
   (posée au chargement du cadre, src/lib/boutique.ts), pour qu'un geste de
   l'équipe (« Publier »…) puisse renouveler TOUTES ses pages d'un coup, et
   seulement les siennes (src/lib/console/vitrine-cache.ts).

   Le cache des pages range leurs étiquettes implicites par gabarit de route
   (/_b/[boutique]/…), commun à toutes les boutiques : sans celle-ci, on ne
   saurait expirer qu'une boutique… qu'en les expirant toutes.

   La pose passe par `unstable_cache` autour d'une fonction qui ne fait rien
   (son résultat, `true`, ne sert à rien d'autre) : c'est la voie par laquelle
   une étiquette rejoint la page en cours de rendu.
   ========================================================================== */

export const etiquetteBoutique = (slug: string) => `boutique:${slug}`;

export function etiqueterBoutique(slug: string): Promise<boolean> {
  return unstable_cache(async () => true, ["etiquette-boutique", slug], { tags: [etiquetteBoutique(slug)], revalidate: 300 })();
}
