/* ============================================================================
   PRIX — millimes (base) → dinar tunisien (écran)

   LE FORMAT RETENU : `189,000 TND` · `1 249,000 TND`

   Pourquoi celui-là, et pas un autre :
   - Le dinar tunisien a TROIS décimales (1 TND = 1000 millimes) et l'usage
     local les écrit TOUJOURS, même à zéro : « 189,000 » et jamais « 189 ».
     Les tronquer ferait lire 189 millimes à un Tunisien.
   - Séparateur décimal : la VIRGULE (usage francophone et tunisien).
   - Séparateur de milliers : U+202F, espace fine insécable — un prix ne se
     coupe jamais en fin de ligne. ⚠️ C'est un caractère invisible : pour
     retrouver un prix par grep, chercher les chiffres (`189,000`), pas la
     forme groupée.
   - Devise écrite « TND » et non « DT » : c'est le code ISO, il reste juste
     le jour où la page s'affiche en arabe.
   - Rien n'est calculé en flottant : les millimes sont des entiers, la
     division se fait par quotient et reste. Un arrondi de centime sur un
     panier est une erreur qu'on ne rattrape jamais.

   Le montant se pose TOUJOURS dans un <bdi> (composant `Prix`) : en RTL,
   l'algorithme bidi déplace « TND » d'un côté à l'autre selon le contexte —
   ça se décide, ça ne se subit pas (charte §8).
   ========================================================================== */

const ESPACE_FINE_INSECABLE = " ";
const MILLIMES_PAR_DINAR = 1000;

export const DEVISE = "TND";

/** Groupe les milliers : 1249 → « 1 249 » (espace fine insécable). */
function groupe(entier: string): string {
  return entier.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE_INSECABLE);
}

/**
 * Montant SANS devise : 189000 → « 189,000 » · 1249000 → « 1 249,000 ».
 * Le composant `Prix` ajoute la devise dans son propre <span>, ce qui permet
 * de la composer en plus petit sans toucher au nombre.
 */
export function formateMontant(millimes: number): string {
  const negatif = millimes < 0;
  const absolu = Math.abs(Math.round(millimes));
  const dinars = Math.floor(absolu / MILLIMES_PAR_DINAR);
  const reste = absolu % MILLIMES_PAR_DINAR;
  return `${negatif ? "−" : ""}${groupe(String(dinars))},${String(reste).padStart(3, "0")}`;
}

/** Prix complet en texte brut : « 189,000 TND ». Pour les métadonnées, les
 *  attributs `alt`, les données structurées et tout ce qui n'est pas du JSX. */
export function formatePrix(millimes: number): string {
  return `${formateMontant(millimes)} ${DEVISE}`;
}

/** Valeur décimale pour le SEO (schema.org attend un point, pas une virgule). */
export function prixDecimal(millimes: number): string {
  return (millimes / MILLIMES_PAR_DINAR).toFixed(3);
}

/** Dinars entiers saisis dans un filtre → millimes. */
export function dinarsVersMillimes(dinars: number): number {
  return Math.round(dinars * MILLIMES_PAR_DINAR);
}

/** Millimes → dinars entiers, pour pré-remplir les bornes d'un filtre. */
export function millimesVersDinars(millimes: number): number {
  return Math.round(millimes / MILLIMES_PAR_DINAR);
}
