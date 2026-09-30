"use client";

import { useSyncExternalStore } from "react";

/* ============================================================================
   LES FAVORIS — les pièces marquées d'un cœur (réglage catalogue.favoris) :
   une liste de slugs, la plus récente d'abord, 100 au plus, propre à chaque
   boutique. Elle vit dans ce navigateur ; pour un client connecté, le
   compte la garde aussi (public.garder_favoris, par /favoris/garder), si
   bien qu'elle le suit d'un appareil à l'autre. Ce que la page « Mes
   favoris » montre est relu en base (prix, stock, photo), jamais une copie
   qui aurait vieilli. Un stockage refusé (navigation privée) : le cœur
   marche le temps de la page, rien ne casse.
   ========================================================================== */

const MAX = 100;
const EVENEMENT = "skanecom:favoris";
const VIDE: string[] = [];
const SLUG = /^[a-z0-9-]{1,120}$/;

const cle = () => `skanecom.favoris.${document.documentElement.dataset.boutique ?? "boutique"}.v1`;

function lit(): string[] {
  try {
    const brut = JSON.parse(window.localStorage.getItem(cle()) ?? "[]");
    return Array.isArray(brut) ? brut.filter((s): s is string => typeof s === "string" && SLUG.test(s)).slice(0, MAX) : VIDE;
  } catch {
    return VIDE;
  }
}

function ecrit(liste: string[]): void {
  try {
    window.localStorage.setItem(cle(), JSON.stringify(liste.slice(0, MAX)));
  } catch {
    /* stockage refusé */
  }
  window.dispatchEvent(new CustomEvent(EVENEMENT));
}

/** Le compte, si la cliente est connectée : la base garde le geste. Sans
 *  session, la route ne fait rien (204). Un échec ne défait pas le cœur. */
function garde(ajouts: string[], retraits: string[]): Promise<string[] | null> {
  return fetch("/favoris/garder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ajouts, retraits }),
  })
    .then((r) => (r.status === 200 ? (r.json() as Promise<{ favoris: string[] }>) : null))
    .then((rep) => rep?.favoris ?? null)
    .catch(() => null);
}

export function estFavori(liste: string[], slug: string): boolean {
  return liste.includes(slug);
}

/** Le cœur touché : ajoute en tête, ou retire. */
export function basculeFavori(slug: string): boolean {
  const liste = lit();
  const aime = !liste.includes(slug);
  ecrit(aime ? [slug, ...liste.filter((s) => s !== slug)] : liste.filter((s) => s !== slug));
  void garde(aime ? [slug] : [], aime ? [] : [slug]);
  return aime;
}

/** À la connexion (ou au premier passage connecté) : la liste du navigateur
 *  rejoint celle du compte, et le navigateur reprend la liste fusionnée. */
export async function fusionneFavoris(): Promise<void> {
  const fusion = await garde(lit(), []);
  if (fusion) ecrit(fusion);
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

function abonne(rappel: () => void): () => void {
  window.addEventListener("storage", rappel);
  window.addEventListener(EVENEMENT, rappel);
  return () => {
    window.removeEventListener("storage", rappel);
    window.removeEventListener(EVENEMENT, rappel);
  };
}

/** La liste, réactive ; vide tant que la page n'est pas hydratée. */
export function useFavoris(): string[] {
  return useSyncExternalStore(abonne, instantane, () => VIDE);
}
