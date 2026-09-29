"use client";

import { useEffect } from "react";
import { videPanier } from "@/lib/panier";
import { oublieCleDeCommande } from "@/lib/commande";

/** Posé sur la page de fin : si la commande vient d'être passée (moins d'une
 *  demi-heure), le panier est devenu une commande — il se vide, et sa clé
 *  d'idempotence n'a plus d'objet. Page rouverte plus tard : le panier du
 *  moment n'est pas touché. */
export function FinDeCommande({ boutique, creeLe }: { boutique: string; creeLe: string }) {
  useEffect(() => {
    if (Date.now() - new Date(creeLe).getTime() > 30 * 60 * 1000) return;
    videPanier();
    oublieCleDeCommande(boutique);
  }, [boutique, creeLe]);
  return null;
}
