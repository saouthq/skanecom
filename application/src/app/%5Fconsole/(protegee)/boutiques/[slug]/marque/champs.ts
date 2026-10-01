import { POLICES_INFO, type JetonCouleur, type Police } from "@/lib/theme";

/* Ce que le formulaire de marque règle, partagé par la page, l'éditeur et
   le gestionnaire d'enregistrement. */

export const GROUPES_COULEURS: { titre: string; jetons: { cle: JetonCouleur; libelle: string }[] }[] = [
  { titre: "Fonds", jetons: [
    { cle: "fond", libelle: "Fond de page" }, { cle: "surface", libelle: "Cartes et champs" }, { cle: "surface_2", libelle: "Fond secondaire" }] },
  { titre: "Texte", jetons: [{ cle: "encre", libelle: "Texte et pied de page" }, { cle: "encre_doux", libelle: "Texte secondaire" }] },
  { titre: "Accent", jetons: [{ cle: "accent", libelle: "Accent (liens, repères)" }, { cle: "accent_clair", libelle: "Accent clair" }] },
  { titre: "Filets", jetons: [
    { cle: "filet", libelle: "Filets" }, { cle: "filet_fort", libelle: "Filets marqués" }, { cle: "contour_champ", libelle: "Contour des champs" }] },
  { titre: "États", jetons: [{ cle: "succes", libelle: "En stock" }, { cle: "erreur", libelle: "Erreur" }, { cle: "alerte", libelle: "Stock faible" }] },
];

// Les familles servies (lib/theme.ts), avec leur caractère.
export const POLICES: { valeur: Police; libelle: string; texte: boolean }[] = POLICES_INFO.map((p) => ({
  valeur: p.valeur, libelle: `${p.nom} — ${p.caractere}`, texte: p.texte,
}));

export const POLICES_TITRES = POLICES;
export const POLICES_TEXTE = POLICES.filter((p) => p.texte);

export const TEXTES_MARQUE: { cle: string; libelle: string; aide: string; long?: boolean; max: number }[] = [
  { cle: "resume_fr", libelle: "Présentation courte", aide: "Pied de page et partages. Deux phrases.", long: true, max: 300 },
  { cle: "seo_titre_fr", libelle: "Titre pour Google", aide: "Titre de l'accueil dans les résultats de recherche. Vide = le nom de la boutique.", max: 70 },
  { cle: "seo_description_fr", libelle: "Description pour Google", aide: "Une phrase sous le titre, dans les résultats de recherche.", long: true, max: 160 },
  { cle: "origine_fr", libelle: "Ville", aide: "« Expédié depuis … », en bas de page.", max: 60 },
  { cle: "politique_retour_fr", libelle: "Échanges et retours", aide: "Ce que la boutique accepte après la livraison.", long: true, max: 400 },
];
