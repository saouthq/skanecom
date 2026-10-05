import type { NomIcone } from "@/components/console/Icone";
import type { Magasin } from "@/lib/commande";
import type { Role } from "@/lib/console/session";

/* ============================================================================
   SAISIR UNE COMMANDE — ce que rendent public.gestion_saisie,
   gestion_saisie_client et gestion_chiffrer_saisie, les canaux d'où vient
   une commande saisie par l'équipe, et les mots des refus de
   public.gestion_saisir_commande (…_saisie_commande.sql).
   ========================================================================== */

/** Qui saisit (la base revérifie) ; la direction seule ajuste le prix. */
export const PEUT_SAISIR: Role[] = ["proprietaire", "admin", "confirmateur"];

export const CANAUX: { cle: string; libelle: string; par: string; icone: NomIcone }[] = [
  { cle: "telephone", libelle: "Téléphone", par: "par téléphone", icone: "telephone" },
  { cle: "whatsapp", libelle: "WhatsApp", par: "sur WhatsApp", icone: "message" },
  { cle: "instagram", libelle: "Instagram", par: "sur Instagram", icone: "message" },
  { cle: "facebook", libelle: "Facebook", par: "sur Facebook", icone: "message" },
  { cle: "tiktok", libelle: "TikTok", par: "sur TikTok", icone: "message" },
  { cle: "magasin", libelle: "Au magasin", par: "au magasin", icone: "boutique" },
  { cle: "autre", libelle: "Autre", par: "hors de la vitrine", icone: "commandes" },
];

export const canal = (cle: string | null | undefined) => CANAUX.find((c) => c.cle === cle);

export type DeclinaisonSaisie = {
  id: string;
  sku: string;
  libelle: string | null;
  stock: number;
  prix_millimes: number;
  quantite_min: number;
  image: string | null;
};
export type ProduitSaisie = { id: string; nom: string; marque: string | null; image: string | null; variantes: DeclinaisonSaisie[] };
export type Saisie = { direction: boolean; retrait: Magasin | null; produits: ProduitSaisie[] };

export type ClientSaisi = {
  connu: boolean;
  telephone: string;
  id?: string;
  nom?: string | null;
  email?: string | null;
  compte?: boolean;
  nb_commandes?: number;
  nb_refus?: number;
  niveau_risque?: "normal" | "surveille" | "bloque";
  pro?: string | null;
  adresse?: { ligne1: string; ligne2: string | null; ville: string; gouvernorat: string; code_postal: string | null } | null;
};

export type LigneChiffree = {
  variante_id: string;
  disponible: boolean;
  quantite: number;
  quantite_disponible: number;
  quantite_min: number | null;
  prix_unitaire_millimes: number | null;
  prix_public_millimes: number | null;
  palier: number | null;
  total_ligne_millimes: number | null;
};
export type Chiffrage = {
  lignes: LigneChiffree[];
  complet: boolean;
  sous_total_millimes: number;
  frais_boutique_millimes: number | null;
  frais_livraison_millimes: number | null;
  livraison_offerte: boolean | null;
  remise_millimes: number;
  total_millimes: number | null;
  tarif: "public" | "pro" | "devis";
  zone: { nom_fr: string | null } | null;
  supplement_poids_millimes: number;
};

const MESSAGES: Record<string, string> = {
  role: "Seuls le propriétaire, l'administrateur et l'employé des appels saisissent une commande.",
  ajustement: "Seule la direction (propriétaire, administrateur) accorde une remise ou offre la livraison.",
  remise: "La remise est illisible, ou plus grande que le prix des articles.",
  canal: "Dites d'où vient la commande : téléphone, WhatsApp, Instagram…",
  telephone: "Le numéro du client : 8 chiffres, un numéro tunisien.",
  nom: "Le nom du client (2 caractères au moins).",
  email: "L'adresse e-mail est illisible.",
  adresse: "L'adresse de livraison : la rue et le numéro.",
  ville: "La ville ou la délégation.",
  gouvernorat: "Choisissez le gouvernorat : il fait les frais de livraison.",
  code_postal: "Le code postal compte 4 chiffres.",
  retrait: "Cette boutique ne propose pas le retrait au magasin.",
  panier: "Ajoutez au moins un article.",
  stock: "Un article n'est plus disponible dans la quantité demandée : la liste est à jour.",
  total: "Un prix a changé pendant la saisie : le total est à jour, vérifiez-le avec le client avant d'enregistrer.",
  note: "La note compte 500 caractères au plus.",
  cle: "La saisie a expiré : rechargez la page.",
};

export function messageSaisie(indice: string | undefined, message: string): string {
  return (indice && MESSAGES[indice]) || message || "La commande n'a pas pu être enregistrée.";
}
