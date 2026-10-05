"use client";

import { useEffect } from "react";

/* Une liste <select data-envoi-auto> (choisir une boutique, une période…)
   envoie son formulaire dès qu'on la change, comme on suit un lien. Sans
   JavaScript, le bouton « Voir » que la page met dans <noscript> sert. */
export function EnvoiAuChangement() {
  useEffect(() => {
    const change = (e: Event) => {
      const champ = e.target;
      if (champ instanceof HTMLSelectElement && champ.hasAttribute("data-envoi-auto") && champ.form) champ.form.requestSubmit();
    };
    document.addEventListener("change", change);
    return () => document.removeEventListener("change", change);
  }, []);
  return null;
}
