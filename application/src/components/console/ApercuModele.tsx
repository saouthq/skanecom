"use client";

import { useEffect, useRef, useState } from "react";
import { Icone } from "./Icone";

/* ============================================================================
   L'APERÇU D'UN MODÈLE (galerie des modèles de la console) — la vraie
   vitrine de démonstration, en réduction : au format d'un ordinateur
   (1 280 × 800) ou d'un téléphone (390 × 844), ramenée à la largeur de la
   carte. La vignette ne se manipule pas : un geste dessus ouvre la vitrine
   dans un onglet. Dans ce cadre, la vitrine ne compte pas la visite et ne
   demande pas l'accord pour les pixels (MesureAudience, PixelsPub).
   ========================================================================== */

const APPAREILS = {
  ordinateur: { l: 1280, h: 800, libelle: "Ordinateur", icone: "ecran" },
  telephone: { l: 390, h: 844, libelle: "Téléphone", icone: "mobile" },
} as const;
type Appareil = keyof typeof APPAREILS;

export function ApercuModele({ url, nom, structure }: { url: string; nom: string; structure: string }) {
  const [appareil, setAppareil] = useState<Appareil>("ordinateur");
  const [echelle, setEchelle] = useState(0);
  const boite = useRef<HTMLDivElement>(null);
  const d = APPAREILS[appareil];

  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    const mesure = () => {
      const r = el.getBoundingClientRect();
      // Au téléphone, la place de son contour (6 px en haut et en bas).
      const marge = appareil === "telephone" ? 14 : 0;
      setEchelle(Math.min(r.width / d.l, (r.height - marge) / d.h));
    };
    mesure();
    const ro = new ResizeObserver(mesure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [d.l, d.h, appareil]);

  return (
    <div className="mo-apercu">
      <div ref={boite} className="mo-cadre" data-appareil={appareil}>
        <iframe
          src={url}
          title={`La vitrine ${nom}, structure ${structure}, au format ${d.libelle.toLowerCase()}`}
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          style={{ inlineSize: d.l, blockSize: d.h, transform: `scale(${echelle}) translateX(-50%)`, opacity: echelle ? 1 : 0 }}
        />
        <a className="mo-ouvrir" href={url} target="_blank" rel="noopener" aria-label={`Ouvrir la vitrine ${nom} dans un nouvel onglet`}>
          <span><Icone nom="externe" taille={14} /> Ouvrir la vitrine</span>
        </a>
      </div>
      <div className="segments mo-appareils" role="group" aria-label={`Aperçu de ${nom}`}>
        {(Object.keys(APPAREILS) as Appareil[]).map((a) => (
          <button key={a} type="button" aria-pressed={appareil === a} onClick={() => setAppareil(a)}>
            <Icone nom={APPAREILS[a].icone} taille={14} /> {APPAREILS[a].libelle}
          </button>
        ))}
      </div>
    </div>
  );
}
