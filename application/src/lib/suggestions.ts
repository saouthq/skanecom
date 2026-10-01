/** Une pièce proposée pendant la frappe (recherche/suggestions/route.ts,
 *  components/ChampRecherche.tsx). Prix en millimes. */
export type Suggestion = {
  slug: string;
  nom: string;
  marque: string | null;
  reference: string | null;
  prix: number;
  plusieursPrix: boolean;
  photo: string | null;
};
export type ReponseSuggestions = { total: number; produits: Suggestion[] };

/** Un produit du rail « Vus récemment » (recherche/vus/route.ts,
 *  components/VusRecemment.tsx) : ses déclinaisons portent les prix (en
 *  millimes), d'où le prix « dès » — pro pour un pro connecté. */
export type ProduitVu = {
  id: string;
  slug: string;
  nom: string;
  marque: string | null;
  photo: string | null;
  etat: "en-stock" | "faible" | "rupture";
  variantes: { id: string; prix_millimes: number }[];
  /** Sa seule déclinaison, en stock : elle s'ajoute au panier sans ouvrir la
   *  fiche (rien à choisir). Absente s'il y a une taille ou une couleur à
   *  choisir, ou plus assez de stock. */
  unique?: { id: string; sku: string; stock: number; prix_millimes: number; quantite_min: number; image: string | null; libelle: string };
};
export type ReponseVus = { produits: ProduitVu[] };
