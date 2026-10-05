"use client";

import { useEffect } from "react";

/* Toute rangée d'onglets qui défile (.onglets : les pages d'une boutique,
   les étapes des commandes…) estompe le bord derrière lequel il en reste
   (data-suite) : au téléphone, on devine qu'il y en a d'autres à faire
   glisser. Une seule écoute pour la page ; les rangées qu'une navigation
   apporte sont reprises au passage (MutationObserver). L'onglet de la page
   (aria-current) est ramené en vue une fois, s'il était derrière le bord. */
export function BordsOnglets() {
  useEffect(() => {
    let image = 0;
    const marque = () => {
      cancelAnimationFrame(image);
      image = requestAnimationFrame(() => {
        for (const nav of document.querySelectorAll<HTMLElement>(".onglets")) {
          const actif = nav.querySelector<HTMLElement>('[aria-current="page"]');
          const cle = actif?.getAttribute("href") ?? "";
          if (actif && nav.dataset.centre !== cle && nav.scrollWidth > nav.clientWidth) {
            nav.dataset.centre = cle;
            const debut = actif.offsetLeft - nav.offsetLeft;
            if (debut < nav.scrollLeft || debut + actif.offsetWidth > nav.scrollLeft + nav.clientWidth) {
              nav.scrollLeft = Math.max(0, debut - (nav.clientWidth - actif.offsetWidth) / 2);
            }
          }
          const fin = nav.scrollWidth - nav.clientWidth;
          const gauche = nav.scrollLeft > 4;
          const droite = nav.scrollLeft < fin - 4;
          const suite = gauche && droite ? "deux" : gauche ? "gauche" : droite ? "droite" : "";
          if (nav.dataset.suite !== suite) nav.dataset.suite = suite;
        }
      });
    };
    marque();
    const defile = (e: Event) => { if (e.target instanceof HTMLElement && e.target.classList.contains("onglets")) marque(); };
    document.addEventListener("scroll", defile, { capture: true, passive: true });
    window.addEventListener("resize", marque);
    const observe = new MutationObserver(marque);
    observe.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(image);
      document.removeEventListener("scroll", defile, { capture: true });
      window.removeEventListener("resize", marque);
      observe.disconnect();
    };
  }, []);
  return null;
}
