"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/* ============================================================================
   D'UNE PAGE À L'AUTRE (animations « expressives », app/studio.css) — après
   une navigation dans la vitrine (pas au premier chargement : la page doit
   s'afficher aussitôt), le contenu arrive d'un léger élan : <html> porte
   data-navigue le temps de l'animation. Rien sans le style expressif, rien
   avec « réduire les animations » (la feuille ne l'anime alors pas).
   ========================================================================== */

export function MouvementStudio() {
  const chemin = usePathname();
  const premier = useRef(true);

  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    const racine = document.documentElement;
    if (racine.dataset.animations !== "expressives") return;
    racine.dataset.navigue = "";
    const fin = window.setTimeout(() => { delete racine.dataset.navigue; }, 800);
    return () => {
      window.clearTimeout(fin);
      delete racine.dataset.navigue;
    };
  }, [chemin]);

  return null;
}
