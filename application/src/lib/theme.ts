/* ============================================================================
   LE THÈME — le GABARIT d'une boutique, et ce qu'elle y règle.

   Deux gabarits, deux structures (pas seulement deux palettes) :
   · editorial — mode, bagages, maroquinerie, maison : grandes images, peu de
                 mots, typographie de magazine (Instrument Serif / Sans),
                 angles droits. Références : COS, Sézane, Arket, Rimowa.
   · technique — outillage, quincaillerie, matériel pro : grille dense,
                 fiches techniques, recherche par référence, titres condensés
                 (Archivo), accent « pro ». Références : Festool, Hilti,
                 Milwaukee, Würth.
   Le gabarit choisit les composants (components/editorial, components/
   technique) ; la boutique règle par-dessus 13 couleurs, ses polices, ses
   textes et ses sections d'accueil (table `themes`, validée par la base).

   SÉCURITÉ : la feuille produite ici finit dans une balise <style>. La base
   refuse déjà toute valeur hors liste ; on revérifie chaque valeur avant de
   l'écrire (défense en profondeur) : une valeur douteuse est ignorée et le
   défaut du gabarit reste.
   ========================================================================== */

import { contraste, plusLisible } from "./couleur";
import { typographie } from "./typographie";

export type CodeTheme = "editorial" | "technique";
export const GABARITS: CodeTheme[] = ["editorial", "technique"];

/* LA STRUCTURE — ce que la boutique choisit (themes.code) : un gabarit, ou
   une structure bâtie sur l'un d'eux. Le Bento (l'accueil en mosaïque,
   l'en-tête flottant) reprend les composants éditoriaux : `code` reste la
   famille de composants, `structure` dit le choix. L'Immersif repose aussi
   sur les composants éditoriaux, comme le Monoproduit (la page de vente
   d'une pièce) ; le Commerce, sur les techniques. */
export type Structure = CodeTheme | "bento" | "immersif" | "commerce" | "monoproduit";
export const STRUCTURES: Structure[] = ["editorial", "bento", "immersif", "technique", "commerce", "monoproduit"];

export const JETONS_COULEUR = [
  "fond", "surface", "surface_2", "filet", "filet_fort", "contour_champ",
  "encre", "encre_doux", "accent", "accent_clair", "succes", "erreur", "alerte",
] as const;
export type JetonCouleur = (typeof JETONS_COULEUR)[number];

export type Police =
  | "instrument-serif" | "instrument-sans" | "archivo" | "young-serif" | "plex-sans"
  | "bodoni-moda" | "fraunces" | "syne" | "space-grotesk" | "manrope" | "dm-sans";
/* Les familles servies (app/polices.css), dans l'ordre où l'écran
   « Apparence » les propose ; `texte` : lisible aussi en texte courant. La
   base tient la même liste (private.valide_apparence, migration 64). */
export const POLICES_INFO: { valeur: Police; nom: string; caractere: string; texte: boolean }[] = [
  { valeur: "instrument-serif", nom: "Instrument Serif", caractere: "magazine, élégante", texte: false },
  { valeur: "bodoni-moda", nom: "Bodoni Moda", caractere: "haute couture, contrastée", texte: false },
  { valeur: "fraunces", nom: "Fraunces", caractere: "douce, généreuse", texte: false },
  { valeur: "young-serif", nom: "Young Serif", caractere: "empattements, chaleureuse", texte: false },
  { valeur: "syne", nom: "Syne", caractere: "audacieuse, graphique", texte: false },
  { valeur: "space-grotesk", nom: "Space Grotesk", caractere: "technologique, géométrique", texte: false },
  { valeur: "archivo", nom: "Archivo", caractere: "technique, condensée", texte: true },
  { valeur: "instrument-sans", nom: "Instrument Sans", caractere: "nette, contemporaine", texte: true },
  { valeur: "manrope", nom: "Manrope", caractere: "moderne, ronde", texte: true },
  { valeur: "dm-sans", nom: "DM Sans", caractere: "simple, amicale", texte: true },
  { valeur: "plex-sans", nom: "IBM Plex Sans", caractere: "sobre, lisible", texte: true },
];
export const POLICES_TITRES: Police[] = POLICES_INFO.map((p) => p.valeur);
export const POLICES_TEXTE: Police[] = POLICES_INFO.filter((p) => p.texte).map((p) => p.valeur);

