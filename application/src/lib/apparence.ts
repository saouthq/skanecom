/* ============================================================================
   L'APPARENCE — ce que l'éditeur de la vitrine (backoffice) règle et
   envoie : la structure, les 13 couleurs, les polices, le style
   (lib/theme.ts) et l'accueil (ses sections, lib/gestion/accueil.ts). Ici,
   ce qui se calcule des deux côtés (l'écran, la route qui enregistre) :

   · la forme d'un contenu, relue valeur par valeur (rien d'inconnu ne part
     vers la base, qui revérifie : migrations 64 et 66) ;
   · les AMBIANCES, des palettes prêtes, claires ou sombres ;
   · la palette DÉRIVÉE : à partir du fond, du texte et de l'accent, les
     treize couleurs du thème, chacune poussée jusqu'au contraste qu'exige
     son usage (texte 4,5:1, contours 3:1 — WCAG 2.2 AA).
   ========================================================================== */

import { contraste, estFoncee, estHex, melange, versContraste } from "./couleur";
import { BIBLIOTHEQUE, MAX_SECTIONS, versBase as accueilVersBase, type SectionBrute } from "./gestion/accueil";
import {
  definitionDe, JETONS_COULEUR, POLICES_TEXTE, POLICES_TITRES, structureDe, styleSur,
  type JetonCouleur, type Police, type Structure, type Style,
} from "./theme";

export type Palette = Record<JetonCouleur, string>;

export type ContenuApparence = {
  /** La structure (themes.code) : éditoriale, bento, technique. */
  code: Structure;
  couleurs: Palette;
  polices: { titres: Police; texte: Police };
  style: Style;
  /** L'accueil : ses sections (null : celles de la structure). Absent,
   *  l'accueil publié reste tel quel (un brouillon d'avant la migration 66,
   *  le formulaire sans script). */
  sections?: SectionBrute[] | null;
};

/** Le contenu effectif d'un thème lu en base (les défauts du gabarit sous ce
 *  qui manque), ou d'un brouillon. */
export function contenuDe(brut: unknown): ContenuApparence {
  const b = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const code = structureDe(b.code);
  const def = definitionDe(code);
  const couleurs = { ...def.couleurs };
  const propres = (b.couleurs ?? {}) as Record<string, unknown>;
  for (const j of JETONS_COULEUR) if (estHex(propres[j])) couleurs[j] = (propres[j] as string).toUpperCase();
  const p = (b.polices ?? {}) as Record<string, unknown>;
  const polices = {
    titres: (POLICES_TITRES as string[]).includes(String(p.titres)) ? (p.titres as Police) : def.polices.titres,
    texte: (POLICES_TEXTE as string[]).includes(String(p.texte)) ? (p.texte as Police) : def.polices.texte,
  };
  return { code, couleurs, polices, style: styleSur(b.style, def.style), ...("sections" in b ? { sections: sectionsLues(b.sections) } : {}) };
}

/** Ce que la base reçoit : le contenu tel quel (les 13 couleurs, les deux
 *  polices, tout le style, l'accueil) — une boutique réglée à l'écran ne
 *  dépend plus des défauts du gabarit. */
export function versBase(c: ContenuApparence): Record<string, unknown> {
  return {
    code: c.code, couleurs: { ...c.couleurs }, polices: { ...c.polices }, style: { ...c.style },
    ...(c.sections === undefined ? {} : { sections: c.sections === null ? null : (accueilVersBase(c.sections) ?? []) }),
  };
}

export function memeContenu(a: ContenuApparence, b: ContenuApparence): boolean {
  return JSON.stringify(versBase(a)) === JSON.stringify(versBase(b));
}

/* ---- L'accueil, dans le contenu ------------------------------------------- */

/** Les sections lues (thème publié, brouillon) : la forme de la base, une clé
 *  locale pour l'écran. Ce qui n'est pas une section connue est écarté. */
