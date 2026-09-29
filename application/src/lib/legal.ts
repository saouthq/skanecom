import type { Cadre } from "./boutique";

/* ============================================================================
   LES PAGES LÉGALES — ce que chaque boutique publie (PRD V8) : mentions
   légales, conditions de vente, politique de confidentialité. Un modèle
   commun, rempli par les réglages « legal.* » de la boutique
   (supabase/migrations/…_vitrine_legal.sql) et par ses réglages de commande
   et de livraison : les pages disent ce que fait VRAIMENT la boutique.

   MODELE_LEGAL : la version du modèle, gardée sur chaque commande avec
   l'accord de l'acheteur (private.modele_legal() en base : les deux
   changent ensemble).

   Modèle proposé par SkanEcom : chaque boutique le fait relire par son
   conseil avant d'ouvrir (docs/cadrage/04-risques-et-decisions.md, D10).
   ========================================================================== */

export const MODELE_LEGAL = "2026-09-29";

export const PAGES_LEGALES = [
  { chemin: "/conditions-de-vente", titre: "Conditions de vente" },
  { chemin: "/mentions-legales", titre: "Mentions légales" },
  { chemin: "/confidentialite", titre: "Confidentialité" },
] as const;

export type IdentiteLegale = {
  nom: string;
  raisonSociale: string | null;
  forme: string | null;
  adresse: string | null;
  rne: string | null;
  matriculeFiscal: string | null;
  email: string | null;
  telephone: string | null;
  whatsapp: string | null;
  retractationJours: number;
  retourOffert: boolean;
  inpdp: string | null;
};

function texte(reglages: Record<string, unknown>, cle: string): string | null {
  const v = reglages[cle];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function identiteLegale(cadre: Cadre): IdentiteLegale {
  const r = cadre.reglages;
  const jours = Number(r["legal.retractation_jours"] ?? 10);
  return {
    nom: cadre.boutique.nom,
    raisonSociale: texte(r, "legal.raison_sociale"),
    forme: texte(r, "legal.forme_juridique"),
    adresse: texte(r, "legal.adresse"),
    rne: texte(r, "legal.identifiant_rne"),
    matriculeFiscal: texte(r, "legal.matricule_fiscal"),
    email: texte(r, "legal.email"),
    telephone: texte(r, "contact.telephone"),
    whatsapp: cadre.whatsapp,
    retractationJours: Number.isFinite(jours) && jours >= 10 ? jours : 10,
    retourOffert: r["legal.retour_frais"] === "boutique",
    inpdp: texte(r, "legal.inpdp_reference"),
  };
}

/** Les champs de l'identité légale qui manquent encore (pour le backoffice). */
export const CHAMPS_LEGAUX = [
  { cle: "legal.raison_sociale", libelle: "raison sociale" },
  { cle: "legal.adresse", libelle: "adresse" },
  { cle: "legal.identifiant_rne", libelle: "identifiant RNE" },
  { cle: "legal.matricule_fiscal", libelle: "matricule fiscal" },
  { cle: "legal.email", libelle: "adresse électronique" },
] as const;

/** « +216 71 234 567 » pour un numéro enregistré en « 21671234567 ». */
export function numeroLisible(n: string): string {
  const huit = n.replace(/\D/g, "").replace(/^216(?=\d{8}$)/, "");
  return /^\d{8}$/.test(huit) ? `+216 ${huit.slice(0, 2)} ${huit.slice(2, 5)} ${huit.slice(5)}` : n;
}

/** Les moyens de joindre la boutique, en une phrase : « par courriel à …,
 *  par téléphone au …, ou sur WhatsApp au … ». */
export function moyensDeContact(id: IdentiteLegale): string {
  const moyens = [
    id.email ? `par courriel à ${id.email}` : null,
    id.telephone ? `par téléphone au ${numeroLisible(id.telephone)}` : null,
    id.whatsapp ? `sur WhatsApp au ${numeroLisible(id.whatsapp)}` : null,
  ].filter((m): m is string => m !== null);
  if (moyens.length === 0) return "par les coordonnées indiquées dans les mentions légales";
  if (moyens.length === 1) return moyens[0];
  return `${moyens.slice(0, -1).join(", ")} ou ${moyens[moyens.length - 1]}`;
}

/** « 29 septembre 2026 » */
export function dateLisible(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Tunis" }).format(new Date(iso));
}
