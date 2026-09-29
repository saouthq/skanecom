import { champ } from "./i18n";
import type { Produit, Variante } from "./catalogue";

/* ============================================================================
   FICHIERS — photos, logos, monogrammes : sur R2, sous le dossier de chaque
   boutique (`<slug>/…`), servis par Cloudflare. Ils restent affichés même si
   la base tombe.

   NEXT_PUBLIC_FICHIERS_URL donne la base publique : le domaine du bucket R2
   en production, le relais local en développement (outils/api-locale.sh).
   La base vérifie déjà que chaque chemin est dans le dossier de sa boutique.
   ========================================================================== */

const BASE = (process.env.NEXT_PUBLIC_FICHIERS_URL ?? "").replace(/\/+$/, "");

export function urlFichier(chemin: string): string {
  if (/^https?:\/\//.test(chemin)) return chemin;
  return `${BASE}/${chemin.replace(/^\/+/, "")}`;
}

type PhotoAffichable = { src: string; alt: string; detoure?: boolean } | null;

/** Photo de tête d'un produit : celle de la variante si elle en a une, sinon
 *  la première du produit, sinon rien (la niche dit « photo à venir »). On ne
 *  substitue JAMAIS l'image d'un autre produit. */
export function urlPhoto(produit: Produit, variante?: Variante | null): PhotoAffichable {
  const images = produit.images ?? [];
  if (variante?.image_chemin) {
    return { src: urlFichier(variante.image_chemin), alt: champ(produit, "nom") };
  }
  if (images.length === 0) return null;

  const propre = variante ? images.find((i) => i.variante_id === variante.id) : undefined;
  const image = propre ?? images.find((i) => i.variante_id === null) ?? images[0];

  return {
    src: urlFichier(image.chemin),
    alt: champ(image, "alt") || champ(produit, "nom"),
  };
}

/** Toutes les photos d'un produit, pour la galerie de la fiche. */
export function photosProduit(produit: Produit): { src: string; alt: string }[] {
  return (produit.images ?? []).map((image) => ({
    src: urlFichier(image.chemin),
    alt: champ(image, "alt") || champ(produit, "nom"),
  }));
}
