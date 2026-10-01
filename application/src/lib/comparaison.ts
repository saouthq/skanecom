"use client";

import { useSyncExternalStore } from "react";
import { MAX_COMPARAISON, type PieceComparee } from "./comparaison-contrat";

export { MAX_COMPARAISON, type PieceComparee };

/* ============================================================================
   LA COMPARAISON — les pièces cochées « Comparer » (structure Commerce) :
   quatre au plus, dans l'ordre où on les a cochées, propres à chaque
   boutique. Elles vivent dans ce navigateur seulement (rien n'est envoyé :
   la page /comparer relit les fiches publiques en base). Une cinquième
   remplace la plus ancienne. Un stockage refusé (navigation privée) : la
   coche marche le temps de la page, rien ne casse.

   Chaque pièce garde de quoi se montrer dans la barre du bas sans requête :
   son slug, son nom, sa photo.
   ========================================================================== */

const EVENEMENT = "skanecom:comparaison";
const SLUG = /^[a-z0-9-]{1,120}$/;

const VIDE: PieceComparee[] = [];

const cle = () => `skanecom.comparaison.${document.documentElement.dataset.boutique ?? "boutique"}.v1`;

function lit(): PieceComparee[] {
  try {
    const brut = JSON.parse(window.localStorage.getItem(cle()) ?? "[]");
    if (!Array.isArray(brut)) return VIDE;
    return brut
      .filter((p): p is PieceComparee => !!p && typeof p.slug === "string" && SLUG.test(p.slug) && typeof p.nom === "string")
      .map((p) => ({ slug: p.slug, nom: p.nom.slice(0, 200), photo: typeof p.photo === "string" && /^[\w./-]{1,300}$/.test(p.photo) ? p.photo : null }))
      .slice(0, MAX_COMPARAISON);
  } catch {
    return VIDE;
  }
}

let memoire: PieceComparee[] | null = null;

function ecrit(liste: PieceComparee[]): void {
  memoire = liste.slice(0, MAX_COMPARAISON);
  try {
    window.localStorage.setItem(cle(), JSON.stringify(memoire));
  } catch {
    /* stockage refusé : la mémoire de la page suffit */
  }
  window.dispatchEvent(new CustomEvent(EVENEMENT));
}

/** Coche ou décoche une pièce ; rend vrai si elle est désormais comparée. */
export function basculeComparaison(piece: PieceComparee): boolean {
  const liste = instantane();
  if (liste.some((p) => p.slug === piece.slug)) {
    ecrit(liste.filter((p) => p.slug !== piece.slug));
    return false;
  }
  // Pleine : la plus ancienne laisse sa place.
  ecrit([...liste, piece].slice(-MAX_COMPARAISON));
  return true;
}

export function retireComparaison(slug: string): void {
  ecrit(instantane().filter((p) => p.slug !== slug));
}

export function videComparaison(): void {
  ecrit([]);
}

/** La page /comparer a relu ces pièces en base : la liste du navigateur la suit. */
export function remplaceComparaison(liste: PieceComparee[]): void {
  const avant = instantane();
  if (avant.length === liste.length && avant.every((p, i) => p.slug === liste[i].slug && p.nom === liste[i].nom)) return;
  ecrit(liste);
}

/** La liste du navigateur, lue une fois (hors rendu). */
export function lisComparaison(): PieceComparee[] {
  return instantane();
}

let dernierBrut: string | null | undefined;
let dernier: PieceComparee[] = VIDE;

function instantane(): PieceComparee[] {
  let brut: string | null = null;
  try {
    brut = window.localStorage.getItem(cle());
  } catch {
    return memoire ?? VIDE;
  }
  if (brut === null && memoire) return memoire;
  if (brut !== dernierBrut) {
    dernierBrut = brut;
    dernier = lit();
  }
  return dernier;
}

function abonne(rappel: () => void): () => void {
  window.addEventListener("storage", rappel);
  window.addEventListener(EVENEMENT, rappel);
  return () => {
    window.removeEventListener("storage", rappel);
    window.removeEventListener(EVENEMENT, rappel);
  };
}

/** Les pièces comparées, réactives ; vide tant que la page n'est pas hydratée. */
export function useComparaison(): PieceComparee[] {
  return useSyncExternalStore(abonne, instantane, () => VIDE);
}

/** La même, mais `null` tant que la page n'est pas hydratée (le premier
 *  chiffre lu ne s'annonce pas). */
export function useComparaisonLue(): PieceComparee[] | null {
  return useSyncExternalStore<PieceComparee[] | null>(abonne, instantane, () => null);
}

/** L'adresse de la page de comparaison pour ces pièces. */
export function lienComparaison(liste: PieceComparee[]): string {
  return `/comparer?p=${liste.map((p) => p.slug).join(",")}`;
}
