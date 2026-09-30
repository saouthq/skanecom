import { millimes } from "@/lib/console/import";
import { formateMontant } from "@/lib/prix";

/* ============================================================================
   LES RÉGLAGES DE LA BOUTIQUE AU BACKOFFICE — types, champs de chaque
   section, et lecture des formulaires (supabase/migrations/…_gestion_reglages.sql).
   ========================================================================== */

export type Reglage = {
  cle: string;
  valeur: unknown;
  defaut: unknown;
  personnalise: boolean;
  type: "booleen" | "entier" | "texte" | "choix" | "liste" | "objet";
  choix: string[] | null;
  groupe: string;
  module: string | null;
  module_actif: boolean;
  modifiable: boolean;
  libelle: string;
  description: string | null;
  modifie_le: string | null;
  modifie_par: string | null;
};

export type Zone = {
  id: string;
  nom: string;
  frais: number;
  delai_min: number | null;
  delai_max: number | null;
  actif: boolean;
  gouvernorats: number;
};

export type EtatReglages = {
  reglages: Reglage[];
  zones: Zone[];
  /** Le supplément selon le poids : jusqu'à N grammes (null : au-delà). */
  tranches: { id: string; jusqu_a_grammes: number | null; supplement: number }[];
  gouvernorats: { code: string; nom: string; zone_id: string | null }[];
  journal: { le: string; action: string; cible: string | null; avant: Record<string, unknown> | null; apres: Record<string, unknown> | null; auteur: string | null }[];
};

/** Comment un champ de formulaire devient une valeur de réglage. */
type Genre = "booleen" | "choix" | "entier" | "montant" | "texte" | "numero";

/** Les champs de chaque section de l'écran, dans l'ordre. */
export const SECTIONS: Record<string, { cle: string; genre: Genre }[]> = {
  commandes: [
    { cle: "compte.obligatoire", genre: "booleen" },
    { cle: "compte.verification", genre: "choix" },
    { cle: "commande.mode_confirmation", genre: "choix" },
    { cle: "commande.achat_express", genre: "booleen" },
    { cle: "commande.max_en_attente", genre: "entier" },
  ],
  livraison: [
    { cle: "livraison.mode_frais", genre: "choix" },
    { cle: "livraison.frais_fixes_millimes", genre: "montant" },
    { cle: "livraison.seuil_gratuite_millimes", genre: "montant" },
    { cle: "livraison.transporteur", genre: "texte" },
    { cle: "livraison.supplement_poids", genre: "booleen" },
  ],
  retrait: [
    { cle: "retrait.adresse", genre: "texte" },
    { cle: "retrait.ville", genre: "texte" },
    { cle: "retrait.horaires", genre: "texte" },
    { cle: "retrait.delai_heures", genre: "entier" },
  ],
  paiement: [
    { cle: "paiement.cod_actif", genre: "booleen" },
    { cle: "paiement.konnect_actif", genre: "booleen" },
  ],
  vitrine: [
    { cle: "catalogue.afficher_prix_barres", genre: "booleen" },
    { cle: "contact.whatsapp", genre: "numero" },
    { cle: "contact.telephone", genre: "numero" },
    { cle: "catalogue.revendeur_officiel", genre: "texte" },
  ],
  sav: [
    { cle: "sav.garantie_mois", genre: "entier" },
  ],
  avis: [
    { cle: "avis.moderation", genre: "choix" },
  ],
  legal: [
    { cle: "legal.raison_sociale", genre: "texte" },
    { cle: "legal.forme_juridique", genre: "texte" },
    { cle: "legal.adresse", genre: "texte" },
    { cle: "legal.identifiant_rne", genre: "texte" },
    { cle: "legal.matricule_fiscal", genre: "texte" },
    { cle: "legal.email", genre: "texte" },
    { cle: "legal.retractation_jours", genre: "entier" },
    { cle: "legal.retour_frais", genre: "choix" },
    { cle: "legal.inpdp_reference", genre: "texte" },
  ],
};

