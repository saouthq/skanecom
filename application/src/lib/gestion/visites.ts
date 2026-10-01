/* ============================================================================
   LES VISITES DE LA VITRINE (migration 53) — ce que rend
   public.gestion_visites, et les mots pour le lire : le nom d'une source,
   d'une page.
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

const SOURCES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(facebook\.com|fb\.me|fb\.com)$/, "Facebook"],
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(bing\.com)$/, "Bing"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X (Twitter)"],
  [/(^|\.)linktr\.ee$/, "Linktree"],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, "WhatsApp"],
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
