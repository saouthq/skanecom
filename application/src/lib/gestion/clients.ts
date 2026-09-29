import type { Role } from "@/lib/console/session";

/* ============================================================================
   LES CLIENTS AU BACKOFFICE — types, libellés et petits outils des écrans
   (supabase/migrations/…_gestion_clients.sql).
   ========================================================================== */

export const FILTRES_CLIENTS = [
  { cle: "tous", libelle: "Tous", vide: "Aucun client pour le moment : ils arrivent avec les premières commandes." },
  { cle: "fideles", libelle: "Fidèles", vide: "Aucun client n'a encore été livré deux fois." },
  { cle: "refus", libelle: "Avec refus", vide: "Aucun client n'a refusé de colis." },
  { cle: "surveilles", libelle: "Surveillés", vide: "Aucun client surveillé." },
  { cle: "bloques", libelle: "Bloqués", vide: "Aucun client bloqué." },
] as const;
export type FiltreClients = (typeof FILTRES_CLIENTS)[number]["cle"];

export type LigneClient = {
  id: string;
  nom: string | null;
  telephone: string;
  email: string | null;
  compte: boolean;
  nb_commandes: number;
  nb_refus: number;
  livrees: number;
  encaisse: number;
  niveau_risque: Confiance;
  derniere_commande: string | null;
  depuis: string;
};

export type ListeClients = {
  filtre: FiltreClients;
  total: number;
  compteurs: Record<FiltreClients, number>;
  clients: LigneClient[];
};

export type Confiance = "normal" | "surveille" | "bloque";

export type FicheClient = {
  id: string;
  nom: string | null;
  telephone: string;
  email: string | null;
  compte: boolean;
  nb_commandes: number;
  nb_refus: number;
  niveau_risque: Confiance;
  note_interne: string | null;
  depuis: string;
  chiffres: { livrees: number; refusees: number; annulees: number; en_cours: number; encaisse: number };
  commandes: { numero: string; statut: string; cree_le: string; total_millimes: number; refus_origine: string | null; ville: string | null; articles: number }[];
  adresses: { nom: string; telephone: string; ligne1: string; ligne2: string | null; ville: string; gouvernorat: string; code_postal: string | null; par_defaut: boolean }[];
  livraisons: { ligne1: string; ville: string | null; gouvernorat: string | null; fois: number; derniere: string }[];
  journal: { le: string; avant: { niveau: Confiance } | null; apres: { niveau: Confiance; motif: string | null } | null; auteur: string | null }[];
};

export const NIVEAUX: { cle: Confiance; libelle: string; aide: string }[] = [
  { cle: "normal", libelle: "Normal", aide: "Ses commandes suivent le chemin habituel." },
  { cle: "surveille", libelle: "Surveillé", aide: "Il commande, mais ses commandes s'affichent signalées à l'appel." },
  { cle: "bloque", libelle: "Bloqué", aide: "La boutique en ligne refuse ses commandes, par son compte comme par son numéro." },
];

export const LIBELLES_CONFIANCE: Record<Confiance, string> = { normal: "Normal", surveille: "Surveillé", bloque: "Bloqué" };

/** Qui règle la confiance et écrit la note : la relation client. */
export const PEUT_JUGER: Role[] = ["proprietaire", "admin", "confirmateur"];

/** La pastille de confiance d'un client (rien pour « normal »). */
export function pastilleConfiance(n: Confiance): { texte: string; classe: string } | null {
  if (n === "bloque") return { texte: "Bloqué", classe: "ui-etat ui-etat-point ui-etat-rouge" };
  if (n === "surveille") return { texte: "Surveillé", classe: "ui-etat ui-etat-point ui-etat-ambre" };
  return null;
}

/** Le taux de refus d'un client, en mots : « 1 refus sur 3 livraisons tentées ». */
export function tauxRefus(refus: number, livrees: number): string | null {
  const tentees = refus + livrees;
  if (tentees === 0) return null;
  return `${refus} refus sur ${tentees} livraison${tentees > 1 ? "s" : ""} tentée${tentees > 1 ? "s" : ""}`;
}

export function messageClients(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Votre rôle dans l'équipe ne permet pas ce geste : la confiance d'un client revient à la relation client.";
    case "client":
      return "Ce client n'existe pas dans cette boutique.";
    default:
      return message;
  }
}
