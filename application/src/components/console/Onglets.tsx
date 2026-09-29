"use client";

import Link from "next/link";
import { Icone, type NomIcone } from "./Icone";
import { useChemin } from "./LienNav";

export type Onglet = { href: string; libelle: string; icone?: NomIcone; exact?: boolean; compte?: number };

/** Les onglets d'une page (une boutique : vue d'ensemble, équipe, marque…). */
export function Onglets({ onglets, libelle }: { onglets: Onglet[]; libelle: string }) {
  const chemin = useChemin();
  return (
    <nav className="onglets" aria-label={libelle}>
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
