/* ============================================================================
   L'ACCÈS SUPPORT (C7) — l'administrateur de la plateforme entre dans le
   backoffice d'une boutique, le temps d'un accès ouvert depuis la console :
   un motif (le propriétaire le lit), un mode, une durée. La base tient la
   porte (private.est_membre) ; ces libellés servent à la console et au
   backoffice.
   ========================================================================== */

export type ModeSupport = "lecture" | "admin";

/** Une ligne de public.console_acces_support / gestion_acces_support. */
export type AccesSupport = {
  id: number;
  qui: string | null;
  role: ModeSupport;
  motif: string;
  ouvert_le: string;
  expire_le: string;
  ferme_le: string | null;
  ferme_par: string | null;
  ouvert: boolean;
  fin: string;
  vous: boolean;
};

export const MODES_SUPPORT: Record<ModeSupport, { titre: string; court: string; aide: string }> = {
  lecture: {
    titre: "Regarder",
    court: "regarder seulement",
    aide: "Tout voir comme le propriétaire (commandes, clients, catalogue, réglages), sans rien pouvoir changer.",
  },
  admin: {
    titre: "Agir comme un administrateur",
    court: "agir comme administrateur",
    aide: "Confirmer, expédier, corriger une fiche, un stock, un réglage. Jamais l'équipe, qui reste au propriétaire.",
  },
};

export const DUREES_SUPPORT = [
  { minutes: 30, libelle: "30 minutes" },
  { minutes: 60, libelle: "1 heure" },
  { minutes: 120, libelle: "2 heures" },
  { minutes: 240, libelle: "4 heures" },
] as const;

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });

/** « 15:20 », à l'heure de Tunis. */
export function heureSupport(iso: string): string {
  return HEURE.format(new Date(iso));
}

/** « encore 42 min », « encore 1 h 10 ». */
export function resteSupport(iso: string, maintenant = new Date()): string {
  const minutes = Math.max(1, Math.ceil((new Date(iso).getTime() - maintenant.getTime()) / 60_000));
  if (minutes < 60) return `encore ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `encore ${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
}

/** Comment un accès a pris fin : fermé par quelqu'un, ou échu à l'heure dite. */
export function finSupport(a: AccesSupport): string {
  if (a.ouvert) return `ouvert jusqu'à ${heureSupport(a.expire_le)}`;
  if (a.ferme_par && a.ferme_le && new Date(a.ferme_le) < new Date(a.expire_le)) return `fermé à ${heureSupport(a.ferme_le)}`;
  return `échu à ${heureSupport(a.expire_le)}`;
}

/** La durée réelle d'un accès : « 38 min », « 1 h 05 ». */
export function dureeSupport(a: AccesSupport, maintenant = new Date()): string {
  const fin = a.ouvert ? maintenant : new Date(a.fin);
  const minutes = Math.max(1, Math.round((fin.getTime() - new Date(a.ouvert_le).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
}
