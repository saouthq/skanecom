/* L'équipe SkanEcom : qui entre dans la console, et ce qu'il peut y faire
   (…_equipe_plateforme_journaux.sql). */

export const ROLES_PLATEFORME = [
  { code: "super_admin", titre: "Super-administrateur", aide: "Tout : formules, modules, ouvrir ou fermer une boutique, l'équipe SkanEcom." },
  { code: "support", titre: "Support", aide: "Aider sans engager : lire, ouvrir un accès support, noter, annoncer, cloner, renommer." },
] as const;

export const LIBELLES_ROLE_PLATEFORME: Record<string, string> = Object.fromEntries(ROLES_PLATEFORME.map((r) => [r.code, r.titre]));

/** Le dernier lien d'invitation, gardé un quart d'heure pour la page de l'équipe. */
export const COOKIE_LIEN_ADMIN = "skanecom_lien_admin";

export type AdministrateurPlateforme = {
  user_id: string; email: string; role: string; depuis: string; derniere_connexion: string | null;
  confirme: boolean; double_auth: boolean; vous: boolean;
};
