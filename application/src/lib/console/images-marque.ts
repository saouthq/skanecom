import { definitionDe, gabaritDe } from "@/lib/theme";

/* ============================================================================
   LE LOGO ET LES IMAGES DE LA MARQUE — ce que la console téléverse, et les
   règles de chaque emplacement, communes au navigateur (qui prépare le
   fichier) et au serveur (qui le revérifie avant de le déposer).

   Deux familles :
   · les TRACÉS (logo, monogramme, icône d'onglet) : PNG à fond transparent,
     marges vides rognées ; un SVG est converti dans le navigateur (jamais
     déposé tel quel : un SVG peut porter du script) ;
   · les PHOTOS de l'accueil (ouverture et son cadrage pour téléphone,
     récit) : WebP, réduites avant l'envoi.
   ========================================================================== */

export type Emplacement = "logo" | "monogramme" | "favicon" | "ouverture" | "ouverture_portrait" | "recit";
export const EMPLACEMENTS: Emplacement[] = ["logo", "monogramme", "favicon", "ouverture", "ouverture_portrait", "recit"];

export type Regle = {
  titre: string;
  /** Où l'image paraît. */
  role: string;
  /** Ce qu'il faut fournir. */
  conseil: string;
  genre: "trace" | "photo";
  /** La boîte où l'image est réduite (px). */
  boite: { largeur: number; hauteur: number };
  /** Le plus grand côté, au moins (px) : en dessous, l'image serait floue. */
  minimum: number;
  forme?: "carre" | "portrait";
  /** Libellé du geste réussi. */
  fait: string;
};

export const REGLES: Record<Emplacement, Regle> = {
  logo: {
    titre: "Logo",
    role: "En tête de chaque page, et en grand dans le pied de page.",
    conseil: "SVG ou PNG à fond transparent. Les marges vides sont rognées.",
    genre: "trace", boite: { largeur: 2400, hauteur: 480 }, minimum: 240, fait: "Logo enregistré",
  },
  monogramme: {
    titre: "Monogramme",
    role: "Le filigrane des produits qui attendent leur photo.",
    conseil: "Un signe ou une initiale, à fond transparent (SVG ou PNG).",
    genre: "trace", boite: { largeur: 512, hauteur: 512 }, minimum: 96, fait: "Monogramme enregistré",
  },
  favicon: {
    titre: "Icône d'onglet",
    role: "Dans l'onglet du navigateur, les favoris et l'écran d'accueil du téléphone.",
    conseil: "Carrée, 256 px au moins. Complétée en carré sinon.",
    genre: "trace", boite: { largeur: 256, hauteur: 256 }, minimum: 48, forme: "carre", fait: "Icône enregistrée",
  },
  ouverture: {
    titre: "Photo d'ouverture",
    role: "La grande photo en haut de l'accueil.",
    conseil: "Paysage, 2 400 px de large idéalement, 1 200 au moins.",
    genre: "photo", boite: { largeur: 2400, hauteur: 2400 }, minimum: 1200, fait: "Photo d'ouverture enregistrée",
  },
  ouverture_portrait: {
    titre: "Cadrage pour téléphone",
    role: "La même photo recadrée en hauteur, pour les téléphones. Sans elle, le téléphone recadre la photo paysage en son centre.",
    conseil: "Portrait, 1 000 px de haut au moins.",
    genre: "photo", boite: { largeur: 1600, hauteur: 1600 }, minimum: 1000, forme: "portrait", fait: "Cadrage pour téléphone enregistré",
  },
  recit: {
    titre: "Photo du récit",
    role: "À côté du texte qui raconte la boutique, plus bas sur l'accueil.",
    conseil: "1 000 px au moins sur son plus grand côté.",
    genre: "photo", boite: { largeur: 2000, hauteur: 2000 }, minimum: 1000, fait: "Photo du récit enregistrée",
  },
};

/** Au-delà, une image envoyée sans être réduite (navigateur sans script) est refusée. */
export const COTE_MAX = 6000;

/** Ce qui ne va pas dans une image de ces dimensions, ou null. `source` :
 *  l'image choisie, avant que le navigateur la prépare (réduite, rognée,
 *  mise au carré) — seuls comptent alors sa finesse et son sens. */
export function defautImage(e: Emplacement, largeur: number, hauteur: number, source = false): string | null {
  const r = REGLES[e];
  const grand = Math.max(largeur, hauteur);
  const taille = `${largeur} × ${hauteur} px`;
  if (grand < r.minimum) return `Image trop petite (${taille}) : ${r.titre.toLowerCase()} demande ${r.minimum.toLocaleString("fr-FR")} px au moins sur son plus grand côté.`;
  if (r.forme === "portrait" && hauteur <= largeur) return `Le cadrage pour téléphone est en hauteur : cette image (${taille}) est plus large que haute.`;
  if (source) return null;
  if (grand > COTE_MAX) return `Image trop grande (${taille}) : ${COTE_MAX.toLocaleString("fr-FR")} px au plus.`;
  if (r.forme === "carre" && (largeur / hauteur < 0.8 || largeur / hauteur > 1.25)) return `L'icône d'onglet est carrée : cette image fait ${taille}.`;
  if (e === "logo" && (largeur / hauteur > 20 || largeur / hauteur < 0.2)) return `Ce logo est trop allongé (${taille}) : recadrez-le au plus près du dessin.`;
  return null;
}

export type PhotoAccueil = { chemin: string | null; portrait: string | null; alt: string };

/** Ce que l'écran montre et tient à jour. */
export type ImagesMarque = {
  version: number;
  logo: { chemin: string; ratio: number; mode: "masque" | "image" } | null;
  monogramme: string | null;
  favicon: string | null;
  /** null : l'accueil n'a pas de section de ce type. */
  ouverture: PhotoAccueil | null;
  recit: PhotoAccueil | null;
};

type SectionBrute = { type?: string; image?: { chemin?: string; chemin_portrait?: string }; textes?: Record<string, string> };

/** Les images d'un thème tel que la base le rend (public.themes). */
export function imagesDuTheme(t: Record<string, unknown>): ImagesMarque {
  const sections = (Array.isArray(t.sections) ? t.sections : definitionDe(gabaritDe(t.code)).sections) as SectionBrute[];
  const photo = (type: string): PhotoAccueil | null => {
    const s = sections.find((x) => x?.type === type);
    if (!s) return null;
    return { chemin: s.image?.chemin ?? null, portrait: s.image?.chemin_portrait ?? null, alt: s.textes?.image_alt_fr ?? "" };
  };
  return {
    version: Number(t.version),
    logo: typeof t.logo_chemin === "string"
      ? { chemin: t.logo_chemin, ratio: Number(t.logo_ratio) || 5, mode: t.logo_mode === "image" ? "image" : "masque" }
      : null,
    monogramme: typeof t.monogramme_chemin === "string" ? t.monogramme_chemin : null,
    favicon: typeof t.favicon_chemin === "string" ? t.favicon_chemin : null,
    ouverture: photo("hero"),
    recit: photo("editorial"),
  };
}
