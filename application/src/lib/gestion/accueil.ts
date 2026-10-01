import type { CodeTheme, Structure, TypeSection } from "@/lib/theme";

/* ============================================================================
   COMPOSER L'ACCUEIL (backoffice, migration 59) — ce qui se partage entre
   l'écran (le composeur, dans le navigateur) et la route qui enregistre :
   la bibliothèque des sections, les champs de chacune, la forme envoyée à
   la base et ses contrôles. Les sections restent dans la forme de la base
   (textes en `_fr`, image en `chemin`) : rien ne se traduit en chemin, et ce
   que l'écran ne sait pas modifier (les textes arabes, la photo posée par la
   console) repart tel quel.
   ========================================================================== */

/** Une section telle que la base la garde, plus une clé locale (`cle`) pour
 *  l'écran — retirée à l'envoi. */
export type SectionBrute = {
  cle?: string;
  type: TypeSection;
  textes?: Record<string, string>;
  image?: { chemin: string; chemin_portrait?: string; detouree?: boolean };
  nombre?: number;
  lien?: string;
  rayon?: string;
  alignement?: "debut" | "fin";
  tri?: "selection" | "nouveautes";
  page?: string;
  /** Le lookbook : ses points sur la photo (en %), vers des pièces. */
  points?: { x: number; y: number; produit: string }[];
  /** La pièce de la saison : son produit. */
  produit?: string;
};

/** Une pièce publiée, à pointer sur le lookbook ou à mettre en avant. */
export type PieceCatalogue = { slug: string; nom: string; image: string | null };

export type AccueilGestion = {
  code: CodeTheme;
  theme: boolean;
  version: number | null;
  sections: SectionBrute[] | null;
  modifie_le: string | null;
  modifie_par: string | null;
  /** `produits` : ses pièces publiées, sous-rayons compris. */
  rayons: { slug: string; nom: string; parent: string | null; produits: number }[];
  pages: { slug: string; titre: string; publie: boolean }[];
  avis: { actif: boolean; montrables: number };
  marques: number;
  produits: number;
  catalogue: PieceCatalogue[];
};

/** Six points au plus sur un lookbook (la base tient la même règle, migration 69). */
export const MAX_POINTS = 6;

export const MAX_SECTIONS = 12;

/** Les photos que le backoffice téléverse (règles de la console : images-marque). */
export type EmplacementAccueil = "ouverture" | "ouverture_portrait" | "recit" | "lookbook";
export const EMPLACEMENTS_ACCUEIL: EmplacementAccueil[] = ["ouverture", "ouverture_portrait", "recit", "lookbook"];

/** Le chemin d'une photo déposée par le backoffice — les seules qu'il
 *  retire du dépôt quand l'accueil ne les emploie plus (jamais une photo de
 *  la console, sous `<boutique>/marque/`, ni du jeu de démo). */
export function CHEMIN_PHOTO_ACCUEIL(slug: string): RegExp {
  return new RegExp(`^${slug.replace(/[^a-z0-9-]/g, "")}/accueil/photo-[a-f0-9]{12}\\.(webp|jpg|png)$`);
}
export const LONGUEUR_TEXTE = 600;

export type ChampTexte = { cle: string; libelle: string; long?: boolean; aide?: string };

type Entree = {
  nom: string;
  /** Ce que la section montre, en une phrase (la bibliothèque). */
  resume: string;
  /** Une fois sur l'accueil, pas deux. */
  unique?: boolean;
  textes: ChampTexte[];
};

const ETIQUETTE: ChampTexte = { cle: "etiquette", libelle: "Surtitre", aide: "Quelques mots au-dessus du titre (facultatif)." };

