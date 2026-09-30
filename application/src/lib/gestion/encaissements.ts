/* ============================================================================
   L'ARGENT DES LIVREURS (B12, 2e partie) — ce que rend
   public.gestion_encaissements, et les mots des refus de
   public.gestion_enregistrer_versement (…_encaissements.sql).
   ========================================================================== */

export type ColisARecevoir = {
  numero: string;
  client: string;
  ville: string | null;
  total_millimes: number;
  livree_le: string | null;
  suivi: string | null;
};

export type GroupeARecevoir = {
  transporteur: string | null;
  nombre: number;
  total_millimes: number;
  plus_ancienne: string | null;
  commandes: ColisARecevoir[];
};

export type Versement = {
  id: string;
  transporteur: string | null;
  recu_le: string;
  attendu_millimes: number;
  recu_millimes: number;
  ecart_millimes: number;
  reference: string | null;
  note: string | null;
  numeros: string[];
  auteur: string | null;
  cree_le: string;
  annule_le: string | null;
  annule_par: string | null;
};

export type Encaissements = {
  a_recevoir: GroupeARecevoir[];
  versements: Versement[];
  trente_jours: { nombre: number; recu_millimes: number; ecart_millimes: number };
};

/** Qui enregistre et annule un versement (la base revérifie). */
export const TRESORERIE = ["proprietaire", "admin"];

/** Le nom d'un livreur, ou ce qu'on dit quand il n'a pas été saisi. */
export function nomTransporteur(t: string | null): string {
  return t ?? "Transporteur non précisé";
}

/** Les jours écoulés depuis une date (au moins 0). */
export function joursDepuis(iso: string | null, maintenant = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((maintenant - new Date(iso).getTime()) / 86_400_000));
}

const MESSAGES: Record<string, string> = {
  role: "Seuls le propriétaire et l'administrateur enregistrent l'argent reçu.",
  commandes: "Cochez les colis que couvre ce versement.",
  montant: "Le montant reçu est illisible.",
  date: "La date du versement ne peut être ni dans le futur, ni il y a plus d'un an.",
  deja: "Un de ces colis a déjà été rapproché entre-temps : la liste est à jour.",
  transporteur: "Un de ces colis est passé par un autre livreur.",
  commande: "Un de ces colis n'est plus à recevoir : la liste est à jour.",
  versement: "Ce versement a déjà été annulé.",
  texte: "La référence (80 caractères) ou la note (500) est trop longue.",
};

export function messageEncaissement(indice: string | undefined, message: string): string {
  return (indice && MESSAGES[indice]) || message || "L'enregistrement a échoué.";
}
