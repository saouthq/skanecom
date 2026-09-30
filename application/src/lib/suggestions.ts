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
