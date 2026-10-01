/* ============================================================================
   LES COULEURS — le calcul, sans dépendance : mélanger deux couleurs, mesurer
   un contraste (WCAG 2.x), pousser une couleur vers le noir ou le blanc
   jusqu'à un contraste voulu. Servi au thème (la teinte du texte d'un bouton,
   lib/theme.ts) et à l'écran « Apparence » (les palettes dérivées,
   lib/apparence.ts). Toutes les couleurs sont des #RRGGBB.
   ========================================================================== */

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function estHex(valeur: unknown): valeur is string {
  return typeof valeur === "string" && HEX.test(valeur);
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function versHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** `b` mélangé à `a`, pour la part `part` (0 : a, 1 : b). */
export function melange(a: string, b: string, part: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return versHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * part) as [number, number, number]);
}

/** La luminance relative (WCAG). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Le rapport de contraste entre deux couleurs, de 1 à 21. */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Une couleur foncée (sa luminance est sous celle du gris moyen). */
export function estFoncee(hex: string): boolean {
  return luminance(hex) < 0.18;
}

/** `couleur`, poussée vers le noir (sur un fond clair) ou le blanc (sur un
 *  fond foncé) par petits pas, jusqu'à atteindre `cible` contre `fond`.
 *  Rendue telle quelle si elle y est déjà. */
export function versContraste(couleur: string, fond: string, cible: number): string {
  if (contraste(couleur, fond) >= cible) return couleur;
  const vers = estFoncee(fond) ? "#FFFFFF" : "#000000";
  for (let part = 0.05; part <= 1; part += 0.05) {
    const essai = melange(couleur, vers, part);
    if (contraste(essai, fond) >= cible) return essai;
  }
  return vers;
}

/** Des couleurs proposées, celle qui se lit le mieux sur `fond`. */
export function plusLisible(fond: string, candidates: string[]): string {
  return candidates.reduce((meilleure, c) => (contraste(c, fond) > contraste(meilleure, fond) ? c : meilleure));
}
