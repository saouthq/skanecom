import { supabase } from "./supabase";

/* ============================================================================
   CATALOGUE — lecture, et TOUT ce qui se déduit d'une variante.

   DIMENSIONNEMENT ASSUMÉ (celui d'Iris, migration 02) : des CENTAINES de
   références. Conséquence directe et volontaire : le catalogue publié est
   chargé en une requête, puis filtré, facetté et trié EN MÉMOIRE. Pour 4 ou
   400 produits c'est instantané et le code reste lisible ; au-delà de ~1 000,
   il faudra descendre le filtrage en SQL (vue matérialisée + `in.()` sur les
   variantes). C'est écrit ici pour que le jour venu on sache quoi remplacer.

   ⚠️ AUCUN nombre affiché sur le site n'est écrit à la main : compte de
   modèles, de coloris, de pièces en stock, bornes de prix — tout se calcule
   ici, à partir de la base. Un compte inventé est un mensonge à l'écran.
   ========================================================================== */

export type Categorie = {
  id: string;
  slug: string;
  nom_fr: string;
  nom_ar: string | null;
  description_fr: string | null;
  description_ar: string | null;
  position: number;
};

export type OptionAxe = {
  cle: string;
  label_fr: string;
  label_ar: string | null;
  position: number;
};

export type Variante = {
  id: string;
  sku: string;
  options: Record<string, string>;
  prix_millimes: number;
  stock: number;
  seuil_alerte_stock: number;
  poids_grammes: number | null;
  position: number;
};

export type Image = {
  storage_path: string;
  variante_id: string | null;
  alt_fr: string | null;
  alt_ar: string | null;
  position: number;
};

export type Produit = {
  id: string;
  slug: string;
  nom_fr: string;
  nom_ar: string | null;
  description_fr: string | null;
  description_ar: string | null;
  marque: string | null;
  mis_en_avant: boolean;
  position: number;
  created_at: string;
  meta_titre_fr: string | null;
  meta_description_fr: string | null;
  categorie: Categorie | null;
  options: OptionAxe[];
  variantes: Variante[];
  images: Image[];
};

/* Le prix « barré » (`variantes.prix_barre_millimes`) existe en base mais
   n'est JAMAIS lu ici : la charte interdit toute surface promotionnelle —
   prix barré, compte à rebours, exclamation (interdit n°6). Le champ reste
   disponible pour le backoffice ; la vitrine ne le montre pas. */
const CHAMPS_PRODUIT = `
  id, slug, nom_fr, nom_ar, description_fr, description_ar, marque,
  mis_en_avant, position, created_at, meta_titre_fr, meta_description_fr,
  categorie:categories ( id, slug, nom_fr, nom_ar, description_fr, description_ar, position ),
  options:produit_options ( cle, label_fr, label_ar, position ),
  variantes ( id, sku, options, prix_millimes, stock, seuil_alerte_stock, poids_grammes, position ),
  images:produit_images ( storage_path, variante_id, alt_fr, alt_ar, position )
`;

function ordonne(produits: Produit[]): Produit[] {
  for (const p of produits) {
    p.variantes = (p.variantes ?? []).sort((a, b) => a.position - b.position);
    p.options = (p.options ?? []).sort((a, b) => a.position - b.position);
    p.images = (p.images ?? []).sort((a, b) => a.position - b.position);
  }
  return produits;
}

/** Tout le catalogue visible du public. RLS filtre déjà `publie` et `actif` :
 *  la vitrine ne peut pas afficher un brouillon, même par erreur de requête. */
export async function chargeCatalogue(): Promise<Produit[]> {
  const { data, error } = await supabase
    .from("produits")
    .select(CHAMPS_PRODUIT)
    .order("position", { ascending: true });

  if (error) throw new Error(`Catalogue illisible : ${error.message}`);
  return ordonne((data ?? []) as unknown as Produit[]);
}

