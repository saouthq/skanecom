/* ============================================================================
   L'ÉQUIPE D'UNE BOUTIQUE (console C4) — donner l'accès au backoffice.

   La console ne connaît jamais le mot de passe de personne. Elle demande à
   GoTrue un jeton à usage unique (invitation pour un nouveau compte, mot de
   passe à rechoisir pour un compte existant) et en fait un LIEN vers
   /bienvenue, que l'administrateur transmet à la personne, par WhatsApp.

   Le lien n'agit pas quand on l'ouvre : il affiche le formulaire du mot de
   passe, et le jeton n'est consommé qu'à l'envoi de ce formulaire. L'aperçu
   que WhatsApp fabrique en visitant le lien ne le grille donc pas.
   ========================================================================== */

export type TypeLien = "invite" | "recovery";

export type MembreEquipe = {
  user_id: string;
  email: string | null;
  telephone: string | null;
  role: string;
  actif: boolean;
  depuis: string;
  derniere_connexion: string | null;
  en_attente: boolean;
  double_auth: boolean;
};

/** Les rôles, dans l'ordre du formulaire, avec ce qu'ils permettent. */
export const ROLES_EQUIPE = [
  { code: "proprietaire", aide: "Tout le backoffice ; répond de la boutique. Double authentification conseillée." },
  { code: "admin", aide: "Tout le backoffice. Double authentification conseillée." },
  { code: "confirmateur", aide: "Appelle les clients et confirme les commandes." },
  { code: "preparateur", aide: "Prépare et expédie les colis." },
  { code: "lecture", aide: "Consulte, sans rien modifier." },
] as const;

/** Durée de validité d'un lien : l'expiration des jetons de GoTrue
 *  (GOTRUE_MAILER_OTP_EXP en local, « Email OTP Expiration » chez Supabase),
 *  réglée à 24 heures. */
export const VALIDITE_LIEN = "24 heures";

/** Le cookie qui porte le dernier lien créé jusqu'à la page de l'équipe
 *  (HttpOnly, limité à cette page, un quart d'heure). */
export const COOKIE_LIEN = "skanecom_lien_equipe";
export const DUREE_COOKIE_LIEN = 15 * 60;

export type LienRemis = { email: string; lien: string; type: TypeLien; boutique: string; userId: string; emis: string };

/** Le lien vers /bienvenue. L'adresse e-mail n'y sert qu'à l'affichage (et
 *  au gestionnaire de mots de passe) : seul le jeton ouvre la session. */
export function lienBienvenue(origine: string, jeton: string, type: TypeLien, email: string): string {
  return `${origine}/bienvenue?${new URLSearchParams({ jeton, type, e: email })}`;
}

export function cheminEquipe(slug: string): string {
  return `/boutiques/${slug}/equipe`;
}

/** Le message à envoyer par WhatsApp, lien compris. */
export function messageLien(l: LienRemis): string {
  const debut = l.type === "invite"
    ? `Bonjour, voici votre accès au backoffice de ${l.boutique}.`
    : `Bonjour, voici le lien pour choisir un nouveau mot de passe du backoffice de ${l.boutique}.`;
  return `${debut} Ouvrez-le pour choisir votre mot de passe (il sert une seule fois, pendant ${VALIDITE_LIEN}) :\n${l.lien}\nVotre identifiant : ${l.email}`;
}

export function lienWhatsAppPartage(texte: string): string {
  return `https://wa.me/?${new URLSearchParams({ text: texte })}`;
}

/** Longueur minimale d'un mot de passe de l'équipe (GoTrue en exige moins). */
export const LONGUEUR_MOT_DE_PASSE = 10;