function sectionsLues(valeur: unknown): SectionBrute[] | null {
  if (!Array.isArray(valeur)) return null;
  return valeur
    .filter((s): s is SectionBrute => Boolean(s) && typeof s === "object" && typeof (s as { type?: unknown }).type === "string" && (s as { type: string }).type in BIBLIOTHEQUE)
    .map((s, i) => ({ ...s, cle: `s${i}` }));
}

/** L'accueil d'une structure, quand la boutique n'a pas composé le sien —
 *  celui que la vitrine rend (lib/theme.ts), dans la forme de la base. */
export function sectionsDeStructure(code: Structure): SectionBrute[] {
  return definitionDe(code).sections.map((s, i) => {
    const { image, ...reste } = s as Record<string, unknown> & { image?: { chemin: string; portrait?: string; detouree?: boolean } };
    return {
      ...(reste as Omit<SectionBrute, "image">),
      ...(image ? { image: { chemin: image.chemin, ...(image.portrait ? { chemin_portrait: image.portrait } : {}), ...(image.detouree ? { detouree: true } : {}) } } : {}),
      cle: `d-${code}-${i}`,
    } as SectionBrute;
  });
}

/** Le contenu reçu de l'écran, relu pour la base : null si l'accueil est
 *  illisible (la route refuse plutôt que de revenir à l'accueil de la
 *  structure sans le dire). Sans `sections`, l'accueil publié reste. */
export function contenuRecu(brut: unknown): Record<string, unknown> | null {
  const b = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const { sections: _lues, ...c } = contenuDe(b);
  void _lues;
  const base = versBase(c);
  if (!("sections" in b)) return base;
  if (b.sections === null) return { ...base, sections: null };
  if (!Array.isArray(b.sections) || b.sections.length === 0 || b.sections.length > MAX_SECTIONS) return null;
  const sections = accueilVersBase(b.sections as SectionBrute[]);
  return sections ? { ...base, sections } : null;
}

/** Les photos qu'emploie un contenu (son accueil). */
export function photosDe(c: ContenuApparence): string[] {
  return (c.sections ?? []).flatMap((s) => (s.image ? [s.image.chemin, s.image.chemin_portrait].filter((x): x is string => Boolean(x)) : []));
}

/* ---- La palette dérivée ---------------------------------------------------- */

export type Mode = Style["mode"];

/** Les treize couleurs, d'après le fond, le texte et l'accent. */
export function paletteDerivee(fond: string, encre: string, accent: string, mode: Mode): Palette {
  const sombre = mode === "sombre";
  const surface = sombre ? melange(fond, "#FFFFFF", 0.05) : "#FFFFFF";
  return {
    fond,
    surface,
    surface_2: sombre ? melange(fond, "#FFFFFF", 0.09) : melange(fond, encre, 0.05),
    filet: melange(fond, encre, sombre ? 0.14 : 0.1),
    filet_fort: melange(fond, encre, sombre ? 0.28 : 0.22),
    contour_champ: versContraste(melange(fond, encre, sombre ? 0.5 : 0.45), surface, 3),
    encre,
    encre_doux: versContraste(melange(encre, fond, sombre ? 0.35 : 0.4), fond, 4.5),
    accent,
    // L'accent posé sur un aplat d'encre (pied de page, bandeaux foncés).
    accent_clair: versContraste(melange(accent, sombre ? "#000000" : "#FFFFFF", 0.3), encre, 4.5),
    succes: versContraste(sombre ? "#7CC08E" : "#3D6B47", fond, 4.5),
    erreur: versContraste(sombre ? "#F08A78" : "#A33A2B", fond, 4.5),
    alerte: versContraste(sombre ? "#E3B65C" : "#8A6112", fond, 4.5),
  };
}

/** Le même accent, sur la même palette : seuls l'accent et son pendant sur
 *  l'encre changent (les autres couleurs, peut-être réglées à la main, ne
 *  bougent pas). */
export function avecAccent(p: Palette, accent: string): Palette {
  return { ...p, accent, accent_clair: versContraste(melange(accent, estFoncee(p.fond) ? "#000000" : "#FFFFFF", 0.3), p.encre, 4.5) };
}

/* ---- Les ambiances ---------------------------------------------------------- */

export type Ambiance = { id: string; nom: string; mode: Mode; fond: string; encre: string; accent: string };