export const TITRES_SECTIONS: Record<string, string> = {
  commandes: "Commandes",
  livraison: "Livraison",
  retrait: "Retrait en magasin",
  sav: "Service après-vente",
  paiement: "Paiement",
  vitrine: "Vitrine et contact",
  legal: "Informations légales",
};

/** « 21 612 345 » → « 21621612345 » : chiffres seuls, indicatif tunisien
 *  ajouté à un numéro à 8 chiffres ; vide reste vide. */
export function numeroInternational(texte: string): string {
  let n = texte.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.length === 8) n = `216${n}`;
  return n;
}

/** Les valeurs d'une section, lues dans son formulaire. Une case à cocher
 *  absente vaut « non » (le formulaire porte `champ.<cle>` pour dire qu'elle
 *  y était). Rend un message si une saisie est illisible. */
export function valeursDe(section: string, f: FormData, modulesActifs: (cle: string) => boolean): Record<string, unknown> | string {
  const champs = SECTIONS[section];
  if (!champs) return "Section inconnue.";
  const valeurs: Record<string, unknown> = {};
  for (const { cle, genre } of champs) {
    if (!f.has(cle) && !f.has(`champ.${cle}`)) continue;
    if (!modulesActifs(cle)) continue;
    const brut = String(f.get(cle) ?? "").trim();
    switch (genre) {
      case "booleen":
        valeurs[cle] = brut === "1";
        break;
      case "choix":
        valeurs[cle] = brut;
        break;
      case "entier": {
        const n = Number.parseInt(brut || "0", 10);
        if (!Number.isFinite(n) || n < 0) return "Nombre illisible.";
        valeurs[cle] = n;
        break;
      }
      case "montant": {
        const m = millimes(brut);
        if (m !== null && Number.isNaN(m)) return "Montant illisible : écrivez par exemple 7,000.";
        valeurs[cle] = m ?? 0;
        break;
      }
      case "numero":
        valeurs[cle] = numeroInternational(brut);
        break;
      default:
        valeurs[cle] = brut;
    }
  }
  return valeurs;
}

/** Le montant d'un réglage en millimes, pour un champ (« 7,000 »). */
export function montantChamp(v: unknown): string {
  const n = Number(v ?? 0);
  return n > 0 ? formateMontant(n) : "";
}

/* ---- Le journal : ce qui a changé, en mots ---- */

const LIBELLES_COURTS: Record<string, string> = {
  "compte.obligatoire": "Compte client",
  "compte.verification": "Code de connexion",
  "commande.mode_confirmation": "Confirmation",
  "commande.max_en_attente": "Commandes en attente par numéro",
  "commande.achat_express": "Achat express",
  "livraison.mode_frais": "Frais de livraison",
  "livraison.frais_fixes_millimes": "Tarif de livraison",
  "livraison.seuil_gratuite_millimes": "Livraison offerte dès",
  "livraison.transporteur": "Transporteur",
  "livraison.supplement_poids": "Supplément au poids",
  "paiement.cod_actif": "Paiement à la livraison",
  "paiement.konnect_actif": "Paiement en ligne",
  "catalogue.afficher_prix_barres": "Prix barrés",
  "catalogue.revendeur_officiel": "Revendeur officiel",
  "sav.garantie_mois": "Garantie annoncée",
  "avis.moderation": "Publication des avis",
  "contact.whatsapp": "WhatsApp",
  "contact.telephone": "Téléphone",
  "legal.raison_sociale": "Raison sociale",
  "legal.forme_juridique": "Forme juridique",
  "legal.adresse": "Adresse du siège",
  "legal.identifiant_rne": "Identifiant RNE",
  "legal.matricule_fiscal": "Matricule fiscal",
  "legal.email": "Courriel",
  "legal.retractation_jours": "Rétractation",
  "legal.retour_frais": "Frais de retour",
  "legal.inpdp_reference": "Déclaration INPDP",
};

