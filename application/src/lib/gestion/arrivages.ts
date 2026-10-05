/* ============================================================================
   LES ARRIVAGES ANNONCÉS — ce que rend public.gestion_arrivages, et les mots
   des refus de gestion_enregistrer_arrivage, gestion_recevoir_arrivage et
   gestion_annuler_arrivage (…_precommandes.sql, migration 88).

   Un arrivage annoncé (un conteneur, un camion) dit ce qui va arriver et
   quand : avec le réglage catalogue.precommandes, ses déclinaisons épuisées
   se précommandent sur la vitrine, dans la limite de ce qu'il apporte. À la
   réception, les précommandes sont servies d'abord, dans l'ordre des
   commandes.
   ========================================================================== */

export type LigneArrivage = {
  variante_id: string;
  sku: string;
  produit: string;
  libelle: string | null;
  quantite: number;
  stock: number;
  /** Précommandé sur cet arrivage et pas encore servi. */
  precommandees: number;
};

export type Arrivage = {
  id: string;
  nom: string;
  date_prevue: string;
  note: string | null;
  statut: "attendu" | "recu" | "annule";
  recu_le: string | null;
  cree_le: string;
  lignes: LigneArrivage[];
  /** Les commandes qui l'attendent encore. */
  commandes: number;
};

export type EcranArrivages = {
  /** Le réglage catalogue.precommandes. */
  actif: boolean;
  arrivages: Arrivage[];
  /** Toutes les commandes qui attendent un arrivage. */
  en_attente: number;
};

export type ReceptionArrivage = { nom: string; pieces: number; declinaisons: number; servies: string[]; en_attente: number };

const MESSAGES: Record<string, string> = {
  role: "Seuls le propriétaire, l'administrateur et la préparation annoncent et reçoivent les arrivages.",
  nom: "Le nom de l'arrivage : de 2 à 60 caractères (« Conteneur d'octobre »).",
  date: "La date prévue : aujourd'hui ou plus tard, dans l'année qui vient.",
  note: "La note est trop longue (300 caractères).",
  lignes: "Indiquez au moins une déclinaison et la quantité attendue.",
  quantite: "Une quantité est illisible : un nombre entier de pièces, de 1 à 100 000.",
  variante: "Une déclinaison a été retirée de la vente entre-temps : la liste est à jour.",
  double: "Une déclinaison apparaît deux fois.",
  introuvable: "Cet arrivage n'existe pas (ou plus) dans la boutique.",
  etat: "Cet arrivage est déjà reçu ou annulé.",
  commentaire: "La note est trop longue (300 caractères).",
};

export function messageArrivage(indice: string | undefined, message: string): string {
  return (indice && MESSAGES[indice]) || message || "L'arrivage n'a pas pu être enregistré.";
}

const JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Tunis" });
const JOUR_COURT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Africa/Tunis" });

/** « jeudi 17 octobre » : une date sans heure (AAAA-MM-JJ). */
export function jourArrivage(date: string): string {
  return JOUR.format(new Date(`${date.slice(0, 10)}T12:00:00`));
}

/** « 17 oct. » : la même, pour une pastille. */
export function jourArrivageCourt(date: string): string {
  return JOUR_COURT.format(new Date(`${date.slice(0, 10)}T12:00:00`));
}

/** Dans combien de jours (0 = aujourd'hui, négatif = en retard), à Tunis. */
export function joursAvant(date: string, maintenant: Date = new Date()): number {
  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(maintenant);
  return Math.round((Date.parse(`${date.slice(0, 10)}T00:00:00Z`) - Date.parse(`${aujourdhui}T00:00:00Z`)) / 86_400_000);
}