export async function chargeProduit(slug: string): Promise<Produit | null> {
  const { data, error } = await supabase
    .from("produits")
    .select(CHAMPS_PRODUIT)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Produit illisible : ${error.message}`);
  return data ? ordonne([data as unknown as Produit])[0] : null;
}

export async function chargeCategories(): Promise<Categorie[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, nom_fr, nom_ar, description_fr, description_ar, position")
    .order("position", { ascending: true });

  if (error) throw new Error(`Catégories illisibles : ${error.message}`);
  return (data ?? []) as Categorie[];
}

/**
 * Recherche plein texte « pauvre » : `ilike` sur nom, marque et description.
 * ⚠️ L'index GIN `produits_recherche_idx` (to_tsvector français) n'est PAS
 * utilisé par `ilike` — PostgREST ne sait pas cibler un index d'EXPRESSION.
 * Sur des centaines de références le balayage est indolore ; le jour où ça
 * compte, la marche à suivre est une colonne générée `recherche tsvector` +
 * `.textSearch()`. Noté pour Iris, pas rustiné ici.
 */
export async function recherche(q: string): Promise<Produit[]> {
  const propre = nettoieRequete(q);
  if (propre.length < 2) return [];

  const motif = `%${propre}%`;
  const { data, error } = await supabase
    .from("produits")
    .select(CHAMPS_PRODUIT)
    .or(`nom_fr.ilike.${motif},marque.ilike.${motif},description_fr.ilike.${motif}`)
    .order("position", { ascending: true });

  if (error) throw new Error(`Recherche impossible : ${error.message}`);
  return ordonne((data ?? []) as unknown as Produit[]);
}

/** La syntaxe `or=` de PostgREST est une grammaire : une virgule, une
 *  parenthèse ou une étoile dans la saisie casserait le filtre — ou pire, le
 *  détournerait. On les retire avant de composer, jamais après. */
export function nettoieRequete(q: string): string {
  return q
    .replace(/[,()*%\\"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/* --------------------------------------------------------------------------
   RÉGLAGES — le code ne fige jamais un choix qui appartient à la gestion
   (principe directeur du PRD). Frais, mode de confirmation, Konnect : tout
   se lit ici.
   -------------------------------------------------------------------------- */

export type Reglages = Record<string, unknown>;

export async function chargeReglages(): Promise<Reglages> {
  const { data, error } = await supabase.from("reglages").select("cle, valeur");
  if (error) throw new Error(`Réglages illisibles : ${error.message}`);

  const table: Reglages = {};
  for (const ligne of data ?? []) table[ligne.cle as string] = ligne.valeur;
  return table;
}

export function reglage<T>(reglages: Reglages, cle: string, defaut: T): T {
  const valeur = reglages[cle];
  return valeur === undefined || valeur === null ? defaut : (valeur as T);
}

export type Zone = {
  nom_fr: string;
  frais_millimes: number;
  delai_jours_min: number;
  delai_jours_max: number;
};

export async function chargeZones(): Promise<Zone[]> {
  const { data, error } = await supabase
    .from("zones_livraison")
    .select("nom_fr, frais_millimes, delai_jours_min, delai_jours_max")
    .order("position", { ascending: true });

  if (error) throw new Error(`Zones de livraison illisibles : ${error.message}`);
  return (data ?? []) as Zone[];
}

/** Le délai annoncé sur la vitrine : l'enveloppe RÉELLE des zones, jamais un
 *  « 48 à 72 h » écrit à la main. Sans zone lisible, on n'annonce rien. */
export function delaiCatalogue(zones: Zone[]): { min: number; max: number } | null {
  if (zones.length === 0) return null;
  return {
    min: Math.min(...zones.map((z) => z.delai_jours_min)),
    max: Math.max(...zones.map((z) => z.delai_jours_max)),
  };
}

/* --------------------------------------------------------------------------
   CE QUI SE DÉDUIT D'UN PRODUIT
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

/** Seuil d'alerte du produit = le plus haut de ses variantes. C'est le
 *  backoffice qui le règle, jamais une constante du code. */
export function seuilProduit(p: Produit): number {
  return p.variantes.reduce((m, v) => Math.max(m, v.seuil_alerte_stock), 0);
}

export function etatProduit(p: Produit): EtatStock {
  const total = stockTotal(p);
  if (total <= 0) return "rupture";
  if (total <= seuilProduit(p)) return "faible";
  return "en-stock";
}

/**
 * Prix affiché = le plus bas des variantes RÉELLEMENT lisibles.
 * On n'utilise volontairement PAS `produits.prix_min_millimes` : c'est un
 * champ d'affichage saisi à la main, il peut dériver de ses variantes (le
 * seed en donne déjà un exemple). Un prix qui ne correspond à rien de
 * commandable est la pire incohérence possible sur une boutique.
 */
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

/** Stock cumulé d'une valeur d'axe : sert à barrer un coloris entièrement
 *  épuisé sans le cacher (le masquer ferait chercher ailleurs — note de Lina). */
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

/** La variante proposée d'emblée : la première EN STOCK, sinon la première.
 *  Ouvrir une fiche sur une déclinaison en rupture donnerait l'impression que
 *  le produit entier est épuisé. */
export function varianteParDefaut(p: Produit): Variante | null {
  return p.variantes.find((v) => v.stock > 0) ?? p.variantes[0] ?? null;
}

export function coloris(p: Produit): string[] {
  return valeursAxe(p, "couleur");
}