export const BIBLIOTHEQUE: Record<TypeSection, Entree> = {
  hero: {
    nom: "Ouverture",
    resume: "La grande image du haut de page, votre titre et un bouton.",
    unique: true,
    textes: [ETIQUETTE, { cle: "titre", libelle: "Titre", long: true, aide: "Un retour à la ligne pour couper le titre." }, { cle: "chapo", libelle: "Chapô", long: true }, { cle: "cta", libelle: "Texte du bouton" }],
  },
  rayons: {
    nom: "Rayons",
    resume: "Vos rayons en grandes vignettes, avec le nombre de pièces.",
    unique: true,
    textes: [ETIQUETTE, { cle: "titre", libelle: "Titre" }],
  },
  selection: {
    nom: "Sélection de produits",
    resume: "Une rangée de produits : votre sélection ou les nouveautés, d'un rayon ou de tout le catalogue.",
    textes: [ETIQUETTE, { cle: "titre", libelle: "Titre" }],
  },
  editorial: {
    nom: "Récit",
    resume: "Une image et un texte côte à côte : votre histoire, une matière, un savoir-faire.",
    textes: [ETIQUETTE, { cle: "titre", libelle: "Titre", long: true }, { cle: "texte", libelle: "Texte", long: true }, { cle: "cta", libelle: "Texte du lien" }],
  },
  engagements: {
    nom: "Engagements",
    resume: "Paiement à la livraison, délais, refus possible : tirés de vos réglages.",
    unique: true,
    textes: [],
  },
  texte: {
    nom: "Texte",
    resume: "Un titre et un paragraphe, sans image.",
    textes: [ETIQUETTE, { cle: "titre", libelle: "Titre" }, { cle: "texte", libelle: "Texte", long: true }],
  },
  avis: {
    nom: "Avis clients",
    resume: "Ce que disent vos acheteurs vérifiés (4 et 5 étoiles), avec la pièce reçue et votre note.",
    unique: true,
    textes: [ETIQUETTE, { cle: "titre", libelle: "Titre" }],
  },
  questions: {
    nom: "Questions fréquentes",
    resume: "Les premières questions d'une de vos pages, en accordéon, et le lien vers toutes.",
    textes: [ETIQUETTE, { cle: "titre", libelle: "Titre" }],
  },
  marques: {
    nom: "Marques",
    resume: "Les marques de votre catalogue, chacune vers ses pièces.",
    unique: true,
    textes: [ETIQUETTE, { cle: "titre", libelle: "Titre" }],
  },
  lookbook: {
    nom: "Lookbook",
    resume: "La photo d'un look, et sur elle des points vers les pièces portées : un toucher ouvre la pièce.",
    textes: [ETIQUETTE, { cle: "titre", libelle: "Titre" }],
  },
  piece: {
    nom: "La pièce de la saison",
    resume: "Un produit en grand, achetable depuis l'accueil : ses photos, votre texte, ses tailles.",
    unique: true,
    textes: [ETIQUETTE, { cle: "titre", libelle: "Titre", aide: "Vide : le nom du produit." }, { cle: "texte", libelle: "Texte", long: true, aide: "Vide : la description du produit." }],
  },
};

/** L'ordre de la bibliothèque. */
export const TYPES: TypeSection[] = ["hero", "piece", "selection", "rayons", "editorial", "lookbook", "avis", "questions", "marques", "engagements", "texte"];

/** Les titres que la vitrine montre quand la section n'a pas le sien
 *  (selon la structure : le Bento a ses rayons, sur les textes éditoriaux). */
export function titreParDefaut(type: TypeSection, code: Structure, tri?: string): string {
  switch (type) {
    case "hero": return "Le nom de la boutique";
    case "rayons": return code === "technique" ? "Nos rayons" : code === "bento" ? "Les rayons" : "Les collections";
    case "selection": return tri === "nouveautes" ? "Les nouveautés" : code === "technique" ? "Les références du moment" : "La sélection";
    case "avis": return "Ce qu'en disent nos clients";
    case "questions": return "Vos questions";
    case "marques": return "Les marques";
    case "lookbook": return "Le lookbook";
    case "engagements": return code === "technique" ? "Commander, simplement" : "Nos engagements";
    default: return "";
  }
}

