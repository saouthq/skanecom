import type { Role } from "@/lib/console/session";

/* ============================================================================
   LE TABLEAU DE BORD (B12) — ce que rend public.gestion_tableau_de_bord, et
   les mots pour le lire : des pourcentages à la française, des durées, des
   évolutions (« ▲ 12 % », « ▼ 3 pts »).
   ========================================================================== */

/** Qui lit le tableau de bord (la base revérifie). */
export const DIRECTION: Role[] = ["proprietaire", "admin", "lecture"];

export type Synthese = {
  recues: number;
  confirmees: number;
  livrees: number;
  refusees: number;
  annulees: number;
  en_cours: number;
  a_confirmer: number;
  encaisse_millimes: number;
  perdu_millimes: number;
  panier_moyen_millimes: number;
  taux_confirmation: number | null;
  taux_refus: number | null;
  confirmation_minutes: number | null;
};

export type Tableau = {
  jours: number;
  du: string;
  au: string;
  courante: Partial<Synthese>;
  precedente: Partial<Synthese>;
  par_jour: { jour: string; recues: number; livrees: number }[];
  refus_origines: { origine: string; refus: number }[];
  gouvernorats: { code: string; nom: string; arrivees: number; refusees: number; taux_refus: number }[];
  produits: { produit: string; quantite: number; montant_millimes: number }[];
};

const POURCENT = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

/** 0,724 → « 72 % » ; sans valeur → « — ». */
export function pourcent(x: number | null | undefined): string {
  return x === null || x === undefined ? "—" : POURCENT.format(x);
}

/** 45 → « 45 min » ; 130 → « 2 h 10 » ; 3000 → « 2 j ». */
export function duree(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
  }
  return `${Math.round(minutes / 1440)} j`;
}

/** L'évolution d'un chiffre : relative (« 12 % »), ou en points pour un
 *  taux (« 4 pts »). `null` quand la période précédente ne dit rien. */
export function delta(maintenant: number | null | undefined, avant: number | null | undefined, points = false): { sens: -1 | 0 | 1; texte: string } | null {
  if (maintenant === null || maintenant === undefined || avant === null || avant === undefined) return null;
  if (points) {
    const d = Math.round((maintenant - avant) * 100);
    return { sens: d > 0 ? 1 : d < 0 ? -1 : 0, texte: d === 0 ? "stable" : `${Math.abs(d)} pt${Math.abs(d) > 1 ? "s" : ""}` };
  }
  if (avant === 0) return null;
  const r = (maintenant - avant) / avant;
  const arrondi = Math.round(r * 100);
  return { sens: arrondi > 0 ? 1 : arrondi < 0 ? -1 : 0, texte: arrondi === 0 ? "stable" : `${Math.abs(arrondi)} %` };
}
