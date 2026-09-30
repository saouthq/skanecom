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

/** Un sommaire qui suit la lecture : le lien de la section à l'écran porte
 *  `aria-current="location"` (lu « emplacement actuel »), et s'allume. Posé
 *  dans le <nav> du sommaire ; ses liens sont des ancres (#t-…). */
export function SuiviSommaire({ sommaire }: { sommaire: string }) {
  useEffect(() => {
    const nav = document.getElementById(sommaire);
    if (!nav || !("IntersectionObserver" in window)) return;
    // Chaque lien et la section qu'il désigne (l'ancre est souvent son titre).
    const paires = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
      .map((a) => {
        const cible = document.getElementById(decodeURIComponent(a.hash.slice(1)));
        return cible ? { a, zone: cible.closest("section") ?? cible } : null;
      })
      .filter((p): p is { a: HTMLAnchorElement; zone: HTMLElement } => p !== null);
    const visibles = new Set<Element>();
    let avant: HTMLAnchorElement | undefined;
    const marque = () => {
      // La première section visible, dans l'ordre de la page.
      const courante = paires.find((p) => visibles.has(p.zone))?.a;
      for (const { a } of paires) {
        if (a === courante) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      }
      // Un sommaire qui défile de côté (les pastilles du téléphone) garde
      // la pastille du moment au milieu — sans faire bouger la page.
      if (courante && courante !== avant && nav.scrollWidth > nav.clientWidth) {
        nav.scrollTo({ left: courante.offsetLeft - (nav.clientWidth - courante.offsetWidth) / 2, behavior: "smooth" });
      }
      avant = courante;
    };
    const io = new IntersectionObserver((entrees) => {
      for (const e of entrees) {
        if (e.isIntersecting) visibles.add(e.target);
        else visibles.delete(e.target);
      }
      marque();
    }, { rootMargin: "-15% 0px -55% 0px" });
    paires.forEach((p) => io.observe(p.zone));
    return () => io.disconnect();
  }, [sommaire]);
  return null;
}
