/* ============================================================================
   LA CONSOMMATION — ce que rend public.console_consommation (migration
   …_console_consommation), et ce qu'on en dit : où en est chaque boutique
   de son quota, la fin du mois au rythme actuel, ce que coûterait le
   dépassement si la formule a un prix unitaire.
   ========================================================================== */

export type Canal = "email" | "sms";
export type Nature = "code" | "commande" | "equipe" | "lettre" | "essai" | "autre";

export type ConsoCanal = {
  envoyes: number;
  refuses: number;
  par_nature: Partial<Record<Nature, number>>;
  dernier_le: string | null;
  /** Le quota du mois (exception ou formule, plus les crédits) ; null : pas de limite fixée. */
  quota: number | null;
  credits: number;
  /** Les six derniers mois, du plus ancien au mois lu. */
  historique: number[];
};

export type Credit = { id: number; canal: Canal; quantite: number; motif: string | null; le: string; par: string | null };

export type BoutiqueConso = {
  id: string; slug: string; nom: string; statut: string; demonstration: boolean;
  formule: string | null; formule_nom: string | null;
  depassement: "compter" | "codes_par_email";
  exception: { emails: number | null; sms: number | null };
  email: ConsoCanal; sms: ConsoCanal;
  credits: Credit[];
};

export type FormuleQuotas = {
  code: string; nom: string; prix: number | null;
  emails: number | null; sms: number | null;
  /** Le prix d'un SMS, et de 1 000 e-mails, au-delà du quota (millimes). */
  prix_sms: number | null; prix_emails: number | null;
  boutiques: number;
};

export type Forfait = { fournisseur: string | null; mois: number | null; jour: number | null };

export type DonneesConsommation = {
  mois: string;
  courant: boolean;
  jours_mois: number;
  jours_ecoules: number;
  mois_disponibles: string[];
  forfaits: { email: Forfait | null; sms: Forfait | null };
  aujourdhui: { email: number; sms: number };
  totaux: Record<Canal, { envoyes: number; refuses: number; par_nature: Partial<Record<Nature, number>> }>;
  skanecom: Record<Canal, ConsoCanal>;
  boutiques: BoutiqueConso[];
  formules: FormuleQuotas[];
};

export const NATURES: { cle: Nature; libelle: string; aide: string }[] = [
  { cle: "code", libelle: "Codes de connexion", aide: "Les acheteurs qui se connectent ou commandent" },
  { cle: "commande", libelle: "Suivi des commandes", aide: "Confirmée, remise au livreur, livrée…" },
  { cle: "equipe", libelle: "Accès des équipes", aide: "Invitations, mots de passe" },
  { cle: "lettre", libelle: "Lettre d'information", aide: "Les confirmations d'inscription" },
  { cle: "essai", libelle: "Essais", aide: "Envoyés depuis la console, comptés à SkanEcom" },
  { cle: "autre", libelle: "Autres", aide: "Avant le comptage par boutique" },
];

export const CANAUX: { cle: Canal; libelle: string; unite: (n: number) => string }[] = [
  { cle: "email", libelle: "E-mails", unite: (n) => (n > 1 ? "e-mails" : "e-mail") },
  { cle: "sms", libelle: "SMS", unite: () => "SMS" },
];

/** Où en est un quota : sans limite, tranquille, proche (80 %), atteint, dépassé. */
export type Niveau = "libre" | "ok" | "proche" | "atteint" | "depasse";
export const SEUIL_PROCHE = 0.8;

export function niveauQuota(envoyes: number, quota: number | null): Niveau {
  if (quota === null) return "libre";
  if (quota === 0) return envoyes > 0 ? "depasse" : "atteint";
  const part = envoyes / quota;
  return part > 1 ? "depasse" : part >= 1 ? "atteint" : part >= SEUIL_PROCHE ? "proche" : "ok";
}

/** La part du quota consommée, de 0 à 100 (au-delà : 100), pour la jauge. */
export const partJauge = (envoyes: number, quota: number | null) =>
  quota === null || quota === 0 ? (envoyes > 0 ? 100 : 0) : Math.min(100, Math.round((envoyes / quota) * 100));

/** La fin du mois au rythme actuel ; null si le mois est fini, trop jeune (3 jours) ou vide. */
export function projection(envoyes: number, d: Pick<DonneesConsommation, "courant" | "jours_ecoules" | "jours_mois">): number | null {
  if (!d.courant || envoyes === 0 || d.jours_ecoules < 3) return null;
  return Math.round((envoyes / d.jours_ecoules) * d.jours_mois);
}

/** Ce que coûte le dépassement (millimes), si la formule en fixe le prix ; null sinon. */
export function coutDepassement(c: ConsoCanal, canal: Canal, f: FormuleQuotas | undefined): number | null {
  if (c.quota === null || c.envoyes <= c.quota || !f) return null;
  const au_dela = c.envoyes - c.quota;
  if (canal === "sms") return f.prix_sms === null ? null : au_dela * f.prix_sms;
  return f.prix_emails === null ? null : Math.ceil(au_dela / 1000) * f.prix_emails;
}

export const nombre = (n: number) => n.toLocaleString("fr-FR");

/** « octobre 2026 » ; « 2026-10-01 » en entrée. */
export const nomMois = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

/** Les initiales des six mois de l'historique (« mai », « juin »…), le dernier étant `iso`. */
export function moisHistorique(iso: string): string[] {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Array.from({ length: 6 }, (_, i) => {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 5 + i, 1));
    return new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(m).replace(".", "");
  });
}

export const LIBELLES_DEPASSEMENT: Record<BoutiqueConso["depassement"], { court: string; long: string }> = {
  compter: { court: "Compter seulement", long: "Rien ne s'arrête : les envois continuent, la console le signale." },
  codes_par_email: {
    court: "Codes par e-mail",
    long: "Les SMS du mois épuisés, la vitrine envoie les codes de connexion par e-mail (un client inscrit par SMS se reconnecte alors avec son adresse : c'est un autre compte).",
  },
};

/** Un nombre d'envois saisi (« 5 000 », « 5000 ») ; vide : null ; NaN : illisible. */
export function entierSaisi(v: FormDataEntryValue | null): number | null {
  const t = String(v ?? "").replace(/[\s  .]/g, "");
  if (t === "") return null;
  return /^\d{1,9}$/.test(t) ? Number(t) : NaN;
}
