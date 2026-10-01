"use client";

import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Chevron } from "./Icones";
import { t } from "@/lib/i18n";

/* ============================================================================
   LE BANDEAU QUI DÉFILE — au téléphone, les annonces de la boutique (son
   annonce, puis ses faits de service : paiement à la livraison, livraison
   offerte, retrait, garantie…) passent une à une, au lieu de la seule
   première. Sur ordinateur, rien ne bouge : elles tiennent côte à côte.

   · Une annonce toutes les cinq secondes, qui monte et s'efface ; arrêté au
     survol, au focus, pendant qu'on touche la barre, et pour de bon dès
     qu'on se sert des flèches (on a la main : WCAG 2.2.2). Mouvement réduit
     demandé : aucun défilement tout seul, les flèches restent.
   · Toutes les annonces restent dans la page, l'une sur l'autre : un
     lecteur d'écran les lit toutes, dans l'ordre, sans annonce vocale à
     chaque passage. Seule l'annonce montrée se voit.
   · La première garde son data-reglage : dans l'éditeur, on l'écrit sur
     place ; le défilement s'arrête dès qu'on la survole ou qu'on y écrit.
   ========================================================================== */

const INTERVALLE = 5000;

export function BandeauDefilant({ balise = "p", className, children }: { balise?: "p" | "ul"; className?: string; children: ReactNode }) {
  const elements = Children.toArray(children).filter(isValidElement) as ReactElement<{ "data-actif"?: string }>[];
  const n = elements.length;
  const [actif, setActif] = useState(0);
  const [arrete, setArrete] = useState(false);
  const [suspendu, setSuspendu] = useState(false);
  const [telephone, setTelephone] = useState(false);
  const racine = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const m = matchMedia("(max-width: 899px)");
    const suit = () => setTelephone(m.matches);
    suit();
    m.addEventListener("change", suit);
    return () => m.removeEventListener("change", suit);
  }, []);

  useEffect(() => {
    if (!telephone || n < 2 || arrete || suspendu) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Dans le cadre de l'éditeur, l'annonce s'écrit sur place : elle ne bouge pas.
    if (window.self !== window.top) return;
    const minuterie = setInterval(() => {
      // Onglet en arrière-plan : on ne fait pas défiler pour personne.
      if (document.visibilityState === "visible") setActif((i) => (i + 1) % n);
    }, INTERVALLE);
    return () => clearInterval(minuterie);
  }, [telephone, n, arrete, suspendu]);

  const Balise = balise;
  const liste = elements.map((e, i) => cloneElement(e, { "data-actif": i === actif ? "" : undefined }));
  if (n < 2) return <Balise className={className}>{liste}</Balise>;

  const va = (pas: number) => {
    setArrete(true);
    setActif((i) => (i + pas + n) % n);
  };
  return (
    <div
      ref={racine}
      className="bandeau-defilant"
      role="region"
      aria-label={t.annonce.region}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setSuspendu(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setSuspendu(false); }}
      onPointerDown={() => setSuspendu(true)}
      onPointerUp={(e) => {
        // Au doigt : reprend quand on lâche, sauf si l'on écrit dedans (éditeur).
        if (e.pointerType !== "mouse" && !racine.current?.contains(document.activeElement)) setSuspendu(false);
      }}
      onFocus={() => setSuspendu(true)}
      onBlur={(e) => { if (!racine.current?.contains(e.relatedTarget as Node | null)) setSuspendu(false); }}
    >
      <button type="button" className="bandeau-fleche cache-desktop" aria-label={t.annonce.precedente} onClick={() => va(-1)}>
        <Chevron taille={14} className="bandeau-fleche-prec" />
      </button>
      <Balise className={className}>{liste}</Balise>
      <button type="button" className="bandeau-fleche cache-desktop" aria-label={t.annonce.suivante} onClick={() => va(1)}>
        <Chevron taille={14} className="bandeau-fleche-suiv" />
      </button>
    </div>
  );
}
