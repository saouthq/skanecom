"use client";

import { getImageProps } from "next/image";
import { preload } from "react-dom";
import { jeuDePhoto } from "@/lib/photos";

/* Composant client : avec vinext, `next/image` est un module client, et
   getImageProps ne s'appelle que de ce côté-là (le rendu serveur d'un
   composant client compris). */

/** Une image d'ouverture, en deux cadrages : paysage sur grand écran,
 *  portrait sur téléphone. Un seul fichier est chargé — celui de l'écran
 *  (<picture>), jamais les deux — et à la taille de l'écran quand le nom de
 *  la photo dit sa largeur (lib/photos.ts, jeuDePhoto). */
export function PhotoOuverture({
  paysage,
  portrait,
  alt,
  className = "",
  prioritaire = true,
}: {
  paysage: string;
  portrait?: string;
  alt: string;
  className?: string;
  /** Faux pour une photo plus bas sur la page (les bannières qui suivent la première). */
  prioritaire?: boolean;
}) {
  const commun = { alt, fill: true, priority: prioritaire, sizes: "100vw" } as const;
  const { props: grand } = getImageProps({ ...commun, src: paysage });
  const petit = portrait ? getImageProps({ ...commun, src: portrait }).props : null;
  const jeuGrand = jeuDePhoto(paysage);
  const jeuPetit = portrait ? jeuDePhoto(portrait) : undefined;
  if (prioritaire && (jeuGrand || jeuPetit)) {
    // Annoncée avec son jeu et son écran : le navigateur ne télécharge d'avance que celle qu'il affichera.
    preload(paysage, { as: "image", imageSrcSet: jeuGrand, imageSizes: "100vw", fetchPriority: "high", ...(petit ? { media: "(min-width: 700px)" } : {}) });
    if (portrait) preload(portrait, { as: "image", imageSrcSet: jeuPetit, imageSizes: "100vw", fetchPriority: "high", media: "(max-width: 699px)" });
  }
  return (
    <picture className={className}>
      {petit ? <source media="(max-width: 699px)" srcSet={jeuPetit ?? petit.srcSet ?? petit.src} sizes={petit.sizes} /> : null}
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt est dans les props calculées */}
      <img {...grand} srcSet={jeuGrand ?? grand.srcSet} />
    </picture>
  );
}
