/* ============================================================================
   LES CARACTÉRISTIQUES (B9) — une valeur telle qu'on la lit. La base garde
   les nombres avec un point et sans unité (« 1400 », « 14.4 ») ; la vitrine
   écrit « 1 400 W », « 14,4 V ». Pur : sert au serveur comme au navigateur.
   ========================================================================== */

const NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });

/** La valeur d'une caractéristique, à la française, avec son unité. */
export function valeurAvecUnite(valeur: string, a: { unite?: string | null; type?: string | null } | undefined): string {
  if (!a) return valeur;
  const n = a.type === "nombre" && /^-?\d+(\.\d+)?$/.test(valeur) ? Number(valeur) : null;
  const v = n !== null ? NOMBRE.format(n) : valeur;
  return a.unite ? `${v} ${a.unite}` : v;
}
