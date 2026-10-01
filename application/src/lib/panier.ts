"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  clePanier,
  PANIER_AJOUT,
  PANIER_EVENEMENT,
  PANIER_LIGNE,
  PANIER_OUVRIR,
  PANIER_VIDE,
  ajouteLigne,
  changeQuantite,
  litPanier,
  nombreArticles,
  retireLigne,
  serialisePanier,
  type AjoutAnnonce,
  type LigneAjoutee,
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
  window.dispatchEvent(new CustomEvent<LigneAjoutee>(PANIER_LIGNE, {
    detail: { sku: ligne.sku, libelle: ligne.libelle, quantite: ligne.quantite, prixMillimes: ligne.prixMillimesAjout },
  }));
}

/** Ouvre le tiroir du panier (posé dans l'en-tête). */
export function ouvrePanier(): void {
  window.dispatchEvent(new CustomEvent(PANIER_OUVRIR));
}

/** Après un ajout : l'en-tête fait voler la photo jusqu'au panier et montre
 *  la confirmation (components/ConfirmationAjout.tsx). */
export function annonceAjout(ajout: AjoutAnnonce): void {
  window.dispatchEvent(new CustomEvent<AjoutAnnonce>(PANIER_AJOUT, { detail: ajout }));
}

export function retireDuPanier(varianteId: string): void {
  ecrit(retireLigne(lit(), varianteId));
}

/** Le lien d'une relance (/panier/<id>) : les pièces gardées par la boutique
 *  reviennent dans ce navigateur. Une pièce déjà au panier garde la plus
 *  grande des deux quantités : rien n'est doublé. */
export function reprendsPanier(lignes: { ligne: Omit<LignePanier, "ajouteLe">; stock: number }[]): void {
  let panier = lit();
  for (const { ligne, stock } of lignes) {
    const deja = panier.lignes.find((l) => l.varianteId === ligne.varianteId);
    panier = deja
      ? changeQuantite(panier, ligne.varianteId, Math.max(deja.quantite, ligne.quantite), stock)
      : ajouteLigne(panier, ligne, stock);
  }
  ecrit(panier);
}

/** Après une commande passée : le panier est devenu une commande. */
export function videPanier(): void {
  ecrit(PANIER_VIDE);
}

/** Ajuste une ligne au stock réel (le tunnel le propose quand il en reste
 *  moins que demandé). */
export function ramenePanier(varianteId: string, quantite: number): void {
  ecrit(changeQuantite(lit(), varianteId, quantite, quantite));
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

/* Le panier comme source externe (useSyncExternalStore) : lu pendant le
   rendu, sans effet, et `null` tant que la page n'est pas hydratée — le
   tunnel distingue ainsi « pas encore lu » de « vide ». L'instantané est
   gardé tant que le texte stocké ne change pas : même objet, pas de rendu. */
let dernierBrut: string | null | undefined;
let dernierPanier: Panier = PANIER_VIDE;

function instantane(): Panier {
  let brut: string | null = null;
  try {
    brut = window.localStorage.getItem(cle());
  } catch {}
  if (brut !== dernierBrut) {
    dernierBrut = brut;
    dernierPanier = litPanier(brut);
  }
  return dernierPanier;
}

function abonne(rappel: () => void): () => void {
  window.addEventListener("storage", rappel);
  window.addEventListener(PANIER_EVENEMENT, rappel);
  return () => {
    window.removeEventListener("storage", rappel);
    window.removeEventListener(PANIER_EVENEMENT, rappel);
  };
}

export function usePanierLu(): Panier | null {
  return useSyncExternalStore(abonne, instantane, () => null);
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
