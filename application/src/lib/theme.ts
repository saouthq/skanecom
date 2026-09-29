/* ============================================================================
   LE THÈME — ce qui habille une boutique, sans toucher au code.

   Deux thèmes (décision D19) :
   · premium_sobre       — la charte de Maymar, devenue thème n°1 : chaux,
                           encre de nuit, laiton, plein cintre, Young Serif ;
   · catalogue_technique — pour l'outillage et la quincaillerie : fond neutre,
                           angles vifs, titres en Archivo.
   Chaque boutique part des valeurs de son thème et remplace ce qu'elle veut
   parmi 13 jetons de couleur (table `themes`, validée par la base).

   Les composants n'emploient JAMAIS une couleur : seulement les utilitaires
   Tailwind dérivés des jetons (bg-fond, text-encre…) et les classes de
   marque.css, qui lisent les variables `--theme-*` écrites ici.

   SÉCURITÉ : la feuille produite ici finit dans une balise <style>. La base
   refuse déjà toute valeur hors liste ; on revérifie quand même chaque valeur
   avant de l'écrire (défense en profondeur) : une valeur douteuse est ignorée
   et le défaut du thème reste.
   ========================================================================== */

export type CodeTheme = "premium_sobre" | "catalogue_technique";

export const JETONS_COULEUR = [
  "fond", "surface", "surface_2", "filet", "filet_fort", "contour_champ",
  "encre", "encre_doux", "accent", "accent_clair", "succes", "erreur", "alerte",
] as const;
export type JetonCouleur = (typeof JETONS_COULEUR)[number];

export type Police = "young-serif" | "plex-sans" | "archivo";

const PILES_POLICES: Record<Police, string> = {
  "young-serif": 'var(--font-young-serif, "Young Serif"), Georgia, "Times New Roman", serif',
  "plex-sans": 'var(--font-plex-sans, "IBM Plex Sans"), system-ui, -apple-system, "Segoe UI", sans-serif',
  archivo: 'var(--font-archivo, "Archivo"), system-ui, -apple-system, "Segoe UI", sans-serif',
};

/* Les familles arabes sont les mêmes pour tous les thèmes : Reem Kufi pour
   les titres (la charpente de Young Serif), IBM Plex Sans Arabic pour le
   texte. Elles ne se chargent que le jour où `dir="rtl"` est posé. */
const PILES_ARABES = {
  titres: 'var(--font-reem-kufi, "Reem Kufi"), "Noto Kufi Arabic", serif',
  texte: 'var(--font-plex-arabic, "IBM Plex Sans Arabic"), "Noto Sans Arabic", sans-serif',
};

export type TextesSection = Record<string, string>;

export type Section =
  | { type: "hero"; textes: TextesSection; image?: { chemin: string; detouree?: boolean } }
  | { type: "rayons"; textes: TextesSection }
  | { type: "selection"; textes: TextesSection; nombre?: number }
  | { type: "comment_ca_marche"; textes: TextesSection }
  | { type: "texte"; textes: TextesSection };

type Definition = {
  couleurs: Record<JetonCouleur, string>;
  rayons: { net: string; doux: string; carte: string; bloc: string; arc: string };
  polices: { titres: Police; texte: Police };
  sections: Section[];
};

const SECTIONS_PAR_DEFAUT: Section[] = [
  { type: "hero", textes: {} },
  { type: "rayons", textes: {} },
  { type: "selection", textes: {}, nombre: 4 },
  { type: "comment_ca_marche", textes: {} },
];

const DEFINITIONS: Record<CodeTheme, Definition> = {
  premium_sobre: {
    // Valeurs de la charte de Maymar (Noah, 10/08/2026), contrastes mesurés.
    couleurs: {
      fond: "#FBF8F3", surface: "#FFFFFF", surface_2: "#F3EDE2", filet: "#E4DBCC",
      filet_fort: "#C9BCA6", contour_champ: "#9C8B6E", encre: "#10243A", encre_doux: "#4C5A6B",
      accent: "#8A6224", accent_clair: "#B98B3E", succes: "#4A6B3A", erreur: "#A8432E", alerte: "#8A6512",
    },
    rayons: { net: "0.125rem", doux: "0.375rem", carte: "0.625rem", bloc: "1rem", arc: "62.5rem" },
    polices: { titres: "young-serif", texte: "plex-sans" },
    sections: SECTIONS_PAR_DEFAUT,
  },
  catalogue_technique: {
    couleurs: {
      fond: "#F6F6F4", surface: "#FFFFFF", surface_2: "#EDEDE9", filet: "#D9D9D2",
      filet_fort: "#B4B4AB", contour_champ: "#7C7C74", encre: "#17191C", encre_doux: "#4A4F57",
      accent: "#8A6400", accent_clair: "#E8B100", succes: "#2F6B3A", erreur: "#A83A2E", alerte: "#8A5A00",
    },
    // Angles vifs : l'« arc » devient une carte droite.
    rayons: { net: "0.125rem", doux: "0.25rem", carte: "0.375rem", bloc: "0.5rem", arc: "0.375rem" },
    polices: { titres: "archivo", texte: "plex-sans" },
    sections: SECTIONS_PAR_DEFAUT,
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

function cheminSur(valeur: unknown): string | null {
  return typeof valeur === "string" && CHEMIN.test(valeur) && !valeur.includes("..") ? valeur : null;
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

function sectionsSures(valeur: unknown, defaut: Section[]): Section[] {
  if (!Array.isArray(valeur)) return defaut;
  const sections: Section[] = [];
  for (const brut of valeur) {
    if (!brut || typeof brut !== "object") continue;
    const s = brut as Record<string, unknown>;
    const textes = textesSurs(s.textes);
    switch (s.type) {
      case "hero": {
        const image = s.image as { chemin?: unknown; detouree?: unknown } | undefined;
        const chemin = cheminSur(image?.chemin);
        sections.push({
          type: "hero",
          textes,
          ...(chemin ? { image: { chemin, detouree: image?.detouree === true } } : {}),
        });
        break;
      }
      case "selection":
        sections.push({
          type: "selection",
          textes,
          nombre: typeof s.nombre === "number" ? Math.min(24, Math.max(1, Math.round(s.nombre))) : 4,
        });
        break;
      case "rayons":
      case "comment_ca_marche":
      case "texte":
        sections.push({ type: s.type, textes });
        break;
    }
  }
  return sections;
}

/** Le thème effectif d'une boutique : son code, les défauts de ce code, et
 *  ses propres valeurs par-dessus — seulement celles qui passent la
 *  vérification. `brut` est la colonne `theme` de public.boutique_publique. */
export function themeDeLaBoutique(brut: Record<string, unknown> | null | undefined): Theme {
  const code: CodeTheme = brut?.code === "catalogue_technique" ? "catalogue_technique" : "premium_sobre";
  const def = DEFINITIONS[code];

  const couleurs = { ...def.couleurs };
  const propres = (brut?.couleurs ?? {}) as Record<string, unknown>;
  for (const jeton of JETONS_COULEUR) {
    const v = propres[jeton];
    if (typeof v === "string" && HEX.test(v)) couleurs[jeton] = v;
  }

  const polices = { ...def.polices };
  const choix = (brut?.polices ?? {}) as Record<string, unknown>;
  if (typeof choix.titres === "string" && choix.titres in PILES_POLICES) polices.titres = choix.titres as Police;
  if (choix.texte === "plex-sans") polices.texte = "plex-sans";

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
  for (const [nom, valeur] of Object.entries(theme.rayons)) v.push(`--theme-radius-${nom}:${valeur}`);
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
