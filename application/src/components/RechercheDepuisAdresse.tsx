"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loupe } from "./Icones";
import { t } from "@/lib/i18n";

/* La page introuvable d'une fiche (une pièce retirée depuis le partage du
   lien) : les mots de son adresse disent ce que l'on cherchait — « robe
   bretelles terracotta ». Un toucher, et les pièces proches. Rien n'est dit
   de la pièce elle-même (un brouillon peut être une collection à venir). */
export function RechercheDepuisAdresse() {
  const chemin = usePathname() ?? "";
  const m = /^\/(?:produit|categorie|rayon)\/([a-z0-9-]+)\/?$/.exec(chemin);
  const mots = m ? m[1].split("-").filter((x) => x.length > 1 && !/^\d+$/.test(x)).slice(0, 5).join(" ") : "";
  if (!mots) return null;
  return (
    <Link className="btn btn-second introuvable-mots" href={`/recherche?q=${encodeURIComponent(mots)}`}>
      <Loupe taille={18} />
      {t.introuvable.chercherMots(mots)}
    </Link>
  );
}
