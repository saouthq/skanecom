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
};
export type ReponseVus = { produits: ProduitVu[] };
