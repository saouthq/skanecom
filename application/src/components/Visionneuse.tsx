"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Chevron, Croix } from "./Icones";
import { t } from "@/lib/i18n";
import type { PhotoAffichable } from "./Photo";

/* ============================================================================
   LA VISIONNEUSE — une photo de la fiche, touchée ou cliquée, s'ouvre en
   plein écran : on voit la matière, la couture, le mandrin. Les photos du
   produit défilent au doigt (ou aux flèches, ← →), le compteur suit ; Échap,
   la croix ou le fond la referment et le focus revient sur la photo.

   Un <dialog> natif ouvert en modal : le focus y reste, Échap le ferme, le
   reste de la page devient inerte — sans rien réinventer.
   ========================================================================== */

export function Visionneuse({
  photos,
  depart,
  onFermer,
}: {
  photos: PhotoAffichable[];
  /** La photo par laquelle on entre ; `null` : fermée. */
  depart: number | null;
  onFermer: () => void;
}) {
  const dialogue = useRef<HTMLDialogElement>(null);
  const piste = useRef<HTMLDivElement>(null);
  const [vue, setVue] = useState(0);
  // Rouverte sur une autre photo : le compteur part de celle-là (pendant le
  // rendu, pas dans l'effet).
  const [departVu, setDepartVu] = useState(depart);
  if (departVu !== depart) {
    setDepartVu(depart);
    if (depart !== null) setVue(depart);
  }

  useEffect(() => {
    const d = dialogue.current;
    if (!d) return;
    if (depart === null) {
      if (d.open) d.close();
      return;
    }
    if (!d.open) d.showModal();
    // Arrivée sur la photo touchée, sans défilement visible.
    const p = piste.current;
    if (p) p.scrollTo({ left: depart * p.clientWidth * (document.dir === "rtl" ? -1 : 1), behavior: "instant" });
  }, [depart]);

  const va = (i: number) => {
    const p = piste.current;
    if (!p) return;
    const cible = Math.max(0, Math.min(photos.length - 1, i));
    p.scrollTo({ left: cible * p.clientWidth * (document.dir === "rtl" ? -1 : 1), behavior: "smooth" });
  };

  return (
    <dialog
      ref={dialogue}
      className="visionneuse"
      aria-label={t.produit.galerieAria}
      onClose={onFermer}
      onClick={(e) => {
        // Un clic sur le fond (hors d'une photo ou d'un bouton) referme.
        if ((e.target as HTMLElement).closest("img, button")) return;
        dialogue.current?.close();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") va(vue + (document.dir === "rtl" ? -1 : 1));
        if (e.key === "ArrowLeft") va(vue + (document.dir === "rtl" ? 1 : -1));
      }}
    >
      <div className="visionneuse-tete">
        <p className="visionneuse-compteur" aria-live="polite">{t.produit.photoN(vue + 1, photos.length)}</p>
        <button type="button" className="visionneuse-fermer" aria-label={t.produit.fermerPhotos} onClick={() => dialogue.current?.close()}>
          <Croix taille={20} />
        </button>
      </div>
      <div
        ref={piste}
        className="visionneuse-piste"
        onScroll={() => {
          const p = piste.current;
          if (p && p.clientWidth) setVue(Math.min(photos.length - 1, Math.round(Math.abs(p.scrollLeft) / p.clientWidth)));
        }}
      >
        {photos.map((p, i) => (
          <div key={p.src} className="visionneuse-vue" aria-hidden={i !== vue}>
            {depart !== null ? <Image src={p.src} alt={p.alt} fill sizes="100vw" /> : null}
          </div>
        ))}
      </div>
      {photos.length > 1 ? (
        <>
          <button type="button" className="visionneuse-fleche" data-sens="avant" aria-label={t.produit.photoPrecedente} disabled={vue === 0} onClick={() => va(vue - 1)}>
            <Chevron taille={22} />
          </button>
          <button type="button" className="visionneuse-fleche" data-sens="apres" aria-label={t.produit.photoSuivante} disabled={vue === photos.length - 1} onClick={() => va(vue + 1)}>
            <Chevron taille={22} />
          </button>
        </>
      ) : null}
    </dialog>
  );
}
