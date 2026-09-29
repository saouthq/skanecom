"use client";

import { useEffect, useRef, useState } from "react";
import { Filtre } from "./Icones";
import { Tiroir } from "./Tiroir";
import { FERMER_FEUILLE } from "./Filtres";
import { feuilleARouvrir } from "@/lib/reprise";
import { t } from "@/lib/i18n";

/* ============================================================================
   LA FEUILLE DE FILTRES — le bouton « Filtrer » et son tiroir.

   Gabarit éditorial : partout (la grille garde toute la largeur). Gabarit
   technique : sur téléphone seulement (sur grand écran, la colonne de
   filtres est toujours là).

   Cocher une case change d'adresse, donc de page : la feuille se rouvre
   d'elle-même sur la nouvelle liste, sans animation, le focus sur la case
   (lib/reprise.ts). « Voir les résultats » la referme.
   ========================================================================== */

const NOM = "filtres";

export function FeuilleFiltres({ actifs, className = "", children }: { actifs: number; className?: string; children: React.ReactNode }) {
  const [instantane, setInstantane] = useState(() => feuilleARouvrir(NOM));
  const [ouvert, setOuvert] = useState(instantane);
  const bouton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const ferme = () => setOuvert(false);
    window.addEventListener(FERMER_FEUILLE, ferme);
    return () => window.removeEventListener(FERMER_FEUILLE, ferme);
  }, []);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={`btn-filtrer ${className}`}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => setOuvert(true)}
      >
        <Filtre />
        {t.catalogue.filtrer}
        {actifs > 0 ? <span className="btn-filtrer-n">{actifs}</span> : null}
      </button>
      <Tiroir
        ouvert={ouvert}
        onFermer={() => {
          setOuvert(false);
          setInstantane(false);
        }}
        titre={t.catalogue.filtres}
        etiquetteFermer={t.catalogue.fermer}
        retour={bouton}
        instantane={instantane}
        feuille={NOM}
        className="tiroir-filtres"
      >
        {children}
      </Tiroir>
    </>
  );
}
