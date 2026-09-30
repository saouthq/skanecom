import { supabase } from "./supabase";

/* ============================================================================
   CATALOGUE — lecture, et tout ce qui se déduit d'une variante.

   Le filtrage, le tri, la pagination et les facettes se font EN BASE
   (public.liste_produits) : la quincaillerie aura des milliers de références,
   on ne charge jamais le catalogue entier. Chaque appel désigne sa boutique ;
   la RLS garantit en plus qu'un visiteur ne voit que du publié, d'une
   boutique active.

   ⚠️ AUCUN nombre affiché n'est écrit à la main : compte de modèles, de
   coloris, de pièces en stock, bornes de prix — tout vient de la base.
   ========================================================================== */

export type Categorie = {
  id: string;
  parent_id: string | null;
  slug: string;
  nom_fr: string | null;
  nom_ar: string | null;
  description_fr?: string | null;
  description_ar?: string | null;
  image_chemin?: string | null;
  position?: number;
  nb_produits?: number;
};

export type OptionAxe = {
  cle: string;
  label_fr: string | null;
  label_ar: string | null;
  /** Une caractéristique filtrable (B9) : son unité et son type. */
  unite?: string | null;
  type?: "texte" | "nombre" | null;
};

/** Une ligne de la fiche technique d'un produit (B9). */
export type Caracteristique = {
  cle: string;
  label_fr: string | null;
  label_ar: string | null;
  unite: string | null;
  type: "texte" | "nombre";
  en_carte: boolean;
  valeur: string;
};


export type Variante = {
  id: string;
  sku: string;
  options: Record<string, string>;
  prix_millimes: number;
  prix_barre_millimes: number | null;
  stock: number;
  seuil_alerte_stock: number;
  poids_grammes: number | null;
  image_chemin: string | null;
  /** La quantité minimale d'une commande (1 = à l'unité ; migration 35). */
  quantite_min?: number;
};

export type Image = {
  chemin: string;
  variante_id: string | null;
  alt_fr: string | null;
  alt_ar: string | null;
};

/** Une ligne de la vue public.vitrine_produits. */
export type Produit = {
  id: string;
  slug: string;
  nom_fr: string | null;
  nom_ar: string | null;
  description_fr: string | null;
  description_ar: string | null;
  marque: string | null;
  mis_en_avant: boolean;
  position: number;
  created_at: string;
  meta_titre_fr: string | null;
  meta_description_fr: string | null;
  categorie: Pick<Categorie, "id" | "parent_id" | "slug" | "nom_fr" | "nom_ar"> | null;
  options: OptionAxe[];
  variantes: Variante[];
  images: Image[];
  caracteristiques: Caracteristique[];
};

export type OptionFacette = { valeur: string; compte: number };

export type Liste = {
  total: number;
  page: number;
  par_page: number;
  produits: Produit[];
  facettes: {
    axes: OptionAxe[];
    options: Record<string, OptionFacette[]>;
    rayons: { slug: string; nom_fr: string | null; nom_ar: string | null; compte: number }[];
    prix: { min: number; max: number } | null;
  };
};

/** Critères tels que les attend public.liste_produits (prix en millimes). */
export type CriteresSql = {
  rayon?: string;
  options?: Record<string, string[]>;
  en_stock?: boolean;
  prix_min?: number;
  prix_max?: number;
  q?: string;
};

export type TriSql = "nouveautes" | "selection" | "prix-asc" | "prix-desc" | "nom" | "pertinence";

export async function listeProduits(
  boutiqueId: string,
  criteres: CriteresSql = {},
  tri: TriSql = "nouveautes",
  page = 1,
  parPage = 24,
): Promise<Liste> {
  const { data, error } = await supabase.rpc("liste_produits", {
    p_boutique_id: boutiqueId,
    p_filtres: criteres,
    p_tri: tri,
    p_page: page,
    p_par_page: parPage,
  });
  if (error) throw new Error(`Catalogue illisible : ${error.message}`);
  return data as Liste;
}