function lisible(cle: string, v: unknown): string {
  if (cle === "compte.obligatoire") return v ? "obligatoire" : "invité possible";
  if (cle === "compte.verification") return v === "sms" ? "par SMS" : v === "email" ? "par e-mail" : "SMS ou e-mail, au choix";
  if (cle === "commande.mode_confirmation") return v === "automatique" ? "automatique" : "par téléphone";
  if (cle === "livraison.mode_frais") return v === "zone" ? "par zone" : "même tarif partout";
  if (cle === "livraison.seuil_gratuite_millimes") return Number(v) > 0 ? `${formateMontant(Number(v))} TND` : "jamais";
  if (cle.endsWith("_millimes")) return `${formateMontant(Number(v ?? 0))} TND`;
  if (cle === "commande.max_en_attente") return Number(v) > 0 ? String(v) : "sans limite";
  if (cle === "legal.retractation_jours") return `${v} jours ouvrables`;
  if (cle === "sav.garantie_mois") return Number(v) > 0 ? `${v} mois` : "aucune durée";
  if (cle === "legal.retour_frais") return v === "boutique" ? "offerts par la boutique" : "à la charge du client";
  if (typeof v === "boolean") return v ? "oui" : "non";
  return v === "" || v === null || v === undefined ? "vide" : String(v);
}

/** « jusqu'à 5 kg », « au-delà » : une tranche de poids, en mots. */
export function libelleTranche(jusquA: number | null | undefined): string {
  return jusquA === null || jusquA === undefined ? "au-delà" : `jusqu'à ${kilos(jusquA)}`;
}

/** 5000 → « 5 kg » ; 2500 → « 2,5 kg ». */
export function kilos(grammes: number): string {
  return `${kilosChamp(grammes)} kg`;
}

/** 2500 → « 2,5 », pour un champ en kilos. */
export function kilosChamp(grammes: number | null | undefined): string {
  return grammes === null || grammes === undefined ? "" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3, useGrouping: false }).format(grammes / 1000);
}

/** Un poids saisi en kilos : « 2,5 » → 2500 g ; vide → null ; illisible → NaN. */
export function grammesSaisis(texte: string): number | null {
  const t = texte.replace(/\s|kg/gi, "").replace(",", ".");
  if (!t) return null;
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return Number.NaN;
  return Math.round(Number(t) * 1000);
}

/** Une ligne du journal en phrases courtes : « Compte client : obligatoire → invité possible ». */
export function lignesJournal(e: EtatReglages["journal"][number], zones: Map<string, string>, gouvernorats: Map<string, string>): string[] {
  switch (e.action) {
    case "reglages.modifier":
      return Object.keys(e.apres ?? {}).map(
        (cle) => `${LIBELLES_COURTS[cle] ?? cle} : ${lisible(cle, e.avant?.[cle])} → ${lisible(cle, e.apres?.[cle])}`,
      );
    case "reglages.zone":
      return [e.avant ? `Zone « ${e.cible} » modifiée` : `Zone « ${e.cible} » créée, ${formateMontant(Number(e.apres?.frais ?? 0))} TND`];
    case "reglages.zone_supprimee":
      return [`Zone « ${e.cible} » supprimée`];
    case "reglages.tranche_poids":
      return [`${e.avant ? "Tranche modifiée" : "Tranche ajoutée"} : ${libelleTranche(e.apres?.jusqu_a_grammes as number | null)}, + ${formateMontant(Number(e.apres?.supplement ?? 0))} TND`];
    case "reglages.tranche_poids_supprimee":
      return [`Tranche supprimée : ${libelleTranche(e.avant?.jusqu_a_grammes as number | null)}`];
    case "reglages.gouvernorats":
      return Object.keys(e.apres ?? {}).map((code) => {
        const z = e.apres?.[code] as string | null;
        return `${gouvernorats.get(code) ?? code} → ${z ? (zones.get(z) ?? "une zone supprimée") : "tarif fixe"}`;
      });
    default:
      return [e.action];
  }
}

/** Le message à l'équipe pour un refus de la base. */
export function messageReglages(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Seuls le propriétaire et l'administrateur changent les réglages.";
    case "module":
      return "Ce réglage dépend d'un module que la boutique n'a pas encore : demandez-le à SkanEcom.";
    case "trop":
      return "Douze tranches au plus : regroupez-en.";
    default:
      return message;
  }
}
