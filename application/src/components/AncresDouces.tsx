"use client";

import { useEffect } from "react";

/* ============================================================================
   LES ANCRES QUI DÉFILENT EN DOUCEUR — un lien vers une section de la même
   page (#avis, le sommaire d'une page légale, les rubriques des réglages)
   glisse jusqu'à elle ; tout le reste (une page qui s'ouvre, le retour en
   haut) est immédiat. Le défilement doux n'est posé que le temps du saut
   (style en ligne sur <html>, retiré au scrollend) : la navigation du
   navigateur fait le reste — l'adresse, :target, l'historique, le focus.
   « Réduire les animations » : le saut est immédiat.
   ========================================================================== */
export function AncresDouces() {
  useEffect(() => {
    const html = document.documentElement;
    const reduit = matchMedia("(prefers-reduced-motion: reduce)");
    let minuterie = 0;
    const fin = () => {
      html.style.removeProperty("scroll-behavior");
      window.clearTimeout(minuterie);
    };
    const clic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || reduit.matches) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      if (!a || a.getAttribute("href") === "#") return;
      html.style.scrollBehavior = "smooth";
      window.addEventListener("scrollend", fin, { once: true });
      window.clearTimeout(minuterie);
      minuterie = window.setTimeout(fin, 1500);
    };
    document.addEventListener("click", clic, true);
    return () => {
      document.removeEventListener("click", clic, true);
      fin();
    };
  }, []);
  return null;
}
