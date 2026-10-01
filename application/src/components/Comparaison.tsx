"use client";

import { createContext, useContext, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fleche } from "./Icones";
import { basculeComparaison, lienComparaison, MAX_COMPARAISON, retireComparaison, useComparaison, useComparaisonLue, videComparaison } from "@/lib/comparaison";
import { urlFichier } from "@/lib/photos";
import { t } from "@/lib/i18n";

/* ============================================================================
   COMPARER (structure Commerce) — sur chaque carte, une case « Comparer » ;
   en bas de l'écran, la barre des pièces cochées (leur vignette, la croix
   pour en retirer une, « Comparer (3) ») ; la page /comparer les met côte
   à côte. La structure pose le fournisseur : ailleurs, ni case ni barre.

   La case est un vrai bouton (aria-pressed), hors du lien de la carte. La
   barre ne vole jamais le focus ; elle annonce ce qui change (aria-live) et
   se range au-dessus de la barre d'onglets du téléphone.
   ========================================================================== */

const Active = createContext(false);

export function ComparaisonActive({ actif, children }: { actif: boolean; children: React.ReactNode }) {
  return <Active.Provider value={actif}>{children}</Active.Provider>;
}

export function useComparaisonActive(): boolean {
  return useContext(Active);
}

export function BoutonComparer({ slug, nom, photo, className = "" }: { slug: string; nom: string; photo: string | null; className?: string }) {
  const actif = useComparaisonActive();
  const coche = useComparaison().some((p) => p.slug === slug);
  if (!actif) return null;
  return (
    <button type="button" className={`comparer ${className}`} aria-pressed={coche} data-coche={coche ? "" : undefined}
      aria-label={coche ? t.comparaison.retirer(nom) : t.comparaison.ajouter(nom)}
      onClick={() => basculeComparaison({ slug, nom, photo })}>
      <span className="comparer-case" aria-hidden="true" />
      <span>{t.comparaison.case}</span>
    </button>
  );
}

export function BarreComparaison() {
  const actif = useComparaisonActive();
  const lue = useComparaisonLue();
  const liste = lue ?? [];
  const chemin = (usePathname() ?? "/").replace(/^\/_b\/[^/]+/, "") || "/";
  // Ce qui change s'annonce (le premier chiffre lu, non) : pendant le rendu.
  const [annonce, setAnnonce] = useState("");
  const [vu, setVu] = useState<number | null>(null);
  if (lue && lue.length !== vu) {
    if (vu !== null) setAnnonce(lue.length > vu ? t.comparaison.ajoutee(lue.length, MAX_COMPARAISON) : t.comparaison.retiree(lue.length));
    setVu(lue.length);
  }

  // Ni sur la page de comparaison elle-même, ni dans le tunnel de commande.
  const masquee = !actif || liste.length === 0 || chemin.startsWith("/comparer") || chemin.startsWith("/commande");
  return (
    <>
      <p className="sr-only" aria-live="polite">{actif ? annonce : ""}</p>
      {masquee ? null : (
        <aside className="barre-comparaison" aria-label={t.comparaison.barre}>
          <ul className="bc-pieces" role="list">
            {liste.map((p) => (
              <li key={p.slug}>
                <span className="bc-vignette">
                  {p.photo ? <Image src={urlFichier(p.photo)} alt="" fill sizes="48px" /> : null}
                </span>
                <span className="bc-nom">{p.nom}</span>
                <button type="button" className="bc-retirer" aria-label={t.comparaison.retirer(p.nom)} onClick={() => retireComparaison(p.slug)}>×</button>
              </li>
            ))}
            {Array.from({ length: MAX_COMPARAISON - liste.length }, (_, i) => <li key={`vide-${i}`} className="bc-vide" aria-hidden="true" />)}
          </ul>
          <div className="bc-actions">
            <button type="button" className="lien-souligne bc-effacer" onClick={videComparaison}>{t.comparaison.effacer}</button>
            {liste.length > 1 ? (
              <Link className="btn btn-primaire" href={lienComparaison(liste)}>
                {t.comparaison.comparer(liste.length)} <Fleche taille={16} className="rtl:-scale-x-100" />
              </Link>
            ) : (
              <span className="bc-aide">{t.comparaison.encoreUne}</span>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
