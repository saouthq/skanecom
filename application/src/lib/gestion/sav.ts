/* ============================================================================
   LE SERVICE APRÈS-VENTE — les mots du backoffice et de la vitrine pour une
   demande (…_sav.sql) : ses étapes, comment elle s'est close.
   ========================================================================== */

export type StatutSav = "nouvelle" | "en_cours" | "resolue" | "refusee";

export const ETAPES_SAV = [
  { cle: "nouvelles", libelle: "Nouvelles", vide: "Aucune demande en attente : tout le monde a été rappelé." },
  { cle: "en_cours", libelle: "En cours", vide: "Aucune demande en cours de traitement." },
  { cle: "closes", libelle: "Closes", vide: "Aucune demande close pour le moment." },
] as const;

export type EtapeSav = (typeof ETAPES_SAV)[number]["cle"];

export const LIBELLES_STATUT_SAV: Record<StatutSav, string> = {
  nouvelle: "Nouvelle",
  en_cours: "En cours",
  resolue: "Résolue",
  refusee: "Refusée",
};

/** Comment une demande est résolue. */
export const ISSUES_RESOLUE: Record<string, string> = {
  reparation: "Réparé",
  echange: "Échangé",
  remboursement: "Remboursé",
  conseil: "Conseil donné",
  autre: "Autre",
};

/** Pourquoi une demande est refusée. */
export const ISSUES_REFUS: Record<string, string> = {
  hors_garantie: "Hors garantie",
  mauvaise_utilisation: "Mauvaise utilisation",
  non_constate: "Défaut non constaté",
  autre: "Autre",
};

export function libelleIssue(statut: string, issue: string | null): string | null {
  if (!issue) return null;
  return (statut === "refusee" ? ISSUES_REFUS : ISSUES_RESOLUE)[issue] ?? issue;
}

export function etapeSavDe(statut: string): EtapeSav {
  return statut === "nouvelle" ? "nouvelles" : statut === "en_cours" ? "en_cours" : "closes";
}

/** Le message WhatsApp prêt à envoyer au client, au sujet de sa demande. */
export function messageSav(c: { prenom: string; boutique: string; numero: string; produit: string }): string {
  return `Bonjour ${c.prenom}, c'est ${c.boutique} au sujet de votre demande ${c.numero} (${c.produit}). `
    + "Pouvez-vous nous envoyer une photo du problème, et nous dire quand vous êtes disponible ?";
}

/** Le texte d'une erreur de la base, pour l'équipe. */
export function erreurSav(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Votre rôle ne permet pas ce geste : la lecture seule ne traite pas les demandes.";
    case "etape":
      return "La demande a changé entre-temps (un collègue a agi) : la fiche est à jour, relisez-la.";
    default:
      return message;
  }
}