const PILES_POLICES: Record<Police, string> = {
  "instrument-serif": 'var(--font-instrument-serif), "Instrument Serif", Georgia, "Times New Roman", serif',
  "instrument-sans": 'var(--font-instrument-sans), "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  archivo: 'var(--font-archivo), "Archivo", system-ui, -apple-system, "Segoe UI", sans-serif',
  "young-serif": 'var(--font-young-serif), "Young Serif", Georgia, serif',
  "plex-sans": 'var(--font-plex-sans), "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  "bodoni-moda": 'var(--font-bodoni-moda), "Bodoni Moda", "Didot", Georgia, serif',
  fraunces: 'var(--font-fraunces), "Fraunces", Georgia, serif',
  syne: 'var(--font-syne), "Syne", system-ui, -apple-system, "Segoe UI", sans-serif',
  "space-grotesk": 'var(--font-space-grotesk), "Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif',
  manrope: 'var(--font-manrope), "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif',
  "dm-sans": 'var(--font-dm-sans), "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
};

/** La pile CSS d'une police (aperçu de la console). */
export function pilePolice(police: Police): string {
  return PILES_POLICES[police];
}

/* Les familles arabes sont les mêmes pour tous les gabarits : Reem Kufi pour
   les titres, IBM Plex Sans Arabic pour le texte. Elles ne servent que le
   jour où `dir="rtl"` est posé. */
const PILES_ARABES = {
  titres: 'var(--font-reem-kufi), "Reem Kufi", "Noto Kufi Arabic", serif',
  texte: 'var(--font-plex-arabic), "IBM Plex Sans Arabic", "Noto Sans Arabic", sans-serif',
};

export type TextesSection = Record<string, string>;
/** `portrait` : le même sujet recadré en hauteur, pour les téléphones. */
export type ImageSection = { chemin: string; portrait?: string; detouree?: boolean };

export type Section =
  | { type: "hero"; textes: TextesSection; image?: ImageSection; lien?: string; alignement?: "debut" | "fin" }
  | { type: "rayons"; textes: TextesSection }
  | { type: "selection"; textes: TextesSection; nombre?: number; rayon?: string; lien?: string; tri?: "selection" | "nouveautes" }
  | { type: "editorial"; textes: TextesSection; image?: ImageSection; lien?: string }
  | { type: "engagements"; textes: TextesSection }
  | { type: "texte"; textes: TextesSection }
  // La bibliothèque commune aux gabarits (migration 59) : chacune tirée de ce
  // que la boutique a déjà — ses avis, une page de questions, ses marques.
  | { type: "avis"; textes: TextesSection; nombre?: number }
  | { type: "questions"; textes: TextesSection; page?: string; nombre?: number }
  | { type: "marques"; textes: TextesSection }
  // La structure immersive (migration 69), et toutes les autres : la photo
  // d'un look et ses points vers les pièces portées ; la pièce de la saison.
  | { type: "lookbook"; textes: TextesSection; image?: ImageSection; points: PointLookbook[] }
  | { type: "piece"; textes: TextesSection; produit?: string }
  // Les bannières (migration 75) : une à cinq, qui défilent, chacune sa
  // photo, ses textes et le lien de son bouton.
  | { type: "bannieres"; textes: TextesSection; diapos: Diapo[] };

/** Un point du lookbook : sa place sur la photo (en %), la pièce qu'il montre. */
export type PointLookbook = { x: number; y: number; produit: string };

/** Une bannière : sa photo (et son cadrage pour téléphone), titre, texte,
 *  bouton, description de la photo ; le lien, un chemin de la boutique. */
export type Diapo = { textes: TextesSection; image?: ImageSection; lien?: string };

/** Cinq bannières au plus (la base tient la même règle, migration 75). */
export const MAX_DIAPOS = 5;

