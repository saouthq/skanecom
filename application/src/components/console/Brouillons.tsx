"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/* Les brouillons du backoffice : un champ marqué `data-brouillon` (la note
   d'un appel) est gardé le temps de l'onglet. Une session qui a pris fin au
   moment d'enregistrer ramène, après la reconnexion, sur la même page
   (lib/console/suite.ts) : la note tapée y revient. Un geste réussi (la page
   revient avec ?fait= ou ?ok=) l'oublie. */
export function Brouillons() {
  const chemin = usePathname();
  const recherche = useSearchParams();
  useEffect(() => {
    const cle = (el: Element) => `skanecom.brouillon:${chemin}:${el.id || el.getAttribute("name")}`;
    const champs = () => Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-brouillon]"));
    try {
      if (recherche.has("fait") || recherche.has("ok")) {
        for (const el of champs()) sessionStorage.removeItem(cle(el));
      } else {
        for (const el of champs()) {
          const garde = sessionStorage.getItem(cle(el));
          if (garde && !el.value) el.value = garde;
        }
      }
    } catch {
      /* Stockage fermé : rien de gardé, rien de perdu de plus. */
    }
    const frappe = (e: Event) => {
      const el = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el?.hasAttribute?.("data-brouillon")) return;
      try {
        if (el.value) sessionStorage.setItem(cle(el), el.value);
        else sessionStorage.removeItem(cle(el));
      } catch {
        /* idem */
      }
    };
    document.addEventListener("input", frappe);
    return () => document.removeEventListener("input", frappe);
  }, [chemin, recherche]);
  return null;
}
