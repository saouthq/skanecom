"use client";

import { Icone } from "./Icone";

/** Ouvre la boîte d'impression du navigateur (on y choisit aussi « PDF »). */
export function BoutonImprimer({ libelle = "Imprimer", classe = "btn btn-primaire" }: { libelle?: string; classe?: string }) {
  return (
    <button type="button" className={classe} onClick={() => window.print()}>
      <Icone nom="fichier" /> {libelle}
    </button>
  );
}
