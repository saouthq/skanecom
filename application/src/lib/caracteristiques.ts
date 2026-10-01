/* ============================================================================
   LES CARACTÉRISTIQUES (B9) — une valeur telle qu'on la lit. La base garde
   les nombres avec un point et sans unité (« 1400 », « 14.4 ») ; la vitrine
   écrit « 1 400 W », « 14,4 V ». Pur : sert au serveur comme au navigateur.
   ========================================================================== */

const NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });

/** Un poids tel qu'on le lit : 800 → « 800 g », 9000 → « 9 kg », 2500 → « 2,5 kg ». */
export function poidsLisible(grammes: number): string {
  return grammes < 1000 ? `${grammes} g` : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(grammes / 1000)} kg`;
}

/** La valeur d'une caractéristique, à la française, avec son unité. */
export function valeurAvecUnite(valeur: string, a: { unite?: string | null; type?: string | null } | undefined): string {
  if (!a) return valeur;
  const n = a.type === "nombre" && /^-?\d+(\.\d+)?$/.test(valeur) ? Number(valeur) : null;
  const v = n !== null ? NOMBRE.format(n) : valeur;
  // Une valeur qui dit déjà son unité (« Environ 15 ml ») ne la reçoit pas une seconde fois.
  const dejaDite = !!a.unite && n === null && v.trim().toLowerCase().endsWith(a.unite.toLowerCase());
  return a.unite && !dejaDite ? `${v} ${a.unite}` : v;
}
