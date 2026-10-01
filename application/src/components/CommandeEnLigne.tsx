"use client";

import { createContext, useContext } from "react";

/* ============================================================================
   LA COMMANDE EN LIGNE — ouverte (une boutique), ou fermée (réglage
   vitrine.site_vitrine : un site vitrine, migration 73). Posée par le layout
   de la vitrine ; ce qui met au panier depuis une carte (AjoutRapide) s'en
   retire. La fiche, l'en-tête et la commande le lisent dans le cadre.
   ========================================================================== */

const Contexte = createContext(true);

export function FournisseurCommande({ ouverte, children }: { ouverte: boolean; children: React.ReactNode }) {
  return <Contexte.Provider value={ouverte}>{children}</Contexte.Provider>;
}

export function useCommandeEnLigne(): boolean {
  return useContext(Contexte);
}
