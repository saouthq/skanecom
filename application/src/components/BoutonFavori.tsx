"use client";

import { useFavorisActifs } from "./FavorisActifs";
import { Coeur } from "./Icones";
import { basculeFavori, useFavoris } from "@/lib/favoris";
import { t } from "@/lib/i18n";

/* ============================================================================
   LE CŒUR — ajoute la pièce aux favoris, ou l'en retire (lib/favoris.ts).
   Un vrai bouton (aria-pressed), jamais dans le lien de la carte : il se
   pose par-dessus la photo, à côté. Au toucher, un petit battement ; avec
   « réduire les animations », rien ne bouge.
   ========================================================================== */

export function BoutonFavori({ slug, nom, className = "" }: { slug: string; nom: string; className?: string }) {
  const actifs = useFavorisActifs();
  const aime = useFavoris().includes(slug);
  // Réglage coupé (la boutique n'a pas de favoris) : ni cœur, ni place prise.
  if (!actifs) return null;
  return (
    <button
      type="button"
      className={`favori ${className}`}
      aria-pressed={aime}
      aria-label={aime ? t.favoris.retirer(nom) : t.favoris.ajouter(nom)}
      data-aime={aime ? "" : undefined}
      onClick={() => basculeFavori(slug)}
    >
      <Coeur plein={aime} />
    </button>
  );
}
