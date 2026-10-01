/* ============================================================================
   COLORIS PRODUIT — la SEULE exception à « aucune couleur en dur ».

   Ces hexadécimaux ne sont pas des jetons de marque : ce sont les couleurs des
   MARCHANDISES (un noir de valise, un bordeaux de coque). La charte l'exige
   même : « la marque est une charpente, la couleur vient des produits »
   (§3). Changer l'habillage du site ne doit RIEN changer ici, et
   réciproquement — d'où ce fichier à part, hors des composants.

   Les noms sont ceux saisis dans `variantes.options.couleur` par le
   backoffice. Un coloris inconnu ne casse rien : il rend une pastille neutre,
   et le NOM reste affiché à côté — la couleur seule ne porte jamais le sens
   (charte §6).
   ========================================================================== */

const COLORIS: Record<string, string> = {
  noir: "#1B1B1D",
  blanc: "#F4F1EA",
  gris: "#8A8D91",
  "gris anthracite": "#3C4046",
  "bleu marine": "#1F3A5F",
  bleu: "#2C5C8A",
  bordeaux: "#6E1F2E",
  rouge: "#9E2B25",
  champagne: "#D9C39A",
  beige: "#D9C9B0",
  camel: "#A5754A",
  cognac: "#8A5A2B",
  marron: "#5A3A22",
  "vert olive": "#5A6340",
  vert: "#3E6B4B",
  jaune: "#E8A413",
  orange: "#D2732B",
  turquoise: "#2E8B96",
  rose: "#C98A96",
  violet: "#5B4470",
  argent: "#B9BCC0",
  or: "#B08D4F",
  terracotta: "#B4553A",
  "écru": "#EEE7D7",
  sable: "#D8C6A5",
  "gris perle": "#CBC9C4",
  "gris chiné": "#9B9B97",
  "rose poudré": "#E3B8B3",
  "vichy noir": "#4A4A4A",
  "noir fleuri": "#2A2A30",
  fauve: "#B07A45",
  "bleu ciel": "#A9C6E3",
  grenat: "#7A1F2B",
  nude: "#D9A88F",
  corail: "#E2725B",
};

/** Pastille neutre quand le coloris n'est pas encore cartographié : jamais un
 *  aplat criard qui mentirait sur la marchandise. */
const INCONNU = "#C9BCA6";

export function couleurDeColoris(nom: string): string {
  return COLORIS[nom.trim().toLowerCase()] ?? INCONNU;
}

/** Vrai si le coloris est cartographié — utile pour décider d'afficher une
 *  pastille ou seulement le nom. */
export function colorisConnu(nom: string): boolean {
  return nom.trim().toLowerCase() in COLORIS;
}
