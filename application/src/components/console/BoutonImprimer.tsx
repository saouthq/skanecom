"use client";

import { Icone } from "./Icone";

/** Ouvre la boîte d'impression du navigateur (on y choisit aussi « PDF »). */
export function BoutonImprimer({ libelle = "Imprimer" }: { libelle?: string }) {
  return (
    <button type="button" className="btn btn-primaire" onClick={() => window.print()}>
      <Icone nom="fichier" /> {libelle}
    </button>
  );
}
