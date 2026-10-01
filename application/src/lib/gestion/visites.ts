/* ============================================================================
   LES VISITES DE LA VITRINE (migrations 53 et 56) — ce que rendent
   public.gestion_visites et gestion_visites_parcours, et les mots pour les
   lire : le nom d'une source, d'une page, d'une étape, d'une campagne.
   ========================================================================== */

export type ResumeVisites = {
  visiteurs: number;
  vues: number;
  commandes: number;
  pages_par_visite: number | null;
  conversion: number | null;
};

export type Visites = {
  actif: boolean;
  du: string;
  au: string;
  courante: ResumeVisites;
  precedente: ResumeVisites;
  par_jour: { jour: string; visiteurs: number; vues: number; commandes: number }[];
  pages: { chemin: string; vues: number; nom: string | null }[];
  produits: { slug: string; nom: string; vues: number }[];
  sources: { source: string | null; visiteurs: number }[];
  appareils: { telephone: number; tablette: number; ordinateur: number };
  entrees: { chemin: string; visiteurs: number }[];
};

// Un site d'où l'on vient (« instagram.com »), ou le mot d'un lien de
// campagne (utm_source=instagram, migration 56).
const SOURCES: [RegExp, string][] = [
  [/(^|\.)instagram(\.com)?$/, "Instagram"],
  [/(^|\.)(facebook(\.com)?|fb\.me|fb\.com|fb)$/, "Facebook"],
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)tiktok(\.com)?$/, "TikTok"],
  [/^(email|e-mail|lettre|newsletter)$/, "E-mail"],
  [/^sms$/, "SMS"],
  [/^affiche$/, "Affiche, flyer"],
  [/(^|\.)(bing\.com)$/, "Bing"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X (Twitter)"],
  [/(^|\.)linktr\.ee$/, "Linktree"],
  [/(^|\.)(wa\.me|whatsapp(\.com)?)$/, "WhatsApp"],
];

/** « instagram.com » → « Instagram » ; sans source : l'accès direct. */
export function nomSource(source: string | null): string {
  if (!source) return "Direct ou lien partagé";
  return SOURCES.find(([motif]) => motif.test(source))?.[1] ?? source.replace(/^www\./, "");
}

/** « /categorie/robes » → « Rayon : Robes » (le nom que donne la base, sinon
 *  l'adresse) ; « / » → « Accueil ». */
export function nomPage(chemin: string, nom: string | null = null): string {
  if (chemin === "/") return "Accueil";
  if (nom && chemin.startsWith("/produit/")) return nom;
  if (nom && chemin.startsWith("/categorie/")) return `Rayon : ${nom}`;
  const [, genre, reste] = /^\/([^/]+)\/?(.*)$/.exec(chemin) ?? [];
  const lisible = (s: string) => decodeURIComponent(s).replace(/-/g, " ");
  switch (genre) {
    case "categorie": return `Rayon ${lisible(reste)}`;
    case "produit": return `Fiche ${lisible(reste)}`;
    case "catalogue": return "Tout le catalogue";
    case "recherche": return "Recherche";
    case "commande": return reste === "merci" ? "Commande passée (merci)" : "Commande (tunnel)";
    case "panier": return "Panier repris";
    case "compte": return "Mon compte";
    case "favoris": return "Mes favoris";
    case "suivi": return "Suivi de commande";
    default: return lisible(chemin.slice(1));
  }
}

/** Ce que rend public.gestion_visites_parcours (migration 56). */
export type Parcours = {
  entonnoir: { visiteurs: number; fiche: number; panier: number; commande: number; commandee: number };
  campagnes: { campagne: string; source: string | null; visiteurs: number; panier: number; commandes: number; premier: string; dernier: string }[];
};

/** Les étapes de l'entonnoir, dans l'ordre. */
export const ETAPES = [
  { cle: "visiteurs", nom: "Visiteurs" },
  { cle: "fiche", nom: "Ont vu une fiche" },
  { cle: "panier", nom: "Ont ajouté au panier" },
  { cle: "commande", nom: "Ont ouvert la commande" },
  { cle: "commandee", nom: "Ont commandé" },
] as const;

/** Où l'on publie un lien de campagne : la valeur d'utm_source, et son nom. */
export const SUPPORTS = [
  { cle: "instagram", nom: "Instagram" },
  { cle: "facebook", nom: "Facebook" },
  { cle: "tiktok", nom: "TikTok" },
  { cle: "whatsapp", nom: "WhatsApp" },
  { cle: "email", nom: "E-mail, lettre" },
  { cle: "sms", nom: "SMS" },
  { cle: "affiche", nom: "Affiche, flyer (code QR)" },
] as const;

/** « Soldes d'Été 2026 ! » → « soldes-d-ete-2026 » : le mot qu'écrit la base
 *  (private.mot_campagne), pour le montrer avant de copier le lien. */
export function motCampagne(texte: string): string {
  return texte
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60).replace(/-+$/g, "");
}

/** L'étape où l'on perd le plus de monde (la part qui s'arrête là). */
export function plusGrandePerte(e: Parcours["entonnoir"]): { de: string; a: string; part: number } | null {
  let pire: { de: string; a: string; part: number } | null = null;
  for (let i = 1; i < ETAPES.length; i++) {
    const avant = e[ETAPES[i - 1].cle];
    if (avant < 10) continue;
    const part = 1 - e[ETAPES[i].cle] / avant;
    if (!pire || part > pire.part) pire = { de: ETAPES[i - 1].nom, a: ETAPES[i].nom, part };
  }
  return pire;
}
