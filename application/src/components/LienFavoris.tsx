"use client";

import Link from "next/link";
import { Coeur } from "./Icones";
import { useFavoris } from "@/lib/favoris";
import { t } from "@/lib/i18n";

/* L'entrée « Mes favoris » de l'en-tête : le cœur, et combien de pièces y
   attendent. L'adresse porte la liste (la page se rend d'emblée, sans
   détour) ; rendue sans elle au serveur, elle se complète à l'hydratation. */
export function LienFavoris({ className, avecLibelle = false }: { className: string; avecLibelle?: boolean }) {
  const liste = useFavoris();
  const n = liste.length;
  const href = n ? `/favoris?s=${liste.slice(0, 60).join(",")}` : "/favoris";
  return (
    <Link className={className} href={href} aria-label={avecLibelle ? undefined : t.favoris.lienAria(n)}>
      <Coeur plein={n > 0} />
      {avecLibelle ? <span>{t.favoris.lien}</span> : null}
      {n > 0 ? <span className="favoris-compte" aria-hidden={avecLibelle ? undefined : "true"}>{n}</span> : null}
    </Link>
  );
}
