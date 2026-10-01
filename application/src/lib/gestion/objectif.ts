import type { Role } from "@/lib/console/session";

/* ============================================================================
   L'OBJECTIF DU MOIS (…_objectif_mois.sql) — ce que rend
   public.gestion_objectif, et les mots pour le lire.
   ========================================================================== */

export type Objectif = {
  mois: string;
  aujourdhui: string;
  jours_ecoules: number;
  jours_mois: number;
  objectif: number | null;
  objectif_suivant: number | null;
  livre: number;
  en_route: number;
  projection: number;
  par_jour: number | null;
  mois_dernier: number;
  historique: { mois: string; objectif: number | null; livre: number }[];
};

/** Fixer l'objectif : propriétaire, administrateur. */
export const PEUT_FIXER: Role[] = ["proprietaire", "admin"];

const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" });
const DINARS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Un objectif se dit en dinars ronds : 12 450 300 millimes → « 12 450 TND ». */
export const enTnd = (millimes: number) => `${DINARS.format(Math.round(millimes / 1000))} TND`;
const MOIS_COURT = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

/** « 2026-10-01 » → « octobre ». */
export const nomMois = (mois: string) => MOIS.format(new Date(`${mois.slice(0, 10)}T00:00:00Z`));
/** « 2026-10-01 » → « oct. ». */
export const nomMoisCourt = (mois: string) => MOIS_COURT.format(new Date(`${mois.slice(0, 10)}T00:00:00Z`));

/** « d'octobre », « de mars » : la préposition devant un mois. */
export function duMois(mois: string): string {
  const nom = nomMois(mois);
  return /^[aeiou]/i.test(nom) ? `d'${nom}` : `de ${nom}`;
}

/** Le mois qui suit (« 2026-11-01 »). */
export function moisSuivant(mois: string): string {
  const d = new Date(`${mois.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/** Un chiffre à proposer, sans objectif : le livré du mois dernier, plus
 *  dix pour cent, arrondi à un nombre rond (au millier de dinars, ou à la
 *  centaine sous dix mille). Rien sans mois dernier. */
export function suggestion(moisDernier: number): number | null {
  if (moisDernier <= 0) return null;
  const vise = moisDernier * 1.1;
  const pas = vise >= 10_000_000 ? 1_000_000 : 100_000;
  return Math.ceil(vise / pas) * pas;
}
