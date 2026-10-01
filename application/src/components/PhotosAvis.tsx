"use client";

import Image from "next/image";
import { useState } from "react";
import { Visionneuse } from "./Visionneuse";
import { urlFichier } from "@/lib/photos";
import { t } from "@/lib/i18n";
import type { PhotoAvis } from "@/lib/avis";

/* ============================================================================
   LES PHOTOS DES CLIENTS (réglage avis.photos) — des vignettes carrées, sous
   un avis ou en rang au-dessus de la liste ; touchée ou cliquée, une photo
   s'ouvre dans la Visionneuse de la fiche (flèches, Échap, le focus revient
   sur la vignette). `auteur` : pour le texte lu aux personnes aveugles.
   ========================================================================== */

export function PhotosAvis({ photos, auteurs, classe, taille = 72 }: {
  photos: PhotoAvis[];
  /** L'auteur de chaque photo (« Amel B. »), dans le même ordre. */
  auteurs: string[];
  classe: string;
  taille?: number;
}) {
  const [ouverte, setOuverte] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const affichables = photos.map((p, i) => ({ src: urlFichier(p.chemin), alt: t.avis.photoDe(auteurs[i] ?? "") }));
  return (
    <>
      <ul className={classe} role="list">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button type="button" className="avis-photo" onClick={() => setOuverte(i)} aria-label={t.avis.agrandirPhoto(auteurs[i] ?? "", i + 1, photos.length)}>
              <Image src={affichables[i].src} alt="" fill sizes={`${taille}px`} />
            </button>
          </li>
        ))}
      </ul>
      <Visionneuse photos={affichables} depart={ouverte} onFermer={() => setOuverte(null)} etiquette={t.avis.visionneuse} />
    </>
  );
}
