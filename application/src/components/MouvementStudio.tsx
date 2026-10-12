"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/* ============================================================================
   LE MOUVEMENT DU STUDIO (animations « expressives », app/studio.css) — ce
   qui fait qu'un site se sent vivant sous la main, sans bibliothèque :

   · le CURSEUR : un rond qui suit la souris avec un léger retard, grandit
     sur ce qui se clique, et dit « Voir le projet » ou « Agrandir » sur ce
     qui porte data-curseur (le vrai curseur reste là : rien ne se perd) ;
   · l'AIMANT : les boutons data-aimant viennent un peu à la rencontre de
     la souris qui s'en approche ;
   · le DÉFILEMENT DOUX : la molette glisse avec de l'inertie (les touches,
     la barre de défilement et le doigt restent ceux du système) ;
   · le RIDEAU : d'une page à l'autre, un rideau à la couleur de la maison
     monte, dit où l'on va, et se retire sur la nouvelle page (la photo
     d'une réalisation, elle, garde sa transition : TransitionsVue) ;
   · l'EN-TÊTE s'efface quand on descend, revient dès qu'on remonte ;
   · le BANDEAU des domaines accélère avec la vitesse du défilement ;
   · la PHOTO d'un domaine suit la souris le long de sa ligne.

   Rien de tout cela hors du Studio, sans le style expressif, avec « réduire
   les animations », ni dans un cadre (l'éditeur de la vitrine, la galerie
   des modèles : un clic y sert à éditer, pas à naviguer). Le curseur,
   l'aimant et la molette : à la souris seulement (pointer: fine).
   ========================================================================== */

const actif = () =>
  document.documentElement.dataset.structure === "studio" &&
  document.documentElement.dataset.animations === "expressives" &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches &&
  window.self === window.top;

const souris = () => matchMedia("(hover: hover) and (pointer: fine)").matches;

