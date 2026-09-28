/* ============================================================================
   i18n — LA structure. Français seul ACTIF en v1, arabe PRÊT (PRD §3).

   Le jour de l'arabe est un BRANCHEMENT, pas un chantier :
   1. écrire `src/lib/i18n/ar.ts` sur le modèle de `fr.ts` ;
   2. l'ajouter à CATALOGUES ci-dessous ;
   3. faire venir LANGUE_ACTIVE du réglage `boutique.langue_defaut` (ou du
      segment d'URL) au lieu de la constante.
   Rien d'autre : `dir` bascule tout seul, tokens.css échange les deux polices
   sur `[dir="rtl"]`, et `champ()` lit déjà les colonnes `_ar` du schéma.

   RÈGLE TENUE PARTOUT : aucun libellé d'interface n'est écrit dans un
   composant. Tout passe par `t`.
   ========================================================================== */

import { fr } from "./fr";

export type Langue = "fr" | "ar";

/** Langues portées par le code. `boutique.langues_actives` en base dit
 *  lesquelles sont OUVERTES au public — le code, lui, doit savoir traduire. */
const CATALOGUES: Record<Langue, typeof fr> = {
  fr,
  ar: fr, // ← à remplacer par `ar` le jour de l'arabe (mêmes clés, exigé par le type)
};

const DIRECTIONS: Record<Langue, "ltr" | "rtl"> = { fr: "ltr", ar: "rtl" };

/** v1 : français seul (PRD §3). Une seule ligne à faire bouger. */
export const LANGUE_ACTIVE: Langue = "fr";

export const DIRECTION = DIRECTIONS[LANGUE_ACTIVE];

/** Les libellés d'interface de la langue active. */
export const t = CATALOGUES[LANGUE_ACTIVE];

/**
 * Lit le CONTENU traduit d'une ligne de base (colonnes `_fr` / `_ar`).
 * Repli sur le français : une fiche sans traduction arabe reste lisible
 * plutôt que vide — un trou serait pire qu'une phrase en français.
 */
export function champ<T extends Record<string, unknown>>(
  ligne: T | null | undefined,
  base: string,
): string {
  if (!ligne) return "";
  const traduit = ligne[`${base}_${LANGUE_ACTIVE}`];
  if (typeof traduit === "string" && traduit.length > 0) return traduit;
  const repli = ligne[`${base}_fr`];
  return typeof repli === "string" ? repli : "";
}

/* Tables par langue plutôt que des tests `=== "ar"` : TypeScript rétrécit une
   constante à son littéral, donc toute comparaison avec l'autre langue est
   refusée au build. Une table reste vraie quelle que soit la langue active. */
const LOCALES: Record<Langue, string> = { fr: "fr-TN", ar: "ar-TN" };
const LOCALES_OG: Record<Langue, string> = { fr: "fr_TN", ar: "ar_TN" };

/** Locale BCP-47 pour Intl (formats de nombres et de dates). */
export const LOCALE = LOCALES[LANGUE_ACTIVE];

/** Locale Open Graph (`fr_TN`), pour les métadonnées de partage. */
export const LOCALE_OG = LOCALES_OG[LANGUE_ACTIVE];
