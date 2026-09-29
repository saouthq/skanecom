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

export type CodeTheme = "editorial" | "technique";
export const GABARITS: CodeTheme[] = ["editorial", "technique"];

export const JETONS_COULEUR = [
  "fond", "surface", "surface_2", "filet", "filet_fort", "contour_champ",
  "encre", "encre_doux", "accent", "accent_clair", "succes", "erreur", "alerte",
] as const;
export type JetonCouleur = (typeof JETONS_COULEUR)[number];

export type Police = "instrument-serif" | "instrument-sans" | "archivo" | "young-serif" | "plex-sans";
export const POLICES_TITRES: Police[] = ["instrument-serif", "instrument-sans", "archivo", "young-serif", "plex-sans"];
export const POLICES_TEXTE: Police[] = ["instrument-sans", "archivo", "plex-sans"];

const PILES_POLICES: Record<Police, string> = {
  "instrument-serif": 'var(--font-instrument-serif), "Instrument Serif", Georgia, "Times New Roman", serif',
  "instrument-sans": 'var(--font-instrument-sans), "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  archivo: 'var(--font-archivo), "Archivo", system-ui, -apple-system, "Segoe UI", sans-serif',
  "young-serif": 'var(--font-young-serif), "Young Serif", Georgia, serif',
  "plex-sans": 'var(--font-plex-sans), "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
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
  | { type: "selection"; textes: TextesSection; nombre?: number; rayon?: string; lien?: string }
  | { type: "editorial"; textes: TextesSection; image?: ImageSection; lien?: string }
  | { type: "engagements"; textes: TextesSection }
  | { type: "texte"; textes: TextesSection };

type Angles = { net: string; doux: string; carte: string; bloc: string; arc: string };

type Definition = {
  couleurs: Record<JetonCouleur, string>;
  angles: Angles;
  polices: { titres: Police; texte: Police };
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
    angles: { net: "0", doux: "0", carte: "0", bloc: "0", arc: "0" },
    polices: { titres: "instrument-serif", texte: "instrument-sans" },
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
    angles: { net: "2px", doux: "4px", carte: "4px", bloc: "6px", arc: "4px" },
    polices: { titres: "archivo", texte: "archivo" },
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
        });
        break;
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

/** Le gabarit d'un code lu en base (les anciens noms mènent au gabarit qui
 *  les remplace). */
export function gabaritDe(code: unknown): CodeTheme {
  if (code === "technique" || code === "catalogue_technique") return "technique";
  return "editorial";
}

/** Les défauts d'un gabarit (couleurs, polices…), pour la console. */
export function definitionDe(code: CodeTheme): Definition {
  return DEFINITIONS[code];
}

/** Le thème effectif d'une boutique : son gabarit, les défauts du gabarit, et
 *  ses propres valeurs par-dessus — seulement celles qui passent la
 *  vérification. `brut` est la colonne `theme` de public.boutique_publique. */
export function themeDeLaBoutique(brut: Record<string, unknown> | null | undefined): Theme {
  const code = gabaritDe(brut?.code);
  const def = DEFINITIONS[code];

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

  const logoChemin = cheminSur(brut?.logo_chemin);
  const ratio = Number(brut?.logo_ratio);

  return {
    ...def,
    code,
    couleurs,
    polices,
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
  return textes[`${cle}_${langue}`] || textes[`${cle}_${autre}`] || defaut;
}