/** Un élément entre la cible et le document peut-il défiler lui-même dans ce sens ? */
function defilableDans(cible: EventTarget | null, dy: number): boolean {
  let el = cible instanceof Element ? cible : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      if ((dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) || (dy < 0 && el.scrollTop > 0)) return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** La page est-elle tenue (un tiroir, le menu, une visionneuse ouverts) ? */
function pageTenue(): boolean {
  const h = getComputedStyle(document.documentElement);
  const b = getComputedStyle(document.body);
  return h.overflowY === "hidden" || b.overflowY === "hidden" || b.position === "fixed" || Boolean(document.querySelector("dialog[open]"));
}

export function MouvementStudio({ studio = false }: { studio?: boolean }) {
  const chemin = usePathname();
  const router = useRouter();
  const premier = useRef(true);
  const rideauAttendu = useRef(false);
  const curseur = useRef<HTMLDivElement>(null);
  const curseurTexte = useRef<HTMLSpanElement>(null);
  const rideauNom = useRef<HTMLSpanElement>(null);

  // D'une page à l'autre : l'élan du contenu, et le rideau qui se retire.
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    const racine = document.documentElement;
    if (racine.dataset.animations !== "expressives") return;
    racine.dataset.navigue = "";
    let retrait = 0;
    if (rideauAttendu.current) {
      rideauAttendu.current = false;
      // Deux images plus tard : la nouvelle page est peinte sous le rideau.
      requestAnimationFrame(() => requestAnimationFrame(() => { racine.dataset.rideau = "sort"; }));
      retrait = window.setTimeout(() => { delete racine.dataset.rideau; }, 900);
    }
    const fin = window.setTimeout(() => { delete racine.dataset.navigue; }, 800);
    return () => {
      window.clearTimeout(fin);
      window.clearTimeout(retrait);
      delete racine.dataset.navigue;
    };
  }, [chemin]);

  useEffect(() => {
    if (!studio || !actif()) return;
    const racine = document.documentElement;
    const nettoyages: (() => void)[] = [];
    const ecoute = <K extends keyof WindowEventMap>(type: K, f: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => {
      window.addEventListener(type, f, o);
      nettoyages.push(() => window.removeEventListener(type, f, o));
    };

    // ---------------------------------------------------------------- le rideau
    let attente = 0;
    ecoute("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const lien = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(lien instanceof HTMLAnchorElement) || (lien.target && lien.target !== "_self") || lien.hasAttribute("download")) return;
      const url = new URL(lien.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (lien.closest("[data-sans-rideau]")) return;
      e.preventDefault();
      if (rideauNom.current) rideauNom.current.textContent = (lien.dataset.rideau ?? lien.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
      racine.dataset.rideau = "entre";
      rideauAttendu.current = true;
      window.clearTimeout(attente);
      attente = window.setTimeout(() => {
        router.push(url.pathname + url.search + url.hash);
        // Une navigation qui n'aboutit pas ne laisse pas le rideau tiré.
        attente = window.setTimeout(() => {
          if (racine.dataset.rideau === "entre") { delete racine.dataset.rideau; rideauAttendu.current = false; }
        }, 6000);
      }, 520);
    }, { capture: true });
    nettoyages.push(() => window.clearTimeout(attente));

    // ---------------------------------------------------------------- l'en-tête, le bandeau
    let dernierY = window.scrollY;
    let vitesse = 0;
    const entete = document.querySelector<HTMLElement>(".ed-entete");
    let bandeauRaf = 0;
    // Le bandeau suit la vitesse, puis revient à son pas : la boucle ne tourne que le temps du retour.
    const bandeau = () => {
      vitesse *= 0.92;
      const calme = Math.abs(vitesse) < 0.05;
      const rythme = calme ? 1 : 1 + Math.min(Math.abs(vitesse) / 6, 5);
      for (const piste of document.querySelectorAll<HTMLElement>(".st-bandeau-piste")) {
        for (const a of piste.getAnimations()) a.playbackRate = vitesse < -0.5 ? -rythme : rythme;
      }
      bandeauRaf = calme ? 0 : requestAnimationFrame(bandeau);
    };
    nettoyages.push(() => cancelAnimationFrame(bandeauRaf));
    ecoute("scroll", () => {
      const y = window.scrollY;
      const dy = y - dernierY;
      dernierY = y;
      vitesse = vitesse * 0.6 + dy * 0.4;
      if (!bandeauRaf) bandeauRaf = requestAnimationFrame(bandeau);
      if (y < 160 || dy < -3) delete racine.dataset.entete;
      else if (dy > 3 && !entete?.contains(document.activeElement) && !pageTenue()) racine.dataset.entete = "cache";
    }, { passive: true });
    const auFocus = (e: FocusEvent) => { if (entete?.contains(e.target as Node)) delete racine.dataset.entete; };
    document.addEventListener("focusin", auFocus);
    nettoyages.push(() => { document.removeEventListener("focusin", auFocus); delete racine.dataset.entete; });


    if (!souris()) return () => nettoyages.forEach((f) => f());

    // ---------------------------------------------------------------- le défilement doux
    let cible = window.scrollY;
    let courant = window.scrollY;
    let glisse = false;
    let parNous = false;
    let avant = 0;
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    const pas = (t: number) => {
      const dt = avant ? Math.min(64, t - avant) : 16.7;
      avant = t;
      courant += (cible - courant) * (1 - Math.pow(1 - 0.12, dt / 16.7));
      if (Math.abs(cible - courant) < 0.5) { courant = cible; glisse = false; avant = 0; }
      parNous = true;
      window.scrollTo({ top: courant, left: window.scrollX, behavior: "instant" });
      if (glisse) requestAnimationFrame(pas);
    };
    ecoute("wheel", (e) => {
      if (e.defaultPrevented || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (defilableDans(e.target, e.deltaY) || pageTenue()) return;
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      if (!glisse) courant = cible = window.scrollY;
      cible = Math.max(0, Math.min(max(), cible + d));
      if (!glisse) { glisse = true; requestAnimationFrame(pas); }
    }, { passive: false });
    // Le clavier, la barre, une ancre : le défilement reprend sa place.
    ecoute("scroll", () => {
      if (parNous) { parNous = false; return; }
      if (!glisse) cible = courant = window.scrollY;
    }, { passive: true });

    // ---------------------------------------------------------------- le curseur, l'aimant, la photo du domaine
    const rond = curseur.current;
    const etiquette = curseurTexte.current;
    let x = -100, y = -100, cx = -100, cy = -100;
    let suit = 0;
    const aimants = new Set<HTMLElement>();
    const deplace = () => {
      cx += (x - cx) * 0.2;
      cy += (y - cy) * 0.2;
      // translate, pas transform : la propriété scale (l'état du rond) s'applique sous translate, jamais à la position.
      if (rond) rond.style.translate = `${cx}px ${cy}px`;
      suit = Math.abs(x - cx) + Math.abs(y - cy) > 0.3 ? requestAnimationFrame(deplace) : 0;
    };
    racine.dataset.curseurActif = "";
    nettoyages.push(() => { delete racine.dataset.curseurActif; cancelAnimationFrame(suit); });

    ecoute("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      if (cx < -50) { cx = x; cy = y; }
      if (!suit) suit = requestAnimationFrame(deplace);
      // L'aimant : chaque bouton proche vient à la rencontre de la souris, 14 px au plus.
      for (const a of document.querySelectorAll<HTMLElement>("[data-aimant]")) {
        const r = a.getBoundingClientRect();
        const dx = x - (r.left + r.width / 2);
        const dy = y - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) < Math.max(r.width, r.height) / 2 + 60) {
          aimants.add(a);
          a.style.translate = `${Math.max(-14, Math.min(14, dx * 0.3))}px ${Math.max(-14, Math.min(14, dy * 0.3))}px`;
        } else if (aimants.has(a)) {
          aimants.delete(a);
          a.style.translate = "";
        }
      }
      // La photo du domaine survolé suit la souris le long de sa ligne.
      const domaine = e.target instanceof Element ? e.target.closest<HTMLElement>(".st-domaine") : null;
      if (domaine) domaine.style.setProperty("--mx", `${e.clientX - domaine.getBoundingClientRect().left}px`);
    }, { passive: true });

    ecoute("pointerover", (e) => {
      if (!rond || !etiquette || e.pointerType !== "mouse") return;
      const el = e.target instanceof Element ? e.target : null;
      const dit = el?.closest<HTMLElement>("[data-curseur]");
      if (el?.closest("input, textarea, select, [contenteditable], iframe")) rond.dataset.etat = "cache";
      else if (dit) { rond.dataset.etat = "texte"; etiquette.textContent = dit.dataset.curseur ?? ""; }
      else if (el?.closest("a[href], button, summary, label, [role=button]")) rond.dataset.etat = "lien";
      else delete rond.dataset.etat;
    }, { passive: true });
    const sort = () => { if (rond) rond.dataset.etat = "cache"; };
    document.documentElement.addEventListener("pointerleave", sort);
    nettoyages.push(() => document.documentElement.removeEventListener("pointerleave", sort));
    ecoute("blur", sort);
    ecoute("pointerdown", () => rond?.setAttribute("data-appuye", ""), { passive: true });
    ecoute("pointerup", () => rond?.removeAttribute("data-appuye"), { passive: true });
    nettoyages.push(() => aimants.forEach((a) => { a.style.translate = ""; }));

    return () => nettoyages.forEach((f) => f());
  }, [studio, router]);

  if (!studio) return null;
  return (
    <>
      <div className="st-rideau" aria-hidden="true"><span ref={rideauNom} className="st-rideau-nom" /></div>
      <div ref={curseur} className="st-curseur" aria-hidden="true"><span ref={curseurTexte} className="st-curseur-texte" /></div>
      <div className="st-progression" aria-hidden="true" />
      <div className="st-grain" aria-hidden="true" />
    </>
  );
}
