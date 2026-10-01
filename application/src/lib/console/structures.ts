import type { Structure } from "@/lib/theme";

/* ============================================================================
   LES STRUCTURES D'UNE VITRINE, telles que la console les présente : à la
   création d'une boutique (son choix) et dans la galerie des modèles (une
   boutique de démonstration chacune). L'ordre est celui du choix.
   ========================================================================== */

export const STRUCTURES_CONSOLE: { code: Structure; aide: string; pour: string }[] = [
  { code: "editorial", aide: "Mode, bagages, maroquinerie : grandes images, typographie de magazine.",
    pour: "La marque d'abord : de grandes photos, des titres de magazine, les pièces en grille aérée." },
  { code: "bento", aide: "Maison, beauté, marques jeunes : une mosaïque de tuiles, coins ronds.",
    pour: "L'accueil en mosaïque : l'ouverture, la pièce à la une et la note des clients côte à côte, les rayons en tuiles." },
  { code: "immersif", aide: "Mode, luxe : la photo plein écran, les pièces qui glissent, le lookbook.",
    pour: "La photo plein écran, l'en-tête posé dessus, les collections qui glissent, le lookbook aux points sur les pièces." },
  { code: "technique", aide: "Outillage, quincaillerie, grands catalogues : recherche, références, stock chiffré.",
    pour: "Les grands catalogues : filtres permanents, références, stock chiffré, prix TTC et ajout direct." },
  { code: "commerce", aide: "High-tech, électroménager : la recherche d'abord, le grand menu, la comparaison.",
    pour: "La recherche d'abord, le grand menu des rayons, la comparaison, la barre d'onglets au téléphone." },
  { code: "monoproduit", aide: "Une pièce vendue par la publicité : sa page de vente, la commande sur la page.",
    pour: "Une pièce vendue par la publicité : sa page de vente, les offres par quantité, la commande sur la page." },
];
