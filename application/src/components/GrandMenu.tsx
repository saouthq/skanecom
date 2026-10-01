"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Chevron, Fleche, Menu } from "./Icones";
import { urlFichier } from "@/lib/photos";
import { t } from "@/lib/i18n";

/* ============================================================================
   LE GRAND MENU DES RAYONS (structure Commerce) — « Tous les rayons » ouvre,
   sous l'en-tête, tous les rayons de la boutique : à gauche la liste, à
   droite les sous-rayons de celui qu'on survole (ou qu'on atteint au
   clavier), leurs comptes, la photo du rayon et « Tout le rayon ».

   Un menu de navigation ordinaire (motif « disclosure » de l'ARIA) : des
   liens, dans l'ordre où on les lit — le rayon, puis ses sous-rayons s'il
   est désigné —, si bien que Tab parcourt tout sans piège. ↓ et ↑ passent
   d'un rayon à l'autre ; Échap referme et rend le focus au bouton. Un clic
   ailleurs, un lien suivi, une autre page : il se referme. Seuls les rayons
   qui ont des pièces y figurent.
   ========================================================================== */

export type RayonMenu = {
  cle: string;
  href: string;
  nom: string;
  compte: number;
  image: string | null;
  enfants: { cle: string; href: string; nom: string; compte: number }[];
};

export function GrandMenu({ rayons }: { rayons: RayonMenu[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const bouton = useRef<HTMLButtonElement>(null);
  const boite = useRef<HTMLDivElement>(null);
  const id = useId();
  const chemin = usePathname();

  // Une autre page : le menu se referme (pendant le rendu, pas dans un effet).
  const [cheminVu, setCheminVu] = useState(chemin);
  if (chemin !== cheminVu) {
    setCheminVu(chemin);
    setOuvert(false);
  }

  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOuvert(false);
      if (boite.current?.contains(document.activeElement)) bouton.current?.focus();
    };
    const ailleurs = (e: PointerEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("keydown", echap);
    document.addEventListener("pointerdown", ailleurs);
    return () => { document.removeEventListener("keydown", echap); document.removeEventListener("pointerdown", ailleurs); };
  }, [ouvert]);

  if (rayons.length === 0) return null;
  const courant = rayons[Math.min(actif, rayons.length - 1)];

  // ↓ ↑ entre les rayons (le focus suit, le rayon devient celui qu'on lit).
  const fleches = (e: React.KeyboardEvent, i: number) => {
    const pas = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!pas) return;
    e.preventDefault();
    const j = (i + pas + rayons.length) % rayons.length;
    setActif(j);
    boite.current?.querySelector<HTMLElement>(`[data-rayon-menu="${j}"]`)?.focus();
  };

  return (
    <div ref={boite} className="gm">
      <button ref={bouton} type="button" className="gm-bouton" aria-expanded={ouvert} aria-controls={id}
        onClick={() => setOuvert(!ouvert)}>
        <Menu taille={20} />
        <span>{t.commerce.tousLesRayons}</span>
        <Chevron taille={14} className="gm-chevron" />
      </button>
      <div id={id} className="gm-panneau" hidden={!ouvert}>
        <nav className="enveloppe gm-grille" aria-label={t.commerce.grandMenu}>
          <ul className="gm-rayons" role="list">
            {rayons.map((r, i) => (
              <li key={r.cle} className="gm-rayon" data-actif={i === actif ? "" : undefined}>
                <Link href={r.href} data-rayon-menu={i} onMouseEnter={() => setActif(i)} onFocus={() => setActif(i)}
                  onKeyDown={(e) => fleches(e, i)} onClick={() => setOuvert(false)}>
                  <span>{r.nom}</span>
                  <span className="gm-compte">{r.compte}</span>
                  <Fleche taille={14} className="gm-fleche rtl:-scale-x-100" />
                </Link>
                {i === actif ? (
                  <div className="gm-detail">
                    <div className="gm-detail-texte">
                      <p className="gm-detail-titre">{r.nom}</p>
                      {r.enfants.length ? (
                        <ul className="gm-enfants" role="list">
                          {r.enfants.map((e) => (
                            <li key={e.cle}>
                              <Link href={e.href} onClick={() => setOuvert(false)}>
                                {e.nom} <span className="gm-compte">{e.compte}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <Link className="lien-souligne gm-tout" href={r.href} onClick={() => setOuvert(false)}>
                        {t.commerce.toutLeRayon(r.nom)} <Fleche taille={14} className="rtl:-scale-x-100" />
                      </Link>
                    </div>
                    {courant.image ? (
                      <span className="gm-photo">
                        <Image src={urlFichier(courant.image)} alt="" fill sizes="22rem" />
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