export type TypeSection = Section["type"];

/* LE STYLE — ce que l'écran « Apparence » règle par-dessus le gabarit, en
   listes fermées (la base tient les mêmes : private.valide_apparence,
   migration 64). Chaque réglage devient un attribut de <html>
   (`data-coins="ronds"`…) que lit app/apparence.css, ou une variable de la
   feuille du thème (les angles, le format des photos). */
export const REGLAGES_STYLE = {
  coins: ["droits", "doux", "arrondis", "ronds"],
  boutons: ["pleins", "contour", "pilule"],
  // La couleur des boutons principaux : celle du texte, ou l'accent.
  teinte: ["encre", "accent"],
  cartes: ["nues", "cadre", "ombre"],
  photos: ["4-5", "1-1", "3-4"],
  titres: ["sobre", "ample", "immense"],
  casse: ["normale", "majuscules"],
  densite: ["serree", "normale", "aeree"],
  mode: ["clair", "sombre"],
  animations: ["oui", "non"],
} as const;
export type CleStyle = keyof typeof REGLAGES_STYLE;
export type Style = { [K in CleStyle]: (typeof REGLAGES_STYLE)[K][number] };
export const CLES_STYLE = Object.keys(REGLAGES_STYLE) as CleStyle[];

type Angles = { net: string; doux: string; carte: string; bloc: string; arc: string };

/* Les angles de chaque choix de coins : `net` (vignettes, pastilles
   carrées), `doux` (boutons, champs), `carte`, `bloc` (feuilles, tiroirs),
   `arc` (bandeaux). Toujours avec leur unité : « 0 » nu rendait invalides
   les `max(var(--theme-radius-…), 3px)` des menus et suggestions. */
const ANGLES: Record<Style["coins"], Angles> = {
  droits: { net: "0px", doux: "0px", carte: "0px", bloc: "0px", arc: "0px" },
  doux: { net: "2px", doux: "4px", carte: "4px", bloc: "6px", arc: "4px" },
  arrondis: { net: "6px", doux: "10px", carte: "16px", bloc: "22px", arc: "14px" },
  ronds: { net: "10px", doux: "14px", carte: "24px", bloc: "32px", arc: "22px" },
};

/** Le format des photos des cartes produit, en rapport CSS. */
export const RATIOS_PHOTO: Record<Style["photos"], string> = { "4-5": "4 / 5", "1-1": "1 / 1", "3-4": "3 / 4" };

type Definition = {
  couleurs: Record<JetonCouleur, string>;
  angles: Angles;
  polices: { titres: Police; texte: Police };
  style: Style;
  sections: Section[];
};

const DEFINITIONS: Record<CodeTheme, Definition> = {
  editorial: {
    // Craie, encre, bronze : la retenue des maisons de mode. Contrastes AA
    // (encre_doux sur fond 6,4:1 ; accent sur fond 5,1:1).
    couleurs: {
      fond: "#FAF8F5", surface: "#FFFFFF", surface_2: "#F2EEE8", filet: "#E7E2DA",
      filet_fort: "#CFC8BD", contour_champ: "#8F877B", encre: "#141414", encre_doux: "#5F5A53",
      accent: "#7A5A3A", accent_clair: "#C9A882", succes: "#3D6B47", erreur: "#A33A2B", alerte: "#8A6112",
    },
    angles: ANGLES.droits,
    polices: { titres: "instrument-serif", texte: "instrument-sans" },
    style: { coins: "droits", boutons: "pleins", teinte: "encre", cartes: "nues", photos: "4-5", titres: "ample", casse: "normale", densite: "normale", mode: "clair", animations: "oui" },
    sections: [
      { type: "hero", textes: {} },
      { type: "rayons", textes: {} },
      { type: "selection", textes: {}, nombre: 8 },
      { type: "editorial", textes: {} },
      { type: "engagements", textes: {} },
    ],
  },
  technique: {
    // Gris d'atelier, encre, jaune de sécurité : l'accent se lit en FOND
    // (bouton jaune, texte encre), jamais en texte sur blanc.
    couleurs: {
      fond: "#F3F3F1", surface: "#FFFFFF", surface_2: "#E9E9E6", filet: "#D7D7D2",
      filet_fort: "#ABABA4", contour_champ: "#6E6E68", encre: "#111214", encre_doux: "#4B4F56",
      accent: "#FFB800", accent_clair: "#FFD466", succes: "#1E7A34", erreur: "#C0341D", alerte: "#9A5B00",
    },
    angles: ANGLES.doux,
    polices: { titres: "archivo", texte: "archivo" },
    style: { coins: "doux", boutons: "pleins", teinte: "accent", cartes: "cadre", photos: "1-1", titres: "ample", casse: "majuscules", densite: "normale", mode: "clair", animations: "oui" },
    sections: [
      { type: "hero", textes: {} },
      { type: "rayons", textes: {} },
      { type: "selection", textes: {}, nombre: 10 },
      { type: "engagements", textes: {} },
    ],
  },
};

