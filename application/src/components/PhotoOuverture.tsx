"use client";

import { getImageProps } from "next/image";

/* Composant client : avec vinext, `next/image` est un module client, et
   getImageProps ne s'appelle que de ce côté-là (le rendu serveur d'un
   composant client compris). */

/** Une image d'ouverture, en deux cadrages : paysage sur grand écran,
 *  portrait sur téléphone. Un seul fichier est chargé — celui de l'écran
 *  (<picture>), jamais les deux. */
export function PhotoOuverture({
  paysage,
  portrait,
  alt,
  className = "",
}: {
  paysage: string;
  portrait?: string;
  alt: string;
  className?: string;
}) {
  const commun = { alt, fill: true, priority: true, sizes: "100vw" } as const;
  const { props: grand } = getImageProps({ ...commun, src: paysage });
  const petit = portrait ? getImageProps({ ...commun, src: portrait }).props : null;
  return (
    <picture className={className}>
      {petit ? <source media="(max-width: 699px)" srcSet={petit.srcSet ?? petit.src} sizes={petit.sizes} /> : null}
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt est dans les props calculées */}
      <img {...grand} />
    </picture>
  );
}
