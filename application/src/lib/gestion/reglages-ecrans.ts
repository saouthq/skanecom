import type { NomIcone } from "@/components/console/Icone";

/* ============================================================================
   LES ÉCRANS DES RÉGLAGES — une page d'accueil (une tuile par thème, ce qui
   est réglé aujourd'hui en une ligne), puis une page par thème. Avant : une
   seule page de neuf mille pixels et quatorze boutons « Enregistrer ».

   Une section d'enregistrement (commandes, zones, sav…) appartient à un thème ;
   l'enregistrement revient sur la page de ce thème, à la hauteur de la section.
   ========================================================================== */

export type Groupe =
  | "commandes" | "livraison" | "paiement" | "vitrine" | "contact"
  | "service" | "publicite" | "legal" | "donnees" | "journal";

export const GROUPES: { cle: Groupe; titre: string; icone: NomIcone; description: string }[] = [
  { cle: "commandes", titre: "Commandes", icone: "commandes", description: "Qui peut commander, le code de connexion, la confirmation." },
  { cle: "livraison", titre: "Livraison", icone: "camion", description: "Tarifs, zones, gouvernorats, poids, retrait en magasin." },
  { cle: "paiement", titre: "Paiement", icone: "billet", description: "Comment l'acheteur règle sa commande." },
  { cle: "vitrine", titre: "Fonctions de la vitrine", icone: "boutique", description: "Prix barrés, favoris, précommandes, lettre, partage…" },
  { cle: "contact", titre: "Contact et réseaux", icone: "message", description: "WhatsApp, téléphone, horaires, Instagram, Facebook, TikTok." },
  { cle: "service", titre: "Service client", icone: "outil", description: "La garantie annoncée et les avis des clients." },
  { cle: "publicite", titre: "Publicité", icone: "graphique", description: "Les pixels Meta et TikTok de vos campagnes." },
  { cle: "legal", titre: "Informations légales", icone: "fichier", description: "L'identité de la boutique, pour ses pages légales." },
  { cle: "donnees", titre: "Vos données", icone: "importer", description: "Tout ce que la boutique a enregistré, dans un tableur." },
  { cle: "journal", titre: "Journal", icone: "journal", description: "Chaque changement, avec son auteur et son heure." },
];

const SECTION_GROUPE: Record<string, Groupe> = {
  commandes: "commandes",
  livraison: "livraison", zones: "livraison", gouvernorats: "livraison", poids: "livraison", retrait: "livraison",
  paiement: "paiement", konnect: "paiement",
  vitrine: "vitrine",
  contact: "contact",
  sav: "service", avis: "service",
  publicite: "publicite",
  legal: "legal",
  donnees: "donnees",
  journal: "journal",
};

/** Le thème d'une section (« zones » → « livraison ») ; inconnue : l'accueil. */
export function groupeDe(section: string): Groupe | null {
  return SECTION_GROUPE[section.replace(/^t-/, "")] ?? null;
}

/** L'adresse d'une section des réglages : la page de son thème, à sa hauteur. */
export function lienReglages(slug: string, section: string): string {
  const groupe = groupeDe(section);
  if (!groupe) return `/gestion/${slug}/reglages`;
  return `/gestion/${slug}/reglages/${groupe}${section === groupe ? "" : `#t-${section}`}`;
}
