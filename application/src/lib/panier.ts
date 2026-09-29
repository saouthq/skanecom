"use client";

import { useEffect, useState } from "react";
import {
  clePanier,
  PANIER_EVENEMENT,
  PANIER_OUVRIR,
  PANIER_VIDE,
  ajouteLigne,
  changeQuantite,
  litPanier,
  nombreArticles,
  retireLigne,
  serialisePanier,
  type LignePanier,
  type Panier,
} from "./panier-contrat";

/* ============================================================================
   PANIER LOCAL — l'implémentation navigateur du contrat.
   La FORME vit dans `panier-contrat.ts` (validé par Luna, à confirmer par Max) ;
   ici il n'y a que le stockage et la propagation. Le tunnel de Max remplacera
   ce fichier sans toucher au contrat.
   ========================================================================== */

/** La boutique de la page, posée par le layout sur <html data-boutique>. */
function cle(): string {
  return clePanier(document.documentElement.dataset.boutique ?? "boutique");
}

function lit(): Panier {
  if (typeof window === "undefined") return PANIER_VIDE;
  try {
    return litPanier(window.localStorage.getItem(cle()));
  } catch {
    return PANIER_VIDE; // navigation privée : le stockage peut lever
  }
}

function ecrit(panier: Panier): void {
  try {
    window.localStorage.setItem(cle(), serialisePanier(panier));
  } catch {
    /* stockage refusé : le panier ne survivra pas au rechargement, la page
       continue de fonctionner. Mieux qu'une boutique qui plante. */
  }
  window.dispatchEvent(new CustomEvent(PANIER_EVENEMENT));
}

export function ajouteAuPanier(ligne: Omit<LignePanier, "ajouteLe">, stockMax: number): void {
  ecrit(ajouteLigne(lit(), ligne, stockMax));
}

/** Ouvre le tiroir du panier (posé dans l'en-tête), après un ajout. */
export function ouvrePanier(): void {
  window.dispatchEvent(new CustomEvent(PANIER_OUVRIR));
}

export function retireDuPanier(varianteId: string): void {
  ecrit(retireLigne(lit(), varianteId));
}

export function changeQuantitePanier(varianteId: string, quantite: number): void {
  // Le plafond de stock est reposé à l'ajout ; ici on borne à ce qui est déjà
  // dans la ligne, la vérification réelle appartient au tunnel (contrat).
  ecrit(changeQuantite(lit(), varianteId, quantite, Number.MAX_SAFE_INTEGER));
}

/** Le panier complet, réactif. Même mécanique que le compteur : lu au montage
 *  seulement — le serveur ne peut pas connaître le stockage du navigateur. */
export function usePanier(): Panier {
  const [panier, setPanier] = useState<Panier>(PANIER_VIDE);

  useEffect(() => {
    const relit = () => setPanier(lit());
    relit();
    window.addEventListener("storage", relit);
    window.addEventListener(PANIER_EVENEMENT, relit);
    return () => {
      window.removeEventListener("storage", relit);
      window.removeEventListener(PANIER_EVENEMENT, relit);
    };
  }, []);

  return panier;
}

/**
 * Le compteur d'en-tête. Rendu à 0 côté serveur puis corrigé au montage :
 * le panier vit dans le navigateur, l'HTML servi ne peut pas le connaître, et
 * un rendu serveur qui devinerait produirait une erreur d'hydratation.
 */
export function useNombreArticles(): number {
  const [n, setN] = useState(0);

  useEffect(() => {
    const relit = () => setN(nombreArticles(lit()));
    relit();
    // `storage` : les autres onglets. L'événement maison : l'onglet courant.
    window.addEventListener("storage", relit);
    window.addEventListener(PANIER_EVENEMENT, relit);
    return () => {
      window.removeEventListener("storage", relit);
      window.removeEventListener(PANIER_EVENEMENT, relit);
    };
  }, []);

  return n;
}
