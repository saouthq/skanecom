"use client";

import { useEffect } from "react";

/** « / » place le curseur dans la recherche de la page, où que l'on soit
 *  (sauf en train d'écrire ailleurs) — le réflexe des outils qu'on ouvre
 *  vingt fois par jour. Échap le rend. */
export function RaccourciRecherche({ cible }: { cible: string }) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const champ = document.getElementById(cible) as HTMLInputElement | null;
      if (!champ) return;
      const ici = e.target as HTMLElement;
      const ecrit = ici.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(ici.tagName);
      if (e.key === "/" && !ecrit && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        champ.focus();
        champ.select();
      } else if (e.key === "Escape" && ici === champ) {
        champ.blur();
      }
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [cible]);
  return null;
}