/** Une section neuve, prête à régler. */
export function nouvelleSection(type: TypeSection, cle: string): SectionBrute {
  switch (type) {
    case "selection": return { cle, type, textes: {}, nombre: 8 };
    case "avis": return { cle, type, textes: {}, nombre: 6 };
    case "questions": return { cle, type, textes: {}, nombre: 5 };
    case "lookbook": return { cle, type, textes: {}, points: [] };
    default: return { cle, type, textes: {} };
  }
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LIEN = /^\/[A-Za-z0-9/_=~%.-]*$/;
const CLE_TEXTE = /^[a-z][a-z0-9_]*_(fr|ar)$/;
const CHEMIN = /^[a-z0-9][a-z0-9/_.-]*$/;

/** La forme envoyée à la base : la clé locale retirée, les textes vides
 *  aussi ; null si un élément est illisible (la base refuserait). */
export function versBase(sections: SectionBrute[]): Record<string, unknown>[] | null {
  const sortie: Record<string, unknown>[] = [];
  for (const s of sections) {
    if (!s || !(s.type in BIBLIOTHEQUE)) return null;
    const x: Record<string, unknown> = { type: s.type };
    const textes: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.textes ?? {})) {
      if (!CLE_TEXTE.test(k) || typeof v !== "string") return null;
      const propre = v.replace(/\r\n?/g, "\n").trim();
      if (propre) textes[k] = propre;
    }
    if (Object.keys(textes).length) x.textes = textes;
    if (s.image) {
      if (typeof s.image.chemin !== "string" || !CHEMIN.test(s.image.chemin) || s.image.chemin.includes("..")) return null;
      x.image = {
        chemin: s.image.chemin,
        ...(typeof s.image.chemin_portrait === "string" && CHEMIN.test(s.image.chemin_portrait) && !s.image.chemin_portrait.includes("..") ? { chemin_portrait: s.image.chemin_portrait } : {}),
        ...(s.image.detouree === true ? { detouree: true } : {}),
      };
    }
    if (s.nombre !== undefined) {
      if (!Number.isInteger(s.nombre) || s.nombre < 1 || s.nombre > 24) return null;
      x.nombre = s.nombre;
    }
    if (s.lien !== undefined && s.lien !== "") {
      if (!LIEN.test(s.lien) || s.lien.startsWith("//") || s.lien.includes("..")) return null;
      x.lien = s.lien;
    }
    if (s.rayon !== undefined && s.rayon !== "") {
      if (s.type !== "selection" || !SLUG.test(s.rayon)) return null;
      x.rayon = s.rayon;
    }
    if (s.alignement !== undefined) {
      if (s.type !== "hero" || (s.alignement !== "debut" && s.alignement !== "fin")) return null;
      if (s.alignement === "fin") x.alignement = "fin";
    }
    if (s.tri !== undefined) {
      if (s.type !== "selection" || (s.tri !== "selection" && s.tri !== "nouveautes")) return null;
      if (s.tri === "nouveautes") x.tri = "nouveautes";
    }
    if (s.page !== undefined && s.page !== "") {
      if (s.type !== "questions" || !SLUG.test(s.page) || s.page.length > 60) return null;
      x.page = s.page;
    }
    if (s.points !== undefined) {
      if (s.type !== "lookbook" || !Array.isArray(s.points) || s.points.length > MAX_POINTS) return null;
      const points = [];
      for (const p of s.points) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100 || !SLUG.test(p.produit)) return null;
        // Au dixième de pour cent : assez pour poser un point, sans bruit.
        points.push({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, produit: p.produit });
      }
      if (points.length) x.points = points;
    }
    if (s.produit !== undefined && s.produit !== "") {
      if (s.type !== "piece" || !SLUG.test(s.produit)) return null;
      x.produit = s.produit;
    }
    sortie.push(x);
  }
  return sortie;
}

