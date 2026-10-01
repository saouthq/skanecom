"use client";

import { useEffect } from "react";
import { videPanier } from "@/lib/panier";
import { oublieCleDeCommande } from "@/lib/commande";
import { evenementPub, type LignePub } from "@/lib/pixels";

/** Posé sur la page de fin : si la commande vient d'être passée (moins d'une
 *  demi-heure), le panier est devenu une commande — il se vide, et sa clé
 *  d'idempotence n'a plus d'objet. Page rouverte plus tard : le panier du
 *  moment n'est pas touché. Un achat express (`videLePanier` faux) n'a pas
 *  pris le panier : seule sa clé s'oublie — le même article recommandé
 *  demain est une nouvelle commande. Les pixels publicitaires (s'ils sont
 *  chargés) comptent l'achat, une fois. */
export function FinDeCommande({ boutique, creeLe, videLePanier = true, achat }: {
  boutique: string;
  creeLe: string;
  videLePanier?: boolean;
  /** Pour les pixels publicitaires, s'ils sont chargés : la commande passée. */
  achat?: { numero: string; lignes: LignePub[] };
}) {
  useEffect(() => {
    if (Date.now() - new Date(creeLe).getTime() > 30 * 60 * 1000) return;
    if (videLePanier) videPanier();
    oublieCleDeCommande(boutique);
    // Une fois par commande, même page rechargée : le numéro sert aussi d'identifiant d'événement.
    if (achat && achat.lignes.length > 0) {
      const cle = `skanecom.achat-signale.${achat.numero}`;
      let deja = false;
      try {
        deja = sessionStorage.getItem(cle) === "1";
        sessionStorage.setItem(cle, "1");
      } catch {
        /* Stockage fermé : la plateforme dédoublonne par le numéro. */
      }
      if (!deja) evenementPub("Purchase", achat.lignes, { commande: achat.numero });
    }
  }, [boutique, creeLe, videLePanier, achat]);
  return null;
}
