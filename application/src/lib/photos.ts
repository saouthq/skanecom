import { champ } from "./i18n";
import type { Image, Produit, Variante } from "./catalogue";

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

/** Les axes qui ne changent pas l'allure d'une pièce : une photo du polo bleu
 *  marine vaut pour toutes ses tailles. */
export const AXES_SANS_ALLURE = /^(taille|pointure|dimensions?|diam[eè]tre|longueur|largeur|capacit[eé]|contenance|volume|poids|quantit[eé]|conditionnement|format)$/i;

/** La photo attitrée d'une déclinaison : la sienne (au backoffice), sinon
 *  celle d'une sœur de même allure — même couleur, autre taille (la gérante
 *  attitre sa photo à « Bleu marine · S », la cliente choisit M). Rien
 *  sinon : la photo commune prend le relais chez l'appelant. */
export function imageDeDeclinaison(produit: Produit, variante: Variante): Image | undefined {
  const images = produit.images ?? [];
  const exacte = images.find((i) => i.variante_id === variante.id);
  if (exacte) return exacte;
  const traits = Object.keys(variante.options ?? {}).filter((k) => !AXES_SANS_ALLURE.test(k));
  if (traits.length === 0) return undefined;
  const parId = new Map((produit.variantes ?? []).map((v) => [v.id, v]));
  return images.find((i) => {
    const soeur = i.variante_id ? parId.get(i.variante_id) : undefined;
    return soeur !== undefined && traits.every((k) => soeur.options?.[k] === variante.options[k]);
  });
}

/** Le chemin de la photo d'une déclinaison (la photo portée par la
 *  déclinaison elle-même d'abord), ou rien. */
export function cheminDeDeclinaison(produit: Produit, variante: Variante): string | undefined {
  return variante.image_chemin ?? imageDeDeclinaison(produit, variante)?.chemin;
}

/** Photo de tête d'un produit : celle de la variante si elle en a une, sinon
 *  la première du produit, sinon rien (la niche dit « photo à venir »). On ne
 *  substitue JAMAIS l'image d'un autre produit. */
export function urlPhoto(produit: Produit, variante?: Variante | null): PhotoAffichable {
  const images = produit.images ?? [];
  if (variante?.image_chemin) {
    return { src: urlFichier(variante.image_chemin), alt: champ(produit, "nom") };
  }
  if (images.length === 0) return null;

  const propre = variante ? imageDeDeclinaison(produit, variante) : undefined;
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

/** La deuxième photo du produit (sans variante attitrée), révélée au survol
 *  d'une carte. `null` si le produit n'en a qu'une. */
export function photoSurvol(produit: Produit): { src: string; alt: string } | null {
  const communes = (produit.images ?? []).filter((i) => i.variante_id === null);
  const seconde = communes[1];
  return seconde ? { src: urlFichier(seconde.chemin), alt: "" } : null;
}
