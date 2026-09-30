"use client";

import { createContext, useContext } from "react";

/* Le réglage catalogue.favoris de la boutique, pour tous les cœurs de la
   page : posé une fois par le layout, lu par chaque BoutonFavori — au rendu
   du serveur comme dans le navigateur, si bien que le cœur est là dès la
   première image, sans apparaître après coup. */

const Actifs = createContext(false);

export function FavorisActifs({ actif, children }: { actif: boolean; children: React.ReactNode }) {
  return <Actifs.Provider value={actif}>{children}</Actifs.Provider>;
}

export function useFavorisActifs(): boolean {
  return useContext(Actifs);
}
