"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Chevron } from "./Icones";
import { PhotoOuverture } from "./PhotoOuverture";
import { t } from "@/lib/i18n";

/* ============================================================================
   LES BANNIÈRES QUI DÉFILENT (section « bannieres », migration 75) — une à
   cinq bannières, en bande qu'on fait glisser au doigt ; sous elles, les
   points (une bannière chacun), la pause et les flèches.

   · Défilent seules toutes les six secondes tant que la bande est à l'écran,
     l'onglet visible ; arrêtées au survol, au focus, au toucher, et pour de
     bon après un geste (flèches, points, glissé) ou par le bouton pause
     (WCAG 2.2.2). Aucun défilement seul si le mouvement réduit est demandé,
     ni dans le cadre de l'éditeur.
   · Chaque bannière : sa photo (son cadrage en hauteur au téléphone), son
     titre, son texte, son bouton vers une page de la boutique. Sans photo,
     sur un aplat. La première seule se charge en priorité, si la section
     ouvre la page.
   · Le lecteur d'écran : une région « À la une », chaque bannière
     « Bannière 2 sur 3 » ; un geste dit la bannière montrée.
   ========================================================================== */

export type DiapoVue = {
  titre: string;
  texte: string;
  cta: string;
  lien: string | null;
  alt: string;
  paysage: string | null;
  portrait: string | null;
};

const INTERVALLE = 6000;

export function Bannieres({ rang, etiquette, titre, diapos }: {
  rang: number;
  etiquette: string;
  titre: string;
  diapos: DiapoVue[];
}) {
  const n = diapos.length;
  const piste = useRef<HTMLDivElement>(null);
  const racine = useRef<HTMLElement>(null);
  const [actif, setActif] = useState(0);
  const [arrete, setArrete] = useState(false);
  const [suspendu, setSuspendu] = useState(false);
  const [visible, setVisible] = useState(false);
  const [annonce, setAnnonce] = useState("");

  // Où en est la bande : la bannière la plus à l'écran.
  useEffect(() => {
    const p = piste.current;
    if (!p) return;
    let image = 0;
    const suit = () => {
      cancelAnimationFrame(image);
      image = requestAnimationFrame(() => setActif(Math.min(n - 1, Math.round(Math.abs(p.scrollLeft) / Math.max(1, p.clientWidth)))));
    };
    p.addEventListener("scroll", suit, { passive: true });
    return () => { p.removeEventListener("scroll", suit); cancelAnimationFrame(image); };
  }, [n]);

  // Elles ne défilent que sous les yeux.
  useEffect(() => {
    const r = racine.current;
    if (!r || typeof IntersectionObserver === "undefined") return;
    const o = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    o.observe(r);
    return () => o.disconnect();
  }, []);

  const va = (i: number, geste: boolean) => {
    const p = piste.current;
    if (!p) return;
    const cible = (i + n) % n;
    const rtl = getComputedStyle(p).direction === "rtl";
    const doux = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    p.scrollTo({ left: cible * p.clientWidth * (rtl ? -1 : 1), behavior: doux ? "smooth" : "auto" });
    if (geste) {
      setArrete(true);
      setAnnonce(t.accueil.banniereN(cible + 1, n));
    }
  };

  useEffect(() => {
    if (n < 2 || arrete || suspendu || !visible) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Dans le cadre de l'éditeur, la vitrine se règle : elle ne bouge pas seule.
    if (window.self !== window.top) return;
    const minuterie = setInterval(() => {
      if (document.visibilityState === "visible") va(actif + 1, false);
    }, INTERVALLE);
    return () => clearInterval(minuterie);
    // va lit la bande au moment voulu ; actif relance le compte à chaque bannière.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, arrete, suspendu, visible, actif]);

  const idTitre = titre ? `bnr-titre-${rang}` : undefined;
  return (
    <section
      ref={racine}
      className="enveloppe bnr"
      aria-roledescription="carrousel"
      aria-label={titre ? undefined : t.accueil.bannieresAria}
      aria-labelledby={idTitre}
      data-section={rang}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setSuspendu(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setSuspendu(false); }}
      onFocus={() => setSuspendu(true)}
      onBlur={(e) => { if (!racine.current?.contains(e.relatedTarget as Node | null)) setSuspendu(false); }}
    >
      {titre ? (
        <div className="ed-section-tete bnr-tete">
          <div>
            {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
            <h2 id={idTitre} key={titre} data-texte="titre">{titre}</h2>
          </div>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">{annonce}</p>
      <div ref={piste} className="bnr-piste" onTouchStart={() => setArrete(true)}>
        {diapos.map((d, i) => {
          // Sous le titre de la section, des h3 ; sans lui, chaque bannière a le sien.
          const Titre = titre ? "h3" : "h2";
          const corps = (
            <>
              {d.paysage ? (
                <PhotoOuverture className="bnr-photo" paysage={d.paysage} portrait={d.portrait ?? undefined} alt={d.alt} prioritaire={rang === 0 && i === 0} />
              ) : null}
              <div className="bnr-texte">
                {d.titre ? <Titre className="bnr-titre">{d.titre}</Titre> : null}
                {d.texte ? <p className="bnr-chapo">{d.texte}</p> : null}
                {d.lien ? <span className="btn btn-primaire bnr-cta">{d.cta || t.accueil.banniereDecouvrir}</span> : null}
              </div>
            </>
          );
          return (
            <div key={i} className="bnr-diapo" role="group" aria-roledescription="diapositive" aria-label={t.accueil.banniereN(i + 1, n)}
              data-photo={d.paysage ? "" : undefined} data-actif={i === actif ? "" : undefined}>
              {/* Toute la bannière mène à sa page : le bouton n'en est que le signe. */}
              {d.lien ? <Link className="bnr-lien" href={d.lien}>{corps}</Link> : <div className="bnr-lien">{corps}</div>}
            </div>
          );
        })}
      </div>
      {n > 1 ? (
        <div className="bnr-commandes">
          <div className="bnr-points" role="group" aria-label={t.accueil.bannieresChoix}>
            {diapos.map((_, i) => (
              <button key={i} type="button" className="bnr-point" aria-label={t.accueil.banniereN(i + 1, n)} aria-current={i === actif ? "true" : undefined} onClick={() => va(i, true)} />
            ))}
          </div>
          <div className="bnr-gestes">
            <button type="button" className="bnr-geste" aria-label={arrete ? t.accueil.bannieresLecture : t.accueil.bannieresPause}
              aria-pressed={arrete} onClick={() => setArrete((a) => !a)}>
              {arrete ? (
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /></svg>
              )}
            </button>
            <button type="button" className="bnr-geste" aria-label={t.accueil.bannierePrecedente} onClick={() => va(actif - 1, true)}>
              <Chevron taille={16} className="bnr-prec" />
            </button>
            <button type="button" className="bnr-geste" aria-label={t.accueil.banniereSuivante} onClick={() => va(actif + 1, true)}>
              <Chevron taille={16} className="bnr-suiv" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
