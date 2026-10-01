"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Icone, type NomIcone } from "./Icone";
import { useChemin } from "./LienNav";

export type Onglet = { href: string; libelle: string; icone?: NomIcone; exact?: boolean; compte?: number };

/** Les onglets d'une page (une boutique : vue d'ensemble, équipe, marque…).
 *  Au téléphone, la rangée défile : l'onglet de la page est ramené en vue. */
export function Onglets({ onglets, libelle }: { onglets: Onglet[]; libelle: string }) {
  const chemin = useChemin();
  const rangee = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = rangee.current;
    const actif = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !actif || nav.scrollWidth <= nav.clientWidth) return;
    const debut = actif.offsetLeft - nav.offsetLeft;
    const fin = debut + actif.offsetWidth;
    if (debut < nav.scrollLeft || fin > nav.scrollLeft + nav.clientWidth) {
      nav.scrollLeft = Math.max(0, debut - (nav.clientWidth - actif.offsetWidth) / 2);
    }
  }, [chemin]);
  return (
    <nav ref={rangee} className="onglets" aria-label={libelle}>
      {onglets.map((o) => {
        const actif = o.exact ? chemin === o.href : chemin === o.href || chemin.startsWith(`${o.href}/`);
        return (
          <Link key={o.href} href={o.href} aria-current={actif ? "page" : undefined}>
            {o.icone ? <Icone nom={o.icone} taille={16} /> : null}
            {o.libelle}
            {o.compte !== undefined ? <span className="compte-onglet">{o.compte}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
