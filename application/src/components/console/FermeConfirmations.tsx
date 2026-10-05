"use client";

import { useEffect } from "react";

/* Une confirmation ouverte (<details class="bt-confirmer">, par exemple
   « Suspendre la boutique ») se referme comme un menu : Échap (le focus
   revient au bouton qui l'a ouverte) ou un clic en dehors. */
export function FermeConfirmations() {
  useEffect(() => {
    const ouvertes = () => [...document.querySelectorAll<HTMLDetailsElement>("details.bt-confirmer[open]")];
    const touche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      for (const d of ouvertes()) {
        d.open = false;
        d.querySelector<HTMLElement>(":scope > summary")?.focus();
      }
    };
    const clic = (e: MouseEvent) => {
      for (const d of ouvertes()) if (!d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("keydown", touche);
    document.addEventListener("click", clic);
    return () => {
      document.removeEventListener("keydown", touche);
      document.removeEventListener("click", clic);
    };
  }, []);
  return null;
}
