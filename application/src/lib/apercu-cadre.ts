/* ============================================================================
   L'APERÇU DE L'ÉDITEUR, RENDU DE NOUVEAU SUR PLACE — quand l'accueil du
   brouillon change, la page du cadre se rend de nouveau (le segment interne
   prend la nouvelle version : src/proxy.ts) et React la recrée, attributs de
   <html> compris. L'instant du rafraîchissement est gardé ici, dans le
   module, qui lui survit : la nouvelle page s'affiche alors d'un coup, sans
   le fondu des photos ni la montée des sections (components/Apparitions.tsx,
   app/vitrine-mouvement.css).
   ========================================================================== */

let instant = -Infinity;

/** Le cadre va se rendre de nouveau. */
export function rafraichissementAnnonce(): void {
  instant = performance.now();
}

/** La page vient-elle d'être rendue de nouveau (dans les quatre secondes) ? */
export function rafraichiALInstant(): boolean {
  return typeof performance !== "undefined" && performance.now() - instant < 4000;
}
