"use client";

import { useSyncExternalStore } from "react";

/* ============================================================================
   « VUS RÉCEMMENT » — les fiches consultées, dans CE navigateur seulement :
   une liste de slugs (12 au plus, la plus récente d'abord), propre à chaque
   boutique. Rien n'est envoyé ni gardé côté serveur ; le rail relit en base
   ce qu'il montre (prix, stock, photo), jamais une copie qui aurait vieilli.
   Un stockage refusé (navigation privée) : pas de rail, rien ne casse.
   ========================================================================== */

const MAX = 12;
const EVENEMENT = "skanecom:vus";
const VIDE: string[] = [];

const cle = () => `skanecom.vus.${document.documentElement.dataset.boutique ?? "boutique"}.v1`;

function lit(): string[] {
  try {
    const brut = JSON.parse(window.localStorage.getItem(cle()) ?? "[]");
    return Array.isArray(brut) ? brut.filter((s): s is string => typeof s === "string" && /^[a-z0-9-]{1,120}$/.test(s)).slice(0, MAX) : VIDE;
  } catch {
    return VIDE;
  }
}

/** La fiche d'un produit s'inscrit en tête de la liste. */
export function noteVu(slug: string): void {
  try {
    const liste = [slug, ...lit().filter((s) => s !== slug)].slice(0, MAX);
    window.localStorage.setItem(cle(), JSON.stringify(liste));
    window.dispatchEvent(new CustomEvent(EVENEMENT));
  } catch {
    /* stockage refusé : rien à retenir */
  }
}

/** Oublier la liste (le lien « Effacer » du rail). */
export function oublieVus(): void {
  try {
    window.localStorage.removeItem(cle());
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENEMENT));
}

let dernierBrut: string | null | undefined;
let dernier: string[] = VIDE;

function instantane(): string[] {
  let brut: string | null = null;
  try {
    brut = window.localStorage.getItem(cle());
  } catch {}
  if (brut !== dernierBrut) {
    dernierBrut = brut;
    dernier = lit();
  }
  return dernier;
}

function abonne(rappel: () => void) {
  window.addEventListener("storage", rappel);
  window.addEventListener(EVENEMENT, rappel);
  return () => {
    window.removeEventListener("storage", rappel);
    window.removeEventListener(EVENEMENT, rappel);
  };
}

/** Les slugs vus, du plus récent au plus ancien (vide côté serveur). */
export function useVus(): string[] {
  return useSyncExternalStore(abonne, instantane, () => VIDE);
}
