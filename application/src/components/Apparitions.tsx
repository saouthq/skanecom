"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { rafraichiALInstant } from "@/lib/apercu-cadre";

/* ============================================================================
   LES APPARITIONS — sur la vitrine, les sections et les cartes montent en
   place quand elles entrent à l'écran, en cascade (70 ms entre deux cartes
   d'une même rangée). Le style est dans app/vitrine-mouvement.css.

   Les photos des produits et des rayons, elles, arrivent en fondu une fois
   chargées, au lieu de se peindre ligne à ligne sur l'aplat : celles déjà
   chargées sont marquées d'emblée, les autres le sont à leur arrivée (ou à
   leur échec : l'aplat et le texte de remplacement restent lisibles).

   Trois garde-fous :
   · ce qui est déjà à l'écran au chargement est marqué « vu » AVANT que la
     règle qui cache ne s'applique : rien ne clignote ;
   · sans JavaScript, ou avec « réduire les animations », rien n'est caché ;
   · les cartes et les photos ajoutées plus tard (filtres, « voir plus »)
     sont suivies.
   ========================================================================== */

export const CIBLES_APPARITION = [
  ".apparait", ".ed-section", ".ed-recit", ".ed-engagements", ".te-section", ".ed-carte", ".te-carte",
  ".te-pied-services li", ".ed-pied-grille > *", ".te-pied-grille > *", ".sav-grille > section",
  // Le récit de l'Immersif : marqué seulement — il se dévoile par morceaux (app/immersif.css).
  ".im-recit",
].join(", ");

export function Apparitions() {
  const chemin = usePathname();

  useEffect(() => {
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // La boutique a coupé les animations (écran « Apparence »).
    if (document.documentElement.dataset.animations === "non") return;
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
        // Déjà à l'écran (ou au-dessus) : visible tout de suite, sans animation —
        // de même pour toute la page rendue de nouveau dans l'aperçu de l'éditeur.
        if (rafraichiALInstant() || (!racine.classList.contains("js-apparitions") && el.getBoundingClientRect().top < hauteur)) {
          el.dataset.vu = "";
          return;
        }
        io.observe(el);
      });
    };
    const suivrePhotos = () => {
      document.querySelectorAll<HTMLImageElement>(".cadre-image img.photo-principale:not([data-chargee]):not([data-attendue])").forEach((img) => {
        const chargee = () => { img.dataset.chargee = ""; };
        // Déjà là, ou la page vient d'être rendue de nouveau dans l'aperçu : sans fondu.
        if (img.complete || rafraichiALInstant()) return chargee();
        img.dataset.attendue = "";
        img.addEventListener("load", chargee, { once: true });
        img.addEventListener("error", chargee, { once: true });
      });
    };

    suivre();
    suivrePhotos();
    racine.classList.add("js-apparitions", "js-photos");

    let prevu = 0;
    const mo = new MutationObserver(() => {
      if (prevu) return;
      prevu = requestAnimationFrame(() => {
        prevu = 0;
        suivre();
        suivrePhotos();
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
