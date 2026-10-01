"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { Fleche } from "./Icones";
import { t } from "@/lib/i18n";

/* ============================================================================
   UNE RANGÉE QUI GLISSE (structure immersive) — des pièces ou des collections
   côte à côte, qui défilent au doigt, à la molette ou par les deux flèches ;
   le compteur dit où l'on est (« 02 / 06 »). Chaque élément s'accroche au
   bord (scroll-snap). Au clavier, Tab parcourt les liens un à un et la
   rangée suit d'elle-même ; les flèches restent des boutons ordinaires.
   ========================================================================== */

export function Rail({ tete, libelle, className = "", children }: {
  /** Le titre de la rangée (et son lien), à gauche des flèches. */
  tete: ReactNode;
  /** Le nom de la liste, pour les lecteurs d'écran. */
  libelle: string;
  className?: string;
  /** Des <li>. */
  children: ReactNode;
}) {
  const liste = useRef<HTMLUListElement>(null);
  const total = Children.count(children);
  const [position, setPosition] = useState(1);
  const [bords, setBords] = useState({ debut: true, fin: total <= 1 });

  useEffect(() => {
    const el = liste.current;
    if (!el) return;
    const lire = () => {
      const premier = el.firstElementChild as HTMLElement | null;
      const pas = premier ? premier.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || "0") : el.clientWidth;
      const fait = Math.abs(el.scrollLeft);
      const reste = el.scrollWidth - el.clientWidth - fait;
      setPosition(Math.min(total, Math.max(1, Math.round(fait / Math.max(pas, 1)) + 1)));
      setBords({ debut: fait < 4, fin: reste < 4 });
    };
    lire();
    el.addEventListener("scroll", lire, { passive: true });
    const o = new ResizeObserver(lire);
    o.observe(el);
    return () => { el.removeEventListener("scroll", lire); o.disconnect(); };
  }, [total]);

  const glisser = (sens: 1 | -1) => {
    const el = liste.current;
    const premier = el?.firstElementChild as HTMLElement | null;
    if (!el || !premier) return;
    const pas = premier.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || "0");
    // De droite à gauche, la rangée défile vers les valeurs négatives.
    const rtl = getComputedStyle(el).direction === "rtl" ? -1 : 1;
    el.scrollBy({ left: sens * pas * rtl, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <div className={`im-rail ${className}`.trim()}>
      <div className="im-rail-tete">
        <div className="im-rail-titre">{tete}</div>
        {total > 1 ? (
          <div className="im-rail-gestes">
            <span className="im-rail-position" aria-hidden="true">{t.accueil.railPosition(position, total)}</span>
            <button type="button" className="im-rail-fleche" onClick={() => glisser(-1)} disabled={bords.debut} aria-label={t.accueil.railPrecedent}>
              <Fleche taille={18} className="-scale-x-100 rtl:scale-x-100" />
            </button>
            <button type="button" className="im-rail-fleche" data-plein="" onClick={() => glisser(1)} disabled={bords.fin} aria-label={t.accueil.railSuivant}>
              <Fleche taille={18} className="rtl:-scale-x-100" />
            </button>
          </div>
        ) : null}
      </div>
      <ul ref={liste} className="im-rail-liste" role="list" aria-label={libelle}>
        {children}
      </ul>
    </div>
  );
}
