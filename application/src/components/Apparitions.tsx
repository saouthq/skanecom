"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/* ============================================================================
   LES APPARITIONS — sur la vitrine, les sections et les cartes montent en
   place quand elles entrent à l'écran, en cascade (70 ms entre deux cartes
   d'une même rangée). Le style est dans app/vitrine-mouvement.css.

   Trois garde-fous :
   · ce qui est déjà à l'écran au chargement est marqué « vu » AVANT que la
     règle qui cache ne s'applique : rien ne clignote ;
   · sans JavaScript, ou avec « réduire les animations », rien n'est caché ;
   · les cartes ajoutées plus tard (filtres, « voir plus ») sont suivies.
   ========================================================================== */

export const CIBLES_APPARITION = [
  ".apparait", ".ed-section", ".ed-recit", ".ed-engagements", ".te-section", ".ed-carte", ".te-carte",
  ".te-pied-services li", ".ed-pied-grille > *", ".te-pied-grille > *", ".sav-grille > section",
].join(", ");

export function Apparitions() {
  const chemin = usePathname();

  useEffect(() => {
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const racine = document.documentElement;
    const hauteur = window.innerHeight;

    const io = new IntersectionObserver((entrees) => {
      const visibles = entrees
        .filter((e) => e.isIntersecting)
        .map((e) => e.target as HTMLElement)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      visibles.forEach((el, i) => {
        el.style.setProperty("--delai", `${Math.min(i, 6) * 70}ms`);
        el.dataset.vu = "";
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });

    const suivre = () => {
      document.querySelectorAll<HTMLElement>(CIBLES_APPARITION).forEach((el) => {
        if ("vu" in el.dataset || el.dataset.suivi) return;
        el.dataset.suivi = "";
        // Déjà à l'écran (ou au-dessus) : visible tout de suite, sans animation.
        if (!racine.classList.contains("js-apparitions") && el.getBoundingClientRect().top < hauteur) {
          el.dataset.vu = "";
          return;
        }
        io.observe(el);
      });
    };
    suivre();
    racine.classList.add("js-apparitions");

    let prevu = 0;
    const mo = new MutationObserver(() => {
      if (prevu) return;
      prevu = requestAnimationFrame(() => {
        prevu = 0;
        suivre();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(prevu);
    };
  }, [chemin]);

  return null;
}
