import { cookies } from "next/headers";
import { COOKIE_LIEN, DUREE_COOKIE_LIEN, lienBienvenue, type LienRemis, type MembreEquipe, type TypeLien } from "@/lib/console/equipe";

/* ============================================================================
   L'ÉQUIPE AU BACKOFFICE (B7) — le propriétaire invite, change un rôle,
   retire un accès, remet un lien. Les règles sont en base
   (…_gestion_equipe.sql), communes avec la console ; le jeton d'accès vient
   de GoTrue (lib/console/equipe-serveur.ts, jetonAcces), comme pour la
   console : personne ne connaît jamais le mot de passe de personne.
   ========================================================================== */

export type MembreBoutique = MembreEquipe & { vous: boolean; lien_possible: boolean };

export function cheminEquipeBoutique(slug: string): string {
  return `/gestion/${slug}/equipe`;
}

/** Le lien remis, déposé dans un cookie HttpOnly limité à la page de
 *  l'équipe du backoffice, qui l'affiche avec de quoi le copier ou l'envoyer. */
export async function deposerLien(req: Request, slug: string, contexte: {
  boutique: string; userId: string; email: string; jeton: string; type: TypeLien;
}): Promise<void> {
  const origine = req.headers.get("origin")!; // même origine vérifiée par la route : la console
  const remis: LienRemis = {
    email: contexte.email,
    lien: lienBienvenue(origine, contexte.jeton, contexte.type, contexte.email),
    type: contexte.type,
    boutique: contexte.boutique,
    userId: contexte.userId,
    emis: new Date().toISOString(),
  };
  (await cookies()).set(COOKIE_LIEN, encodeURIComponent(JSON.stringify(remis)), {
    httpOnly: true,
    sameSite: "strict",
    secure: origine.startsWith("https:"),
    path: cheminEquipeBoutique(slug),
    maxAge: DUREE_COOKIE_LIEN,
  });
}

export function lienRemis(valeur: string | undefined): LienRemis | null {
  if (!valeur) return null;
  try {
    const l = JSON.parse(decodeURIComponent(valeur)) as LienRemis;
    return typeof l.lien === "string" && typeof l.email === "string" ? l : null;
  } catch {
    return null;
  }
}

/** Le lien n'est plus montré une fois qu'il a servi. */
export function lienEncoreUtile(l: LienRemis | null, equipe: MembreEquipe[]): LienRemis | null {
  if (!l) return null;
  const m = equipe.find((x) => x.user_id === l.userId);
  if (!m || !m.actif) return null;
  if (l.type === "invite") return m.en_attente ? l : null;
  return m.derniere_connexion && new Date(m.derniere_connexion) > new Date(l.emis) ? null : l;
}

export function messageEquipe(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Seul le propriétaire de la boutique gère son équipe.";
    case "ailleurs":
      return "Ce compte sert aussi dans une autre boutique : son lien d'accès se demande à SkanEcom.";
    case "membre":
    case "proprietaire":
      return message;
    case "role_inconnu":
      return "Choisissez un rôle.";
    default:
      return message;
  }
}
