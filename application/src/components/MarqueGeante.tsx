"use client";

import { useEffect, useRef } from "react";

/* ============================================================================
   LE NOM DE LA BOUTIQUE EN GRAND, au pied de page (sans logo dessiné) : la
   taille de la feuille (16vw) va à « Dar Alia », pas à « Yasmine Beauté »
   dans une police large, qui sortait de la page. Une fois les polices
   chargées, puis à chaque changement de largeur, le nom qui déborde est
   réduit juste assez pour tenir ; un nom court garde la taille de la feuille.
   Sans JavaScript, il reste coupé au bord (overflow: hidden), sans débord.
   ========================================================================== */

export function MarqueGeante({ nom }: { nom: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const e = ref.current;
    if (!e) return;
    let largeur = -1;
    const ajuste = () => {
      e.style.removeProperty("font-size");
      const place = e.clientWidth;
      if (place > 0 && e.scrollWidth > place + 1) {
        const taille = parseFloat(getComputedStyle(e).fontSize);
        e.style.fontSize = `${Math.floor(((taille * place) / e.scrollWidth) * 0.98)}px`;
      }
    };
    ajuste();
    document.fonts?.ready.then(ajuste).catch(() => {});
    const suivi = new ResizeObserver(([entree]) => {
      const l = Math.round(entree.contentRect.width);
      if (l !== largeur) {
        largeur = l;
        ajuste();
      }
    });
    suivi.observe(e);
    return () => suivi.disconnect();
  }, []);
  return (
    <span ref={ref} className="marque-texte marque-geante">
      {nom}
    </span>
  );
}
