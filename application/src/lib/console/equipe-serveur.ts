import { cookies } from "next/headers";
import { clientService } from "./service";
import { COOKIE_LIEN, DUREE_COOKIE_LIEN, cheminEquipe, lienBienvenue, type LienRemis, type MembreEquipe, type TypeLien } from "./equipe";
import { MARQUE_PLATEFORME, courrielInvitation, courrielMotDePasse, marqueDeBoutique } from "@/lib/courriels/messages";
import type { Marque } from "@/lib/courriels/modele";
import { cadre } from "@/lib/boutique";
import { envoyer } from "@/lib/courriels/envoi";

/* Côté serveur de la console : fabriquer un lien d'accès, et le faire
   arriver jusqu'à la page de l'équipe. */

type Boutique = { id: string; slug: string; nom: string; demonstration?: boolean };

/** La boutique par son identifiant d'adresse (jamais par un champ du
 *  formulaire : la page d'une boutique n'agit que sur elle). */
export async function boutiqueDe(slug: string): Promise<Boutique | null> {
  const { data } = await clientService().rpc("console_boutique", { p_slug: slug });
  return data ? (data as { boutique: Boutique }).boutique : null;
}

export async function equipeDe(boutiqueId: string): Promise<MembreEquipe[]> {
  const { data, error } = await clientService().rpc("console_equipe", { p_boutique_id: boutiqueId });
  if (error) throw new Error(`Équipe illisible : ${error.message}`);
  return (data ?? []) as MembreEquipe[];
}

/** Demande à GoTrue un jeton à usage unique pour cette adresse. `invite` crée
 *  le compte s'il n'existe pas encore. */
export async function jetonAcces(ip: string | null, email: string, type: TypeLien):
  Promise<{ ok: true; userId: string; jeton: string } | { ok: false; message: string }> {
  const admin = clientService(ip).auth.admin;
  const { data, error } = type === "invite"
    ? await admin.generateLink({ type: "invite", email })
    : await admin.generateLink({ type: "recovery", email });
  if (error || !data?.user || !data.properties?.hashed_token) {
    console.error(`generateLink (${type}) : ${error?.status ?? ""} ${error?.message ?? "réponse incomplète"}`);
    return { ok: false, message: "Le serveur d'authentification n'a pas pu créer le lien : réessayez dans un instant." };
  }
  return { ok: true, userId: data.user.id, jeton: data.properties.hashed_token };
}

/** Trace le lien remis, et le dépose dans un cookie HttpOnly limité à la page
 *  de l'équipe, qui l'affiche avec de quoi le copier ou l'envoyer. */
export async function remettreLien(req: Request, contexte: {
  acteur: string; ip: string | null; boutique: Boutique; userId: string; email: string; jeton: string; type: TypeLien;
}): Promise<string | null> {
  const { error } = await clientService(contexte.ip).rpc("console_tracer_lien", {
    p_acteur: contexte.acteur, p_boutique_id: contexte.boutique.id, p_user_id: contexte.userId,
  });
  if (error) return error.message;
  const origine = req.headers.get("origin")!; // vérifiée par ecriture() : c'est la console
  const remis: LienRemis = {
    email: contexte.email,
    lien: lienBienvenue(origine, contexte.jeton, contexte.type, contexte.email),
    type: contexte.type,
    boutique: contexte.boutique.nom,
    userId: contexte.userId,
    emis: new Date().toISOString(),
  };
  (await cookies()).set(COOKIE_LIEN, encodeURIComponent(JSON.stringify(remis)), {
    httpOnly: true,
    sameSite: "strict",
    secure: origine.startsWith("https:"),
    path: cheminEquipe(contexte.boutique.slug),
    maxAge: DUREE_COOKIE_LIEN,
  });
  return null;
}

/** Le lien remis (invitation ou mot de passe), envoyé aussi par e-mail : au
 *  nom de la boutique et à ses couleurs pour l'équipe d'une boutique (c'est
 *  le nom que l'employé connaît), au nom de SkanEcom pour la sienne. L'envoi
 *  entre au journal des envois, réussi ou refusé. */
export async function envoyerLienParCourriel(l: { email: string; lien: string; type?: TypeLien }, boutique?: string): Promise<{ ok: true } | { ok: false; raison: string }> {
  let m: Marque = MARQUE_PLATEFORME;
  let id: string | null = null;
  if (boutique) {
    try {
      const c = await cadre(boutique);
      m = marqueDeBoutique(c, null);
      id = c.boutique.id;
    } catch {
      // boutique suspendue ou introuvable : la plateforme écrit
    }
  }
  const c = l.type === "recovery" ? courrielMotDePasse(m, l.lien) : courrielInvitation(m, l.lien);
  return envoyer({ a: l.email, nom: m.nom, sujet: c.sujet, html: c.html, texte: c.texte, boutique: id, nature: "equipe" });
}
