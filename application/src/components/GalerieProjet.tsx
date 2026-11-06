"use client";

import { useState } from "react";
import { Photo, type PhotoAffichable } from "./Photo";
import { Visionneuse } from "./Visionneuse";
import { t } from "@/lib/i18n";

/* ============================================================================
   LES PHOTOS D'UN PROJET (structure Studio) — en séquence, comme un livre :
   une pleine largeur, puis deux côte à côte, puis une pleine largeur… Une
   photo touchée s'ouvre dans la visionneuse (toutes les photos du projet,
   l'ouverture comprise) ; Échap la referme, le focus revient à la photo.
   ========================================================================== */

export function GalerieProjet({ photos, depuis = 0, titre }: { photos: PhotoAffichable[]; depuis?: number; titre: string }) {
  const [agrandie, setAgrandie] = useState<number | null>(null);
  const suite = photos.slice(depuis);
  if (suite.length === 0) return null;
  return (
    <section className="enveloppe st-galerie" aria-label={titre}>
      <h2 className="sr-only">{titre}</h2>
      <ul className="st-galerie-liste" role="list">
        {suite.map((p, i) => {
          // Une pleine largeur, puis deux côte à côte (la dernière seule reprend toute la largeur).
          const large = i % 3 === 0 || (i % 3 === 1 && i === suite.length - 1);
          return (
            <li key={p?.src ?? i} className="st-galerie-vue apparait" data-large={large ? "" : undefined}>
              <button type="button" className="galerie-agrandir" aria-label={t.produit.agrandir(depuis + i + 1, photos.length)} onClick={() => setAgrandie(depuis + i)}>
                <Photo photo={p} ratio={large ? "3 / 2" : "4 / 5"} tailles={large ? "(min-width: 900px) 90vw, 100vw" : "(min-width: 900px) 45vw, 100vw"} />
              </button>
            </li>
          );
        })}
      </ul>
      <Visionneuse photos={photos} depart={agrandie} onFermer={() => setAgrandie(null)} etiquette={titre} />
    </section>
  );
}
