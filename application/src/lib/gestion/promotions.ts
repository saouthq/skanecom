import type { Role } from "@/lib/console/session";
import { formateMontant } from "@/lib/prix";

/* ============================================================================
   LES PROMOTIONS AU BACKOFFICE (module promotions) — les codes promo et les
   prix barrés d'un rayon : types, libellés et phrases des écrans
   (supabase/migrations/…_promotions.sql, …_soldes.sql).
   ========================================================================== */

export type TypeCode = "pourcentage" | "montant" | "livraison";
export type EtatCode = "actif" | "programme" | "termine" | "epuise" | "coupe";

export type CodePromo = {
  id: string;
  code: string;
  type: TypeCode;
  valeur: number | null;
  minimum_millimes: number;
  debut: string | null;
  fin: string | null;
  /** Les jours de l'écran (heure de Tunis) : le premier, le dernier inclus. */
  debut_jour: string | null;
  fin_jour: string | null;
  limite_utilisations: number | null;
  une_fois_par_client: boolean;
  actif: boolean;
  etat: EtatCode;
  note: string | null;
  utilisations: number;
  remises_millimes: number;
  ventes_millimes: number;
  encaisse_millimes: number;
  derniere_utilisation: string | null;
  a_servi: boolean;
  cree_le: string;
  cree_par: string | null;
};

export type ListeCodes = {
  actif: boolean;
  compteurs: { vivants: number; termines: number; utilisations: number; remises_millimes: number; ventes_millimes: number };
  codes: CodePromo[];
};

/** Qui crée, règle, coupe et retire un code : c'est un prix. */
export const PEUT_PROMOUVOIR: Role[] = ["proprietaire", "admin"];

export const TYPES_CODE: { cle: TypeCode; libelle: string; aide: string }[] = [
  { cle: "pourcentage", libelle: "Un pourcentage", aide: "Sur les articles : −10 % sur 200 TND, 20 TND de moins." },
  { cle: "montant", libelle: "Un montant", aide: "En dinars, jamais plus que les articles." },
  { cle: "livraison", libelle: "La livraison offerte", aide: "Les frais de livraison s'effacent (à domicile)." },
];

export const ETATS_CODE: Record<EtatCode, { libelle: string; classe: string }> = {
  actif: { libelle: "Actif", classe: "ui-etat ui-etat-point ui-etat-vert" },
  programme: { libelle: "Programmé", classe: "ui-etat ui-etat-point ui-etat-bleu" },
  epuise: { libelle: "Épuisé", classe: "ui-etat ui-etat-point ui-etat-ambre" },
  termine: { libelle: "Terminé", classe: "ui-etat" },
  coupe: { libelle: "Coupé", classe: "ui-etat" },
};

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const JOUR_AN = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** « 12 octobre » (l'année si ce n'est pas celle de `maintenant`). Le jour
 *  vient de la base en AAAA-MM-JJ (heure de Tunis) : lu tel quel, en UTC. */
export function jourLisible(jour: string, maintenant: Date): string {
  const d = new Date(`${jour}T12:00:00Z`);
  return (d.getUTCFullYear() === maintenant.getUTCFullYear() ? JOUR : JOUR_AN).format(d);
}

/** Ce que le code offre, en grand : « −10 % », « −20 TND », « Livraison offerte ». */
export function offreDe(c: Pick<CodePromo, "type" | "valeur">): string {
  if (c.type === "pourcentage") return `−${c.valeur} %`;
  if (c.type === "montant") return `−${formateMontant(c.valeur ?? 0)} TND`;
  return "Livraison offerte";
}

