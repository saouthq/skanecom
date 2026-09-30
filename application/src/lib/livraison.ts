/* ============================================================================
   LA FENÊTRE DE LIVRAISON — « livré entre le jeu. 2 et le mar. 7 oct. » :
   le délai de la boutique (l'enveloppe réelle de ses zones, en jours ouvrés,
   lib/boutique.ts) compté à partir d'aujourd'hui à l'heure de Tunis, du
   lundi au vendredi (le premier jour compté est le prochain jour ouvré).
   ========================================================================== */

const JOUR_MS = 86_400_000;
const JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" });
const JOUR_MOIS = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "numeric", timeZone: "UTC" });

/** Aujourd'hui à Tunis, à midi UTC (l'arithmétique des jours sans fuseau). */
function aujourdhuiTunis(maintenant: Date): Date {
  const [a, m, j] = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(maintenant).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j, 12));
}

/** Le n-ième jour ouvré (lundi–vendredi) après `depart`. */
function joursOuvres(depart: Date, n: number): Date {
  let d = depart;
  for (let compte = 0; compte < n; ) {
    d = new Date(d.getTime() + JOUR_MS);
    const jour = d.getUTCDay();
    if (jour !== 0 && jour !== 6) compte++;
  }
  return d;
}

export function fenetreLivraison(min: number, max: number, maintenant = new Date()): { du: Date; au: Date } {
  const base = aujourdhuiTunis(maintenant);
  return { du: joursOuvres(base, Math.max(1, min)), au: joursOuvres(base, Math.max(1, min, max)) };
}

/** « jeu. 1er oct. » : le premier du mois s'écrit « 1er ». */
function jour(d: Date, format: Intl.DateTimeFormat): string {
  return format.formatToParts(d).map((p) => (p.type === "day" && p.value === "1" ? "1er" : p.value)).join("");
}

/** « entre le jeu. 2 et le mar. 7 oct. », « le jeu. 1er oct. ». */
export function texteFenetre({ du, au }: { du: Date; au: Date }): string {
  if (du.getTime() === au.getTime()) return `le ${jour(au, JOUR_MOIS)}`;
  const memeMois = MOIS.format(du) === MOIS.format(au);
  return `entre le ${jour(du, memeMois ? JOUR : JOUR_MOIS)} et le ${jour(au, JOUR_MOIS)}`;
}
