/* Revenir où l'on était après une reconnexion. Une session qui a pris fin
   (l'onglet du backoffice laissé ouvert jusqu'au lendemain) menait à la
   connexion, puis à la liste des commandes — le geste tenté perdu, sans un
   mot. Le proxy dit à la page où l'on était (EN_TETE_CHEMIN ; EN_TETE_GESTE
   pour un geste envoyé) ; la connexion le garde dans un cookie le temps de se
   reconnecter (double authentification comprise) ; l'entrée du backoffice y
   ramène. Seulement vers une page du backoffice. */

export const EN_TETE_CHEMIN = "x-skanecom-chemin";
export const EN_TETE_GESTE = "x-skanecom-geste";
export const COOKIE_SUITE = "skanecom_suite";

/** Une adresse du backoffice, et rien d'autre (ni autre site, ni « // »). */
export function suiteSure(chemin: string | null | undefined): string | null {
  if (!chemin || chemin.length > 300 || chemin.includes("//") || chemin.includes("\\")) return null;
  return /^\/gestion\/[a-z0-9-]+(\/[^\s]*)?(\?[^\s]*)?$/.test(chemin) ? chemin : null;
}
