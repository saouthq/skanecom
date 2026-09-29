import { formatePrix } from "@/lib/prix";

/* ============================================================================
   LE BACKOFFICE DES BOUTIQUES — ses libellés et ses petits outils.

   Outil de SkanEcom, en français (comme la console) : les mots du métier
   du paiement à la livraison, tels que l'équipe d'une boutique les dit.
   ========================================================================== */

export const LIBELLES_ROLE: Record<string, string> = {
  proprietaire: "Propriétaire",
  admin: "Administrateur",
  confirmateur: "Confirmation",
  preparateur: "Préparation",
  lecture: "Lecture seule",
};

export const LIBELLES_STATUT: Record<string, string> = {
  a_arbitrer: "À vérifier",
  recue: "À confirmer",
  confirmee: "Confirmée",
  expediee: "Expédiée",
  livree: "Livrée",
  refusee: "Refusée",
  annulee: "Annulée",
};

/** Les étapes de la liste, dans l'ordre du travail. */
export const ETAPES = [
  { cle: "a_confirmer", libelle: "À confirmer", vide: "Aucune commande à confirmer. Les nouvelles commandes arrivent ici." },
  { cle: "a_preparer", libelle: "À préparer", vide: "Aucune commande confirmée en attente de préparation." },
  { cle: "expediees", libelle: "Expédiées", vide: "Aucune commande chez le livreur." },
  { cle: "cloturees", libelle: "Clôturées", vide: "Les commandes livrées, refusées ou annulées se retrouvent ici." },
  { cle: "toutes", libelle: "Toutes", vide: "Aucune commande pour le moment." },
] as const;

export type Etape = (typeof ETAPES)[number]["cle"];

export const LIBELLES_ORIGINE_REFUS: Record<string, string> = {
  client: "Le client a refusé le colis",
  livreur: "Problème du livreur",
  injoignable: "Client injoignable à la livraison",
  autre: "Autre raison",
};

export const LIBELLES_RESULTAT: Record<string, string> = {
  confirmee: "Confirmée",
  injoignable: "Injoignable",
  rappeler: "À rappeler",
  refus: "Refus du client",
};

export const LIBELLES_CANAL: Record<string, string> = {
  appel: "Appel",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Africa/Tunis" });
const JOUR_CLE = new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Tunis" });

/** « à 14:02 » aujourd'hui, « hier à 09:15 », « 27 sept. à 18:40 » ensuite
 *  — à l'heure de Tunis. */
export function quand(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  const jour = JOUR_CLE.format(d);
  if (jour === JOUR_CLE.format(maintenant)) return `aujourd'hui à ${HEURE.format(d)}`;
  if (jour === JOUR_CLE.format(new Date(maintenant.getTime() - 86_400_000))) return `hier à ${HEURE.format(d)}`;
  return `${JOUR.format(d)} à ${HEURE.format(d)}`;
}

/** « il y a 12 min », « il y a 3 h », « il y a 2 j » : l'âge d'une commande
 *  qui attend, pour servir la plus ancienne d'abord. */
export function age(iso: string, maintenant = new Date()): string {
  const minutes = Math.max(0, Math.round((maintenant.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} j`;
}

/** « +21655666777 » → « +216 55 666 777 ». */
export function telephoneLisible(numero: string): string {
  const huit = numero.replace(/\D/g, "").replace(/^216(?=\d{8}$)/, "");
  return /^\d{8}$/.test(huit) ? `+216 ${huit.slice(0, 2)} ${huit.slice(2, 5)} ${huit.slice(5)}` : numero;
}

export function lienAppel(numero: string): string {
  return `tel:${numero.replace(/[^\d+]/g, "")}`;
}

/** Le message WhatsApp de confirmation, prêt à envoyer. */
export function lienWhatsApp(numero: string, texte: string): string {
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(texte)}`;
}

export function messageConfirmation(c: {
  prenom: string;
  boutique: string;
  numero: string;
  totalMillimes: number;
  articles: number;
  ville: string;
}): string {
  return (
    `Bonjour ${c.prenom}, ici ${c.boutique}. Nous avons bien reçu votre commande ${c.numero} ` +
    `(${c.articles} article${c.articles > 1 ? "s" : ""}, ${formatePrix(c.totalMillimes)} à régler à la livraison). ` +
    `Pouvez-vous nous confirmer la livraison à ${c.ville} ? Merci.`
  );
}

/** Les refus de la base (indice HINT), dits pour l'équipe. */
export function messageRefus(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Votre rôle dans l'équipe ne permet pas ce geste.";
    case "change":
      // Le message de la base nomme le statut technique ; l'équipe, elle,
      // a besoin de savoir qu'un collègue vient d'agir.
      return "La commande a changé entre-temps : quelqu'un vient d'agir dessus. La fiche est à jour, vérifiez avant de recommencer.";
    case "commande":
      return "Cette commande n'existe pas dans cette boutique.";
    default:
      return message;
  }
}