export async function chargeProduit(boutiqueId: string, slug: string): Promise<Produit | null> {
  const { data, error } = await supabase
    .from("vitrine_produits")
    .select("*")
    .eq("boutique_id", boutiqueId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Produit illisible : ${error.message}`);
  return (data as Produit | null) ?? null;
}

/** Slugs et dates de tous les produits publiés, pour le plan du site. */
export async function tousLesSlugs(boutiqueId: string): Promise<{ slug: string; created_at: string }[]> {
  const { data, error } = await supabase
    .from("vitrine_produits")
    .select("slug, created_at")
    .eq("boutique_id", boutiqueId)
    .order("position", { ascending: true })
    .limit(5000);
  if (error) throw new Error(`Plan du site illisible : ${error.message}`);
  return (data ?? []) as { slug: string; created_at: string }[];
}

/* --------------------------------------------------------------------------
   CE QUI SE DÉDUIT D'UN PRODUIT (repris de Maymar)
   -------------------------------------------------------------------------- */

export type EtatStock = "en-stock" | "faible" | "rupture";

export function etatVariante(v: Variante): EtatStock {
  if (v.stock <= 0) return "rupture";
  if (v.stock <= v.seuil_alerte_stock) return "faible";
  return "en-stock";
}

export function stockTotal(p: Produit): number {
  return p.variantes.reduce((somme, v) => somme + Math.max(0, v.stock), 0);
}

/** Seuil d'alerte du produit = le plus haut de ses variantes. */
export function seuilProduit(p: Produit): number {
  return p.variantes.reduce((m, v) => Math.max(m, v.seuil_alerte_stock), 0);
}

export function etatProduit(p: Produit): EtatStock {
  const total = stockTotal(p);
  if (total <= 0) return "rupture";
  if (total <= seuilProduit(p)) return "faible";
  return "en-stock";
}

/** Prix affiché = le plus bas des variantes réellement commandables (jamais
 *  un champ saisi à la main qui pourrait dériver). */
export function prixDepuis(p: Produit): number | null {
  if (p.variantes.length === 0) return null;
  return Math.min(...p.variantes.map((v) => v.prix_millimes));
}

export function prixJusqua(p: Produit): number | null {
  if (p.variantes.length === 0) return null;
  return Math.max(...p.variantes.map((v) => v.prix_millimes));
}

/** Valeurs distinctes d'un axe, dans l'ordre des variantes (donc l'ordre
 *  voulu par le backoffice : Cabine, Moyenne, Grande — jamais l'alphabet). */
export function valeursAxe(p: Produit, cle: string): string[] {
  const vues: string[] = [];
  for (const v of p.variantes) {
    const valeur = v.options?.[cle];
    if (valeur && !vues.includes(valeur)) vues.push(valeur);
  }
  return vues;
}

/** Stock cumulé d'une valeur d'axe : sert à barrer une valeur entièrement
 *  épuisée sans la cacher (la masquer ferait chercher ailleurs). */
export function stockPourValeur(p: Produit, cle: string, valeur: string): number {
  return p.variantes
    .filter((v) => v.options?.[cle] === valeur)
    .reduce((somme, v) => somme + Math.max(0, v.stock), 0);
}

export function trouveVariante(p: Produit, choix: Record<string, string>): Variante | null {
  const cles = p.options.map((o) => o.cle);
  return (
    p.variantes.find((v) => cles.every((c) => (v.options?.[c] ?? "") === (choix[c] ?? ""))) ?? null
  );
}

/** La plus petite quantité qu'on peut commander de cette déclinaison. */
export function minimumVariante(v: Pick<Variante, "quantite_min"> | null | undefined): number {
  const m = v?.quantite_min;
  return typeof m === "number" && Number.isInteger(m) && m > 1 ? m : 1;
}

/** La variante proposée d'emblée : la première EN STOCK, sinon la première. */
export function varianteParDefaut(p: Produit): Variante | null {
  return p.variantes.find((v) => v.stock > 0) ?? p.variantes[0] ?? null;
}

export function coloris(p: Produit): string[] {
  return valeursAxe(p, "couleur");
}
