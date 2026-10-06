"use client";

import { useRef, useState } from "react";
import { Photo, type PhotoAffichable } from "./Photo";
import { Visionneuse } from "./Visionneuse";
import { t } from "@/lib/i18n";

/* ============================================================================
   LES GALERIES DE LA FICHE

   · ÉDITORIALE — sur grand écran, les photos en pleine hauteur, les unes sous
     les autres (deux par rang, la première seule si leur nombre est impair) :
     on descend dans le produit pendant que le bloc d'achat reste à côté. Sur
     téléphone, une bande qu'on fait glisser au doigt, avec son compteur (ou
     ses points, en allure contemporaine).
   · TECHNIQUE — une grande vue sur fond blanc et ses vignettes : on compare
     des détails (mandrin, embout, boîtier), on ne feuillette pas un magazine.
   ========================================================================== */

export function GalerieEditoriale({ photos, nom }: { photos: PhotoAffichable[]; nom?: string }) {
  const piste = useRef<HTMLDivElement>(null);
  const [vue, setVue] = useState(0);
  const [agrandie, setAgrandie] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <div className="ed-galerie">
        <Photo photo={null} ratio="4 / 5" nom={nom} />
      </div>
    );
  }

  const impair = photos.length % 2 === 1;
  const suit = () => {
    const p = piste.current;
    if (!p || p.clientWidth === 0) return;
    setVue(Math.min(photos.length - 1, Math.round(Math.abs(p.scrollLeft) / p.clientWidth)));
  };

  return (
    <div className="ed-galerie" role="region" aria-label={t.produit.galerieAria}>
      <div ref={piste} className="ed-galerie-piste" data-impair={impair ? "" : undefined} onScroll={suit}>
        {photos.map((p, i) => (
          <div key={p.src} className="ed-galerie-vue">
            <button type="button" className="galerie-agrandir" aria-label={t.produit.agrandir(i + 1, photos.length)} onClick={() => setAgrandie(i)}>
              <Photo
                photo={p}
                ratio="4 / 5"
                prioritaire={i === 0}
                tailles={impair && i === 0 ? "(min-width: 900px) 56vw, 100vw" : "(min-width: 900px) 28vw, 100vw"}
              />
            </button>
          </div>
        ))}
      </div>
      {photos.length > 1 ? (
        <p className="ed-galerie-compteur cache-desktop" aria-hidden="true">
          {vue + 1} / {photos.length}
        </p>
      ) : null}
      {/* L'allure contemporaine dit la photo par des points (app/allure.css). */}
      {photos.length > 1 ? (
        <p className="ed-galerie-points cache-desktop" aria-hidden="true">
          {photos.map((p, i) => (
            <i key={p.src} data-actif={i === vue ? "" : undefined} />
          ))}
        </p>
      ) : null}
      <Visionneuse photos={photos} depart={agrandie} onFermer={() => setAgrandie(null)} />
    </div>
  );
}

export function GalerieVignettes({ photos }: { photos: PhotoAffichable[] }) {
  const [vue, setVue] = useState(0);
  const [agrandie, setAgrandie] = useState<number | null>(null);
  const principale = photos[vue] ?? null;
  return (
    <div className="te-galerie" role="region" aria-label={t.produit.galerieAria}>
      <div className="te-galerie-principale">
        {principale ? (
          <button type="button" className="galerie-agrandir" aria-label={t.produit.agrandir(vue + 1, photos.length)} onClick={() => setAgrandie(vue)}>
            <Photo photo={principale} ratio="1 / 1" prioritaire tailles="(min-width: 1000px) 44vw, 100vw" />
          </button>
        ) : (
          <Photo photo={null} ratio="1 / 1" />
        )}
      </div>
      {photos.length > 1 ? (
        <div className="te-galerie-vignettes">
          {photos.map((p, i) => (
            <button key={p.src} type="button" aria-pressed={i === vue} aria-label={t.produit.photoN(i + 1, photos.length)} onClick={() => setVue(i)}>
              <Photo photo={p} ratio="1 / 1" tailles="96px" />
            </button>
          ))}
        </div>
      ) : null}
      {photos.length > 0 ? <Visionneuse photos={photos} depart={agrandie} onFermer={() => setAgrandie(null)} /> : null}
    </div>
  );
}
