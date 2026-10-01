"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Fleche } from "./Icones";
import { t } from "@/lib/i18n";

/* ============================================================================
   LE LOOKBOOK — la photo d'un look, et sur elle un point par pièce portée.
   Un point est un bouton : touché, il ouvre la carte de la pièce (photo,
   nom, prix, « Voir la pièce ») ; Échap ou un toucher ailleurs la ferme. À
   côté (dessous au téléphone), les mêmes pièces en liste : c'est aussi le
   chemin du clavier et des lecteurs d'écran, et survoler une ligne désigne
   son point. La photo garde ses proportions : un point posé en pour cent
   reste sur sa pièce quelle que soit la largeur de l'écran.
   ========================================================================== */

export type PieceLook = { x: number; y: number; slug: string; nom: string; prix: string | null; photo: { src: string; alt: string } | null };

export function Lookbook({ rang, etiquette, titre, image, pieces }: {
  rang: number;
  etiquette: string;
  titre: string;
  image: { src: string; alt: string };
  pieces: PieceLook[];
}) {
  // La première carte ouverte d'emblée : on voit tout de suite ce que fait un
  // point. Elle reste ouverte tant qu'on ne touche pas au lookbook : un geste
  // ailleurs sur la page (fermer le panier, choisir une taille) ne la ferme
  // pas ; une carte ouverte par le visiteur, si.
  const [ouvert, setOuvert] = useState<number | null>(pieces.length ? 0 : null);
  const [choisie, setChoisie] = useState(false);
  const [vise, setVise] = useState<number | null>(null);
  // Les proportions de la photo, lues à son chargement ; d'ici là, un 4:5 :
  // la scène a sa taille d'emblée, les points et la carte aussi.
  const [ratio, setRatio] = useState<number | null>(null);
  const section = useRef<HTMLElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const idCarte = `lk-${rang}-carte`;
  const ouvrir = (i: number | null) => { setChoisie(true); setOuvert(i); };

  useEffect(() => {
    if (ouvert === null) return;
    const echap = (e: KeyboardEvent) => {
      const focus = document.activeElement;
      if (e.key === "Escape" && (section.current?.contains(focus) || (choisie && focus === document.body))) setOuvert(null);
    };
    const ailleurs = (e: PointerEvent) => {
      if (choisie && scene.current && !scene.current.contains(e.target as Node)) setOuvert(null);
    };
    document.addEventListener("keydown", echap);
    document.addEventListener("pointerdown", ailleurs);
    return () => { document.removeEventListener("keydown", echap); document.removeEventListener("pointerdown", ailleurs); };
  }, [ouvert, choisie]);

  const carte = ouvert !== null ? pieces[ouvert] : null;

  return (
    <section ref={section} className="enveloppe lk" data-section={rang}>
      <div className="lk-grille">
        <div ref={scene} className="lk-scene" style={ratio ? ({ "--lk-ratio": ratio } as React.CSSProperties) : undefined}>
          {/* La scène prend les proportions de la photo elle-même : les points restent sur leurs pièces. */}
          <Image src={image.src} alt={image.alt} width={1200} height={1500} sizes="(min-width: 900px) 55vw, 100vw" className="lk-photo"
            onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setRatio(Math.round((i.naturalWidth / i.naturalHeight) * 1000) / 1000); }} />
          {pieces.map((p, i) => (
            <button key={`${p.slug}-${i}`} type="button" className="lk-point" style={{ left: `${p.x}%`, top: `${p.y}%` }}
              data-ouvert={ouvert === i ? "" : undefined} data-vise={vise === i ? "" : undefined}
              aria-label={t.accueil.lookbookPoint(p.nom)} aria-expanded={ouvert === i} aria-controls={idCarte}
              onClick={() => ouvrir(ouvert === i ? null : i)}>
              <span aria-hidden="true" />
            </button>
          ))}
          {carte ? (
            <div id={idCarte} className="lk-carte" data-cote={carte.x > 55 ? "debut" : "fin"}
              style={{ left: `${carte.x}%`, top: `${carte.y}%` }}>
              {carte.photo ? (
                <span className="lk-carte-photo">
                  <Image src={carte.photo.src} alt="" fill sizes="96px" />
                </span>
              ) : null}
              <span className="lk-carte-texte">
                <b>{carte.nom}</b>
                {carte.prix ? <span>{carte.prix}</span> : null}
                <Link href={`/produit/${carte.slug}`} className="lk-carte-lien">
                  {t.accueil.lookbookVoir} <Fleche taille={14} className="rtl:-scale-x-100" />
                </Link>
              </span>
              <button type="button" className="lk-carte-fermer" onClick={() => ouvrir(null)} aria-label={t.accueil.lookbookFermer}>×</button>
            </div>
          ) : null}
        </div>

        <div className="lk-texte">
          {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
          <h2 key={titre} data-texte="titre">{titre}</h2>
          <p className="lk-aide">{t.accueil.lookbookAide}</p>
          <ul className="lk-pieces" role="list" aria-label={t.accueil.lookbookPieces}>
            {pieces.map((p, i) => (
              <li key={`${p.slug}-${i}`} data-actif={ouvert === i ? "" : undefined}
                onMouseEnter={() => setVise(i)} onMouseLeave={() => setVise(null)}>
                <Link href={`/produit/${p.slug}`} onFocus={() => setVise(i)} onBlur={() => setVise(null)}>
                  <span className="lk-piece-photo">
                    {p.photo ? <Image src={p.photo.src} alt="" fill sizes="64px" /> : null}
                  </span>
                  <span className="lk-piece-texte">
                    <b>{p.nom}</b>
                    {p.prix ? <span>{p.prix}</span> : null}
                  </span>
                  <Fleche taille={16} className="rtl:-scale-x-100" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