export type Theme = Definition & {
  code: CodeTheme;
  structure: Structure;
  logo: { chemin: string; mode: "masque" | "image"; ratio: number } | null;
  monogramme: string | null;
  favicon: string | null;
  textes: Record<string, string>;
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
const CHEMIN = /^[a-z0-9][a-z0-9/_.-]*$/;
const LIEN = /^\/[a-z0-9/_=~%.-]*$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function cheminSur(valeur: unknown): string | null {
  return typeof valeur === "string" && CHEMIN.test(valeur) && !valeur.includes("..") ? valeur : null;
}

/** Un lien INTERNE de la boutique (« /categorie/valises »), jamais une autre
 *  origine : pas de « // », pas de schéma. */
function lienSur(valeur: unknown): string | undefined {
  return typeof valeur === "string" && LIEN.test(valeur) && !valeur.startsWith("//") && !valeur.includes("..") ? valeur : undefined;
}

function textesSurs(valeur: unknown): Record<string, string> {
  const sortie: Record<string, string> = {};
  if (valeur && typeof valeur === "object" && !Array.isArray(valeur)) {
    for (const [cle, texte] of Object.entries(valeur)) {
      if (typeof texte === "string") sortie[cle] = texte;
    }
  }
  return sortie;
}

function imageSure(valeur: unknown): ImageSection | undefined {
  const image = valeur as { chemin?: unknown; chemin_portrait?: unknown; detouree?: unknown } | undefined;
  const chemin = cheminSur(image?.chemin);
  const portrait = cheminSur(image?.chemin_portrait);
  return chemin ? { chemin, ...(portrait ? { portrait } : {}), detouree: image?.detouree === true } : undefined;
}

function sectionsSures(valeur: unknown, defaut: Section[]): Section[] {
  if (!Array.isArray(valeur)) return defaut;
  const sections: Section[] = [];
  for (const brut of valeur) {
    if (!brut || typeof brut !== "object") continue;
    const s = brut as Record<string, unknown>;
    const textes = textesSurs(s.textes);
    const lien = lienSur(s.lien);
    switch (s.type) {
      case "hero": {
        const image = imageSure(s.image);
        const alignement = s.alignement === "fin" ? "fin" : undefined;
        sections.push({ type: "hero", textes, ...(image ? { image } : {}), ...(lien ? { lien } : {}), ...(alignement ? { alignement } : {}) });
        break;
      }
      case "editorial": {
        const image = imageSure(s.image);
        sections.push({ type: "editorial", textes, ...(image ? { image } : {}), ...(lien ? { lien } : {}) });
        break;
      }
      case "selection":
        sections.push({
          type: "selection",
          textes,
          nombre: typeof s.nombre === "number" ? Math.min(24, Math.max(1, Math.round(s.nombre))) : 8,
          ...(typeof s.rayon === "string" && SLUG.test(s.rayon) ? { rayon: s.rayon } : {}),
          ...(lien ? { lien } : {}),
          ...(s.tri === "nouveautes" ? { tri: "nouveautes" as const } : {}),
        });
        break;
      case "avis":
        sections.push({ type: "avis", textes, nombre: typeof s.nombre === "number" ? Math.min(12, Math.max(1, Math.round(s.nombre))) : 6 });
        break;
      case "questions":
        sections.push({
          type: "questions",
          textes,
          nombre: typeof s.nombre === "number" ? Math.min(12, Math.max(1, Math.round(s.nombre))) : 5,
          ...(typeof s.page === "string" && SLUG.test(s.page) && s.page.length <= 60 ? { page: s.page } : {}),
        });
        break;
      case "marques":
        sections.push({ type: "marques", textes });
        break;
      case "lookbook": {
        const image = imageSure(s.image);
        const points = (Array.isArray(s.points) ? s.points : []).flatMap((p) => {
          const q = p as { x?: unknown; y?: unknown; produit?: unknown } | null;
          const x = typeof q?.x === "number" ? q.x : NaN;
          const y = typeof q?.y === "number" ? q.y : NaN;
          return x >= 0 && x <= 100 && y >= 0 && y <= 100 && typeof q?.produit === "string" && SLUG.test(q.produit)
            ? [{ x, y, produit: q.produit }] : [];
        }).slice(0, 6);
        sections.push({ type: "lookbook", textes, ...(image ? { image } : {}), points });
        break;
      }
      case "piece":
        sections.push({ type: "piece", textes, ...(typeof s.produit === "string" && SLUG.test(s.produit) ? { produit: s.produit } : {}) });
        break;
      case "bannieres": {
        const diapos = (Array.isArray(s.diapos) ? s.diapos : []).flatMap((brute): Diapo[] => {
          if (!brute || typeof brute !== "object") return [];
          const d = brute as Record<string, unknown>;
          const image = imageSure(d.image);
          const lienDiapo = lienSur(d.lien);
          return [{ textes: textesSurs(d.textes), ...(image ? { image } : {}), ...(lienDiapo ? { lien: lienDiapo } : {}) }];
        }).slice(0, MAX_DIAPOS);
        sections.push({ type: "bannieres", textes, diapos });
        break;
      }
      // « comment_ca_marche » : l'ancien nom des engagements (paiement à la
      // livraison, livraison, retours).
      case "comment_ca_marche":
      case "engagements":
        sections.push({ type: "engagements", textes });
        break;
      case "rayons":
      case "texte":
        sections.push({ type: s.type, textes });
        break;
    }
  }
  return sections;
}

/** Le style lu en base, réglage par réglage : une valeur hors liste laisse
 *  le choix du gabarit. */
export function styleSur(valeur: unknown, defaut: Style): Style {
  const style = { ...defaut };
  const brut = valeur && typeof valeur === "object" && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : {};
  for (const cle of CLES_STYLE) {
    const v = brut[cle];
    if (typeof v === "string" && (REGLAGES_STYLE[cle] as readonly string[]).includes(v)) (style as Record<CleStyle, string>)[cle] = v;
  }
  return style;
}

/** Les attributs que le style pose sur <html> (lus par app/apparence.css). */
export function attributsDuStyle(style: Style): Record<string, string> {
  const attributs: Record<string, string> = {};
  for (const cle of CLES_STYLE) attributs[`data-${cle}`] = style[cle];
  return attributs;
}

/** Le gabarit (la famille de composants) d'un code lu en base : les
 *  structures mènent au gabarit sur lequel elles reposent, les anciens noms
 *  au gabarit qui les remplace. */
export function gabaritDe(code: unknown): CodeTheme {
  if (code === "technique" || code === "catalogue_technique" || code === "commerce") return "technique";
  return "editorial";
}

/** La structure d'un code lu en base. */
export function structureDe(code: unknown): Structure {
  if (code === "bento" || code === "immersif" || code === "commerce" || code === "monoproduit") return code;
  return gabaritDe(code);
}

/* Ce que chaque structure conseille par-dessus son gabarit : ses coins, ses
   boutons, son accueil par défaut. */
const PROPRE_A: Partial<Record<Structure, { style: Partial<Style>; sections?: Section[] }>> = {
  bento: {
    style: { coins: "ronds", boutons: "pilule" },
    sections: [
      { type: "hero", textes: {} },
      { type: "rayons", textes: {} },
      { type: "selection", textes: {}, nombre: 8 },
      { type: "editorial", textes: {} },
      { type: "avis", textes: {}, nombre: 3 },
      { type: "engagements", textes: {} },
    ],
  },
  // L'immersif : la photo d'abord, des angles nets, des boutons au trait ;
  // les sections qui n'ont rien à montrer (un lookbook sans photo, une pièce
  // sans produit) ne s'affichent pas.
  immersif: {
    style: { coins: "droits", boutons: "contour", cartes: "nues", photos: "3-4", titres: "immense" },
    sections: [
      { type: "hero", textes: {} },
      { type: "piece", textes: {} },
      { type: "selection", textes: {}, nombre: 8 },
      { type: "lookbook", textes: {}, points: [] },
      { type: "rayons", textes: {} },
      { type: "editorial", textes: {} },
      { type: "avis", textes: {}, nombre: 3 },
      { type: "engagements", textes: {} },
    ],
  },
  // Le commerce : la recherche d'abord, les services en bande juste dessous,
  // les rayons, des références en grille serrée ; des coins arrondis, des
  // titres en casse normale.
  commerce: {
    style: { coins: "arrondis", casse: "normale", titres: "sobre", densite: "serree" },
    sections: [
      { type: "hero", textes: {} },
      { type: "engagements", textes: {} },
      { type: "rayons", textes: {} },
      { type: "selection", textes: {}, nombre: 10 },
      { type: "marques", textes: {} },
      { type: "avis", textes: {}, nombre: 3 },
      { type: "questions", textes: {}, nombre: 4 },
    ],
  },
  // Le monoproduit : la page de vente d'une pièce — ses photos, ses offres
  // par quantité, la commande sur la page —, puis ce qui achève de
  // convaincre : le récit, les avis, les questions. Sans produit choisi, le
  // premier produit mis en avant (lib/accueil.ts).
  monoproduit: {
    style: { coins: "arrondis", boutons: "pilule", titres: "ample" },
    sections: [
      { type: "piece", textes: {} },
      { type: "editorial", textes: {} },
      { type: "avis", textes: {}, nombre: 6 },
      { type: "questions", textes: {}, nombre: 5 },
    ],
  },
};

/** Le style que conseille une structure (l'écran « Apparence » le pose quand on la choisit). */
export function styleConseille(structure: Structure): Style {
  return { ...DEFINITIONS[gabaritDe(structure)].style, ...(PROPRE_A[structure]?.style ?? {}) };
}

/** Les défauts d'un gabarit ou d'une structure (couleurs, polices, style,
 *  sections), pour la console et le backoffice. */
export function definitionDe(code: Structure): Definition {
  const def = DEFINITIONS[gabaritDe(code)];
  const propre = PROPRE_A[code];
  return propre ? { ...def, style: { ...def.style, ...propre.style }, sections: propre.sections ?? def.sections } : def;
}

/** Le thème effectif d'une boutique : son gabarit, les défauts du gabarit, et
 *  ses propres valeurs par-dessus — seulement celles qui passent la
 *  vérification. `brut` est la colonne `theme` de public.boutique_publique. */
export function themeDeLaBoutique(brut: Record<string, unknown> | null | undefined): Theme {
  const code = gabaritDe(brut?.code);
  const structure = structureDe(brut?.code);
  const def = definitionDe(structure);

  const couleurs = { ...def.couleurs };
  const propres = (brut?.couleurs ?? {}) as Record<string, unknown>;
  for (const jeton of JETONS_COULEUR) {
    const v = propres[jeton];
    if (typeof v === "string" && HEX.test(v)) couleurs[jeton] = v;
  }

  const polices = { ...def.polices };
  const choix = (brut?.polices ?? {}) as Record<string, unknown>;
  if (typeof choix.titres === "string" && (POLICES_TITRES as string[]).includes(choix.titres)) polices.titres = choix.titres as Police;
  if (typeof choix.texte === "string" && (POLICES_TEXTE as string[]).includes(choix.texte)) polices.texte = choix.texte as Police;

  const style = styleSur(brut?.style, def.style);

  const logoChemin = cheminSur(brut?.logo_chemin);
  const ratio = Number(brut?.logo_ratio);

  return {
    ...def,
    code,
    structure,
    couleurs,
    polices,
    style,
    angles: ANGLES[style.coins],
    logo: logoChemin
      ? {
          chemin: logoChemin,
          mode: brut?.logo_mode === "image" ? "image" : "masque",
          ratio: Number.isFinite(ratio) && ratio >= 0.2 && ratio <= 20 ? ratio : 5,
        }
      : null,
    monogramme: cheminSur(brut?.monogramme_chemin),
    favicon: cheminSur(brut?.favicon_chemin),
    textes: textesSurs(brut?.textes),
    sections: sectionsSures(brut?.sections, def.sections),
  };
}

/** La feuille de variables du thème, pour la balise <style> du layout. Toutes
 *  les valeurs ont été vérifiées par `themeDeLaBoutique` ; les URL sont
 *  construites sur une base de confiance et un chemin vérifié. */
export function feuilleDuTheme(theme: Theme, urlFichier: (chemin: string) => string): string {
  const v: string[] = [];
  for (const jeton of JETONS_COULEUR) v.push(`--theme-${jeton.replace("_", "-")}:${theme.couleurs[jeton]}`);
  for (const [nom, valeur] of Object.entries(theme.angles)) v.push(`--theme-radius-${nom}:${valeur}`);
  v.push(`--theme-font-display:${PILES_POLICES[theme.polices.titres]}`);
  v.push(`--theme-font-texte:${PILES_POLICES[theme.polices.texte]}`);
  v.push(`--theme-ratio-carte:${RATIOS_PHOTO[theme.style.photos]}`);
  // Les boutons principaux : leur teinte, et le texte qui s'y lit (4,5:1, ou
  // ce qui s'en approche le plus) ; en contour, le texte posé sur le fond.
  const c = theme.couleurs;
  const bouton = theme.style.teinte === "accent" ? c.accent : c.encre;
  const surBouton = [c.fond, c.surface, c.encre].find((x) => contraste(x, bouton) >= 4.5) ?? plusLisible(bouton, [c.fond, c.surface, c.encre, "#FFFFFF", "#000000"]);
  v.push(`--theme-bouton:${bouton}`);
  v.push(`--theme-sur-bouton:${surBouton}`);
  v.push(`--theme-bouton-trait:${contraste(bouton, c.fond) >= 4.5 ? bouton : c.encre}`);
  v.push(`--theme-sur-accent:${plusLisible(c.accent, [c.surface, c.encre, "#FFFFFF", "#000000"])}`);
  // Les champs, les barres de défilement et les cases suivent le mode.
  v.push(`color-scheme:${theme.style.mode === "sombre" ? "dark" : "light"}`);
  if (theme.logo) {
    v.push(`--theme-logo:url("${urlFichier(theme.logo.chemin)}")`);
    v.push(`--theme-logo-ratio:${theme.logo.ratio}`);
  }
  if (theme.monogramme) v.push(`--theme-monogramme:url("${urlFichier(theme.monogramme)}")`);

  return (
    `:root{${v.join(";")}}` +
    `[dir="rtl"]{--theme-font-display:${PILES_ARABES.titres};--theme-font-texte:${PILES_ARABES.texte}}`
  );
}

/** Texte d'une section ou de la marque, dans la langue voulue, avec repli sur
 *  l'autre langue puis sur le défaut fourni. */
export function texte(textes: Record<string, string>, cle: string, defaut = "", langue: "fr" | "ar" = "fr"): string {
  const autre = langue === "fr" ? "ar" : "fr";
  const v = textes[`${cle}_${langue}`] || textes[`${cle}_${autre}`] || defaut;
  // En français, les signes doubles ne passent plus seuls à la ligne.
  return langue === "fr" ? typographie(v) : v;
}
