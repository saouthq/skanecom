"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* ============================================================================
   LA PHOTO QUI MÈNE À LA FICHE — un clic sur une carte produit, et sa photo
   ne disparaît pas avec la page : elle grandit et se pose à sa place sur la
   fiche, pendant que le reste de la page change en fondu. On ne perd pas des
   yeux l'article qu'on a choisi.

   L'API des transitions de vue du navigateur (document.startViewTransition),
   sans bibliothèque : ce composant intercepte le clic (avant le lien), nomme
   la photo de la carte, lance la navigation dans la transition, attend que la
   fiche soit rendue (sa galerie porte data-fiche = le produit), nomme sa
   première photo du même nom — le navigateur fait le reste. L'en-tête et le
   bouton WhatsApp, eux, ne bougent pas (html[data-vt], vitrine-mouvement.css).

   Rien de tout cela sans l'API, avec « réduire les animations », ni pour un
   clic qui n'est pas un simple clic (Ctrl, Cmd, Maj, bouton du milieu : un
   nouvel onglet) : le lien fait alors son travail ordinaire.
   ========================================================================== */

const NOM = "vt-photo";
/** Pendant l'attente, la page est figée : au-delà, la transition part sans la
 *  fiche (elle arrivera sans animation) plutôt que de laisser croire à une panne. */
const ATTENTE_MAX = 1200;

type AvecTransitions = Document & {
  startViewTransition?: (miseAJour: () => Promise<void>) => { finished: Promise<void> };
};

/** Le premier élément qui correspond, dès qu'il existe (ou `null` au bout du délai). */
function attends(selecteur: string, delai: number): Promise<HTMLElement | null> {
  return new Promise((resoudre) => {
    const trouve = () => document.querySelector<HTMLElement>(selecteur);
    const deja = trouve();
    if (deja) return resoudre(deja);
    const observateur = new MutationObserver(() => {
      const el = trouve();
      if (el) fin(el);
    });
    const minuterie = window.setTimeout(() => fin(null), delai);
    function fin(el: HTMLElement | null) {
      observateur.disconnect();
      window.clearTimeout(minuterie);
      resoudre(el);
    }
    observateur.observe(document.body, { childList: true, subtree: true });
  });
}

export function TransitionsVue() {
  const router = useRouter();

  useEffect(() => {
    const doc = document as AvecTransitions;
    if (typeof doc.startViewTransition !== "function") return;
    const reduit = matchMedia("(prefers-reduced-motion: reduce)");
    let enCours = false;

    const auClic = (e: MouseEvent) => {
      if (enCours || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || reduit.matches) return;
      const lien = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(lien instanceof HTMLAnchorElement) || (lien.target && lien.target !== "_self") || lien.hasAttribute("download")) return;
      const url = new URL(lien.href, window.location.href);
      const produit = url.origin === window.location.origin ? /^\/produit\/([^/]+)\/?$/.exec(url.pathname) : null;
      if (!produit || url.pathname === window.location.pathname) return;
      const photo = lien.querySelector<HTMLElement>(".cadre-image");
      if (!photo || photo.getBoundingClientRect().width === 0) return;

      e.preventDefault();
      enCours = true;
      const racine = document.documentElement;
      const slug = decodeURIComponent(produit[1]);
      let arrivee: HTMLElement | null = null;

      // La carte telle qu'au repos (pas sa deuxième photo de survol), nommée.
      lien.dataset.vtDepart = "";
      photo.style.viewTransitionName = NOM;
      racine.dataset.vt = "fiche";

      const transition = doc.startViewTransition!(async () => {
        photo.style.viewTransitionName = "";
        delete lien.dataset.vtDepart;
        router.push(url.pathname + url.search + url.hash);
        arrivee = await attends(`[data-fiche="${CSS.escape(slug)}"] .cadre-image`, ATTENTE_MAX);
        if (arrivee) arrivee.style.viewTransitionName = NOM;
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      });
      transition.finished.finally(() => {
        if (arrivee) arrivee.style.viewTransitionName = "";
        delete racine.dataset.vt;
        enCours = false;
      });
    };

    // En capture, sur window : avant le lien lui-même, qui navigue sinon seul.
    window.addEventListener("click", auClic, true);
    return () => window.removeEventListener("click", auClic, true);
  }, [router]);

  return null;
}