export const AMBIANCES: Ambiance[] = [
  { id: "craie", nom: "Craie et bronze", mode: "clair", fond: "#FAF8F5", encre: "#141414", accent: "#7A5A3A" },
  { id: "olive", nom: "Olivier", mode: "clair", fond: "#F6F4EE", encre: "#1E2320", accent: "#5E6B4E" },
  { id: "rose", nom: "Rose poudré", mode: "clair", fond: "#FBF7F6", encre: "#241A1D", accent: "#A4506F" },
  { id: "terre", nom: "Terre cuite", mode: "clair", fond: "#F7F1EA", encre: "#22180F", accent: "#B4553A" },
  { id: "marine", nom: "Bleu nuit", mode: "clair", fond: "#F5F6F7", encre: "#121826", accent: "#2C4A7A" },
  { id: "atelier", nom: "Atelier", mode: "clair", fond: "#F3F3F1", encre: "#111214", accent: "#FFB800" },
  { id: "nuit", nom: "Nuit", mode: "sombre", fond: "#121212", encre: "#F2EFEA", accent: "#C9A882" },
  { id: "ebene", nom: "Ébène et or", mode: "sombre", fond: "#0F0E0C", encre: "#F5F0E6", accent: "#D4AF6A" },
  { id: "foret", nom: "Forêt", mode: "sombre", fond: "#111612", encre: "#EEF1EA", accent: "#9DB58A" },
];

/** Les fonds proposés, selon le mode. */
export const FONDS: Record<Mode, { nom: string; hex: string }[]> = {
  clair: [
    { nom: "Blanc", hex: "#FFFFFF" }, { nom: "Craie", hex: "#FAF8F5" }, { nom: "Lin", hex: "#F6F4EE" },
    { nom: "Sable", hex: "#F7F1EA" }, { nom: "Brume", hex: "#F5F6F7" }, { nom: "Pierre", hex: "#F3F3F1" },
  ],
  sombre: [
    { nom: "Nuit", hex: "#121212" }, { nom: "Ébène", hex: "#0F0E0C" }, { nom: "Forêt", hex: "#111612" },
    { nom: "Ardoise", hex: "#14171C" }, { nom: "Prune", hex: "#18121A" },
  ],
};

/** Les accents proposés d'un geste (tout autre se choisit au nuancier). */
export const ACCENTS: { nom: string; hex: string }[] = [
  { nom: "Bronze", hex: "#7A5A3A" }, { nom: "Olive", hex: "#5E6B4E" }, { nom: "Rose poudré", hex: "#A4506F" },
  { nom: "Terre cuite", hex: "#B4553A" }, { nom: "Bleu nuit", hex: "#2C4A7A" }, { nom: "Jaune chantier", hex: "#FFB800" },
  { nom: "Or", hex: "#D4AF6A" }, { nom: "Sauge", hex: "#9DB58A" },
];

/** Le texte qui va avec un mode : l'encre foncée sur un fond clair, la craie
 *  sur un fond sombre. */
export function encrePour(mode: Mode, actuelle: string): string {
  if (mode === "sombre") return estFoncee(actuelle) ? "#F2EFEA" : actuelle;
  return estFoncee(actuelle) ? actuelle : "#141414";
}

/* ---- Les contrastes que l'écran annonce ------------------------------------ */

export type Verdict = { cle: string; libelle: string; rapport: number; seuil: number };

export function verdicts(p: Palette): Verdict[] {
  return [
    { cle: "texte", libelle: "Le texte sur le fond", rapport: contraste(p.encre, p.fond), seuil: 4.5 },
    { cle: "doux", libelle: "Le texte secondaire", rapport: contraste(p.encre_doux, p.fond), seuil: 4.5 },
    { cle: "accent", libelle: "L'accent sur le fond", rapport: contraste(p.accent, p.fond), seuil: 3 },
  ];
}

/** « 4,5:1 », à la française. */
export function rapportLisible(r: number): string {
  return `${(Math.floor(r * 10) / 10).toLocaleString("fr-FR")}:1`;
}
