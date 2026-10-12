import { MARQUE_PLATEFORME } from "./messages";
import { rendre, type Courriel } from "./modele";

/* ============================================================================
   L'E-MAIL D'ALERTE DE LA SURVEILLANCE (migration …_alertes_surveillance) —
   à l'équipe SkanEcom, au nom de la plateforme : ce qui vient de casser
   (une vitrine qui ne répond plus deux passages de suite, une file qui
   s'entasse, un domaine d'envoi qui perd sa vérification) et ce qui est
   rétabli, en un seul e-mail par passage. Le bouton ouvre État technique.
   ========================================================================== */

export type IncidentAlerte = {
  id: number;
  genre: "page" | "courriels" | "skanfact" | "domaine_envoi";
  cible: string;
  detail: string | null;
  echecs: number;
  ouvert_le: string;
  clos_le: string | null;
  boutique: { nom: string; slug: string } | null;
};

const QUOI: Record<IncidentAlerte["genre"], string> = {
  page: "La vitrine ne répond plus",
  courriels: "Des e-mails de commande s'entassent",
  skanfact: "Des factures n'arrivent pas à SkanFact",
  domaine_envoi: "Le domaine d'envoi n'est plus vérifié",
};

/** Ce qui est revenu, dit à l'endroit. */
const RETOUR: Record<IncidentAlerte["genre"], string> = {
  page: "La vitrine répond de nouveau",
  courriels: "Les e-mails de commande repartent",
  skanfact: "Les factures arrivent de nouveau à SkanFact",
  domaine_envoi: "Le domaine d'envoi est de nouveau vérifié",
};

const jour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis", day: "2-digit", month: "2-digit" });
const heureSeule = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Africa/Tunis", hour: "2-digit", minute: "2-digit" });
/** « le 12/10, de 15:06 à 16:10 », ou « du 12/10 à 23:40 au 13/10 à 01:10 ». */
const periode = (debut: string, fin: string) =>
  jour(debut) === jour(fin) ? `le ${jour(debut)}, de ${heureSeule(debut)} à ${heureSeule(fin)}` : `du ${heure(debut)} au ${heure(fin)}`;

const heure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Africa/Tunis", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(" ", " à ");

/** « 2 h 10 », « 35 min » : combien de temps c'est resté cassé. */
export function duree(debut: string, fin: string): string {
  const min = Math.max(1, Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const reste = min % 60;
  return h >= 48 ? `${Math.round(h / 24)} jours` : reste ? `${h} h ${String(reste).padStart(2, "0")}` : `${h} h`;
}

const qui = (i: IncidentAlerte) => i.boutique?.nom ?? "La plateforme";

/** Le sujet dit le plus grave d'abord : « Maymar : la vitrine ne répond plus ». */
function sujet(ouverts: IncidentAlerte[], retablis: IncidentAlerte[]): string {
  if (ouverts.length === 1 && !retablis.length) return `Alerte · ${qui(ouverts[0])} : ${QUOI[ouverts[0].genre].toLowerCase()}`;
  if (ouverts.length) return `Alerte · ${ouverts.length} incident${ouverts.length > 1 ? "s" : ""}${retablis.length ? `, ${retablis.length} rétabli${retablis.length > 1 ? "s" : ""}` : ""}`;
  if (retablis.length === 1) return `Rétabli · ${qui(retablis[0])} : ${RETOUR[retablis[0].genre].toLowerCase()}`;
  return `Rétabli · ${retablis.length} incidents`;
}

export function courrielAlerte(ouverts: IncidentAlerte[], retablis: IncidentAlerte[], lienEtat: string | null, essai = false): Courriel {
  const maintenant = new Date().toISOString();
  const lignesOuvert = (i: IncidentAlerte) => [
    `${QUOI[i.genre]}${i.genre === "page" || i.genre === "domaine_envoi" ? ` (${i.cible})` : ""}`,
    i.detail ? i.detail : null,
    `Depuis le ${heure(i.ouvert_le)}${i.genre === "page" ? ` · ${i.echecs} passages sans réponse` : ""}`,
  ].filter((x): x is string => Boolean(x));
  const lignesRetabli = (i: IncidentAlerte) => [
    `${RETOUR[i.genre]}${i.genre === "page" || i.genre === "domaine_envoi" ? ` (${i.cible})` : ""}.`,
    `En panne ${duree(i.ouvert_le, i.clos_le ?? maintenant)}, ${periode(i.ouvert_le, i.clos_le ?? maintenant)}.`,
  ];
  const s = sujet(ouverts, retablis);
  return rendre(MARQUE_PLATEFORME, {
    sujet: essai ? `[Essai] ${s}` : s,
    apercu: ouverts.length ? `${qui(ouverts[0])} : ${QUOI[ouverts[0].genre].toLowerCase()}.` : "Tout ce qui était cassé répond de nouveau.",
    titre: ouverts.length ? (ouverts.length > 1 ? "Des incidents sur la plateforme" : "Un incident sur la plateforme") : "C'est rétabli",
    paragraphes: [
      essai ? "Ceci est un essai : rien n'est cassé. Voici à quoi ressemble une alerte de la surveillance." : null,
      ouverts.length
        ? "La surveillance de l'heure vient de le relever. Elle vous écrira de nouveau quand ce sera rétabli, pas à chaque passage."
        : "La surveillance l'a vérifié à son dernier passage.",
    ].filter((x): x is string => Boolean(x)),
    encarts: [
      ...ouverts.map((i) => ({ titre: qui(i), lignes: lignesOuvert(i) })),
      ...retablis.map((i) => ({ titre: `${qui(i)} · rétabli`, lignes: lignesRetabli(i) })),
    ],
    bouton: lienEtat ? { libelle: "Ouvrir l'état technique", url: lienEtat } : undefined,
    notes: [],
    raison: "Vous recevez cet e-mail parce que votre adresse est dans les alertes de la surveillance (console, État technique).",
  });
}

/** Un incident d'exemple, pour l'essai depuis la console. */
export function incidentsExemple(): { ouverts: IncidentAlerte[]; retablis: IncidentAlerte[] } {
  const ilYa = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  return {
    ouverts: [{ id: 0, genre: "page", cible: "boutique-exemple.tn", detail: "La vitrine répond 502", echecs: 2, ouvert_le: ilYa(65), clos_le: null, boutique: { nom: "Boutique d'exemple", slug: "exemple" } }],
    retablis: [{ id: 0, genre: "courriels", cible: "e-mails de commande", detail: null, echecs: 1, ouvert_le: ilYa(190), clos_le: ilYa(70), boutique: { nom: "Boutique d'exemple", slug: "exemple" } }],
  };
}
