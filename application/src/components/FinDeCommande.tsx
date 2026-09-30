"use client";

import { useEffect } from "react";
import { videPanier } from "@/lib/panier";
import { oublieCleDeCommande } from "@/lib/commande";

/** Posé sur la page de fin : si la commande vient d'être passée (moins d'une
 *  demi-heure), le panier est devenu une commande — il se vide, et sa clé
 *  d'idempotence n'a plus d'objet. Page rouverte plus tard : le panier du
 *  moment n'est pas touché. Un achat express (`videLePanier` faux) n'a pas
 *  pris le panier : seule sa clé s'oublie — le même article recommandé
 *  demain est une nouvelle commande. */
export function FinDeCommande({ boutique, creeLe, videLePanier = true }: { boutique: string; creeLe: string; videLePanier?: boolean }) {
  useEffect(() => {
    if (Date.now() - new Date(creeLe).getTime() > 30 * 60 * 1000) return;
    if (videLePanier) videPanier();
    oublieCleDeCommande(boutique);
  }, [boutique, creeLe, videLePanier]);
  return null;
}