/** Ce qui empêche d'enregistrer, section par section (par sa clé locale). */
export function problemesAccueil(sections: SectionBrute[]): { general?: string; parSection: Record<string, string> } {
  const parSection: Record<string, string> = {};
  for (const s of sections) {
    const long = Object.entries(s.textes ?? {}).find(([, v]) => v.trim().length > LONGUEUR_TEXTE);
    if (long && s.cle) parSection[s.cle] = `Un texte dépasse ${LONGUEUR_TEXTE} caractères : raccourcissez-le.`;
  }
  if (sections.length === 0) return { general: "L'accueil garde une section au moins.", parSection };
  if (sections.length > MAX_SECTIONS) return { general: `${MAX_SECTIONS} sections au plus.`, parSection };
  return { parSection };
}

/** Pourquoi la vitrine ne montrera PAS une section (rien à y mettre), ou null. */
export function sectionMasquee(s: SectionBrute, a: Pick<AccueilGestion, "code" | "rayons" | "pages" | "avis" | "marques" | "produits" | "catalogue">): string | null {
  // La vitrine ne montre que les rayons qui ont des pièces.
  const garnis = a.rayons.filter((r) => !r.parent && r.produits > 0).length;
  switch (s.type) {
    case "rayons":
      if (a.code === "editorial" && garnis <= 1) return `Masquée : il faut deux rayons qui ont des produits publiés (${garnis} aujourd'hui).`;
      return a.rayons.some((r) => r.produits > 0) ? null : "Masquée : aucun rayon n'a encore de produit publié.";
    case "avis":
      if (!a.avis.actif) return "Masquée : le module des avis n'est pas actif.";
      return a.avis.montrables < 2 ? `Masquée : il faut deux avis publiés de 4 ou 5 étoiles avec un texte (${a.avis.montrables} aujourd'hui).` : null;
    case "questions": {
      const publiees = a.pages.filter((p) => p.publie);
      if (s.page) return publiees.some((p) => p.slug === s.page) ? null : "Masquée : cette page de questions n'est pas publiée.";
      return publiees.length ? null : "Masquée : aucune page de questions publiée (écran Pages).";
    }
    case "marques":
      return a.marques < 2 ? `Masquée : il faut deux marques au moins dans le catalogue (${a.marques} aujourd'hui).` : null;
    case "editorial":
    case "texte":
      return !Object.entries(s.textes ?? {}).some(([k, v]) => (k.startsWith("titre_") || k.startsWith("texte_")) && v.trim()) ? "Masquée tant qu'elle n'a ni titre ni texte." : null;
    case "lookbook":
      if (!s.image) return "Masquée tant qu'elle n'a pas de photo.";
      return (s.points ?? []).some((p) => a.catalogue.some((c) => c.slug === p.produit)) ? null : "La photo paraît seule : posez un point sur une pièce portée.";
    case "piece":
      if (!s.produit) return "Masquée tant qu'aucune pièce n'est choisie.";
      return a.catalogue.some((c) => c.slug === s.produit) ? null : "Masquée : cette pièce n'est plus publiée.";
    case "selection": {
      if (a.produits === 0) return "Aucun produit publié : la vitrine dit « Le catalogue arrive » (une fois).";
      const rayon = s.rayon ? a.rayons.find((r) => r.slug === s.rayon) : null;
      return rayon && rayon.produits === 0 ? `Masquée : le rayon « ${rayon.nom} » n'a pas encore de produit publié.` : null;
    }
    default:
      return null;
  }
}

/** Le message à l'équipe pour un refus de la base. */
export function messageAccueil(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Seuls le propriétaire et l'administrateur composent l'accueil.";
    case "version":
      return "L'accueil a été modifié entre-temps par quelqu'un d'autre : rechargez la page pour repartir de sa version.";
    case "vide":
      return "L'accueil garde une section au moins.";
    case "theme":
      return "La boutique n'a pas encore de thème : la console le pose à sa mise en place.";
    case "section":
      return `Une section n'a pas été acceptée (${message.replace(/^themes\.sections : /, "")}).`;
    default:
      return message;
  }
}