/** Ses conditions, dans l'ordre où l'acheteur les rencontre. */
export function conditionsDe(c: CodePromo, maintenant: Date): string[] {
  const out: string[] = [];
  if (c.minimum_millimes > 0) out.push(`dès ${formateMontant(c.minimum_millimes)} TND d'achat`);
  if (c.une_fois_par_client) out.push("une fois par client");
  if (c.debut_jour && c.fin_jour) out.push(`du ${jourLisible(c.debut_jour, maintenant)} au ${jourLisible(c.fin_jour, maintenant)}`);
  else if (c.fin_jour) out.push(`jusqu'au ${jourLisible(c.fin_jour, maintenant)}`);
  else if (c.debut_jour) out.push(`à partir du ${jourLisible(c.debut_jour, maintenant)}`);
  if (c.limite_utilisations) out.push(`${c.limite_utilisations.toLocaleString("fr-FR")} utilisation${c.limite_utilisations > 1 ? "s" : ""} au plus`);
  if (out.length === 0) out.push("sans condition");
  return out;
}

/** Le message à partager (WhatsApp, story) : le code, ce qu'il offre, où. */
export function messagePartage(c: CodePromo, boutique: string, adresse: string | null, maintenant: Date): string {
  const offre = c.type === "livraison" ? "la livraison offerte" : `${offreDe(c).replace("−", "-")} sur votre commande`;
  const conditions = [
    c.minimum_millimes > 0 ? `dès ${formateMontant(c.minimum_millimes)} TND d'achat` : null,
    c.fin_jour ? `jusqu'au ${jourLisible(c.fin_jour, maintenant)}` : null,
  ].filter(Boolean);
  return `${boutique} : ${offre} avec le code ${c.code}${conditions.length ? ` (${conditions.join(", ")})` : ""}.${adresse ? ` ${adresse}` : ""}`;
}

export function messagePromotions(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Votre rôle dans l'équipe ne permet pas ce geste : un code promo est un prix, il revient à la direction.";
    case "module":
      return "Les codes promo ne sont pas ouverts pour cette boutique : ils s'activent depuis la console SkanEcom.";
    case "introuvable":
      return "Ce code n'existe plus dans cette boutique.";
    default:
      return message;
  }
}

/* ---------------------------------------------------------------------------
   LES PRIX BARRÉS D'UN RAYON (…_soldes.sql) — une opération baisse d'un coup
   les prix d'un rayon, l'ancien prix barré ; terminée, elle les rend.
   ------------------------------------------------------------------------- */

export type OperationPrix = {
  id: string;
  nom: string;
  pourcentage: number;
  statut: "en_cours" | "terminees";
  rayon: { id: string; nom: string; slug: string; sous_rayons: number } | null;
  lancees_le: string;
  terminees_le: string | null;
  lancees_par: string | null;
  terminees_par: string | null;
  declinaisons: number;
  produits: number;
  /** Terminée : les déclinaisons dont l'équipe avait changé le prix, gardé tel quel. */
  gardees: number;
  vendues: number;
  ventes_millimes: number;
};

export type EcranPrixBarres = {
  actif: boolean;
  /** Le réglage catalogue.afficher_prix_barres : la vitrine montre-t-elle l'ancien prix ? */
  prix_barres: boolean;
  rayons: { id: string; nom: string; declinaisons: number }[];
  /** Les déclinaisons en vente dans tout le catalogue. */
  declinaisons: number;
  soldes: OperationPrix[];
};

export type ApercuPrix = {
  declinaisons: number;
  deja_soldees: number;
  produits: number;
  exemples: { avant: number; apres: number }[];
};

/** « 1 déclinaison », « 12 déclinaisons ». */
export function pluriel(n: number, un: string, plusieurs = `${un}s`): string {
  return `${n.toLocaleString("fr-FR")} ${n > 1 ? plusieurs : un}`;
}

export function messagePrixBarres(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Votre rôle dans l'équipe ne permet pas ce geste : des prix barrés sont des prix, ils reviennent à la direction.";
    case "module":
      return "Les promotions ne sont pas ouvertes pour cette boutique : elles s'activent depuis la console SkanEcom.";
    case "introuvable":
      return "Cette opération n'existe plus dans cette boutique.";
    case "etat":
      return "Cette opération est déjà terminée : ses prix ont été rendus.";
    default:
      return message;
  }
}
