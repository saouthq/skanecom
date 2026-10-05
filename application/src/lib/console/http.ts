import { acces } from "./session";
import { memeOrigine } from "@/lib/origine";
import type { User } from "@supabase/supabase-js";

/* ============================================================================
   LES GESTIONNAIRES POST DE LA CONSOLE — formulaires HTML ordinaires, qui
   marchent sans JavaScript, et répondent par une redirection 303.

   Chaque écriture passe par `ecriture()` :
   · même origine obligatoire (en plus des cookies SameSite=Lax) : un site
     tiers ne peut pas faire poster un formulaire à la console ;
   · administrateur connecté en double authentification, revérifié ici (un
     gestionnaire POST ne passe pas par le layout des pages) ;
   · l'IP de l'administrateur est transmise au journal d'audit.
   ========================================================================== */

export function vers(chemin: string): Response {
  return new Response(null, { status: 303, headers: { location: chemin, "cache-control": "no-store" } });
}

/** `/chemin?erreur=…` : le message s'affiche sur la page de retour. */
export function versAvecErreur(chemin: string, message: string, valeurs: Record<string, string> = {}): Response {
  const params = new URLSearchParams({ ...valeurs, erreur: message });
  return vers(`${chemin}?${params}`);
}

/** `/chemin?ok=…&carte=x#t-x` : le message s'affiche dans la carte du geste,
    là où le navigateur ramène, et non en haut de la page. `ancre` porte le
    fragment au geste fait sans rechargement (un fetch ne voit pas celui
    d'une redirection). */
export function versCarte(chemin: string, carte: string, message: { ok: string } | { erreur: string }): Response {
  return vers(`${chemin}?${new URLSearchParams({ ...message, carte, ancre: `t-${carte}` })}#t-${carte}`);
}

export { memeOrigine };

export function ipDe(req: Request): string | null {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function ecriture(
  req: Request,
  action: (contexte: { user: User; formulaire: FormData; ip: string | null }) => Promise<Response>,
): Promise<Response> {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const a = await acces();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "refuse") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  return action({ user: a.user, formulaire: await req.formData(), ip: ipDe(req) });
}

/** Message lisible d'une erreur de la base (contraintes, droits, version). */
export function messageBase(erreur: { code?: string; message?: string; hint?: string } | null): string {
  if (!erreur) return "Erreur inconnue";
  if (erreur.hint === "version") return "Quelqu'un a enregistré entre-temps : rechargez la page avant de recommencer.";
  switch (erreur.code) {
    case "23505":
      return "Déjà pris : cet identifiant ou ce domaine appartient à une autre boutique.";
    case "23514":
    case "22P02":
      // Une phrase écrite pour être lue (formule, module) : telle quelle.
      if (erreur.hint === "formule" || erreur.hint === "utilisee") return erreur.message ?? "";
      return `Valeur refusée par la base : ${erreur.message ?? ""}`;
    case "42501":
      // « Seul un super-administrateur… » : la base dit déjà pourquoi.
      return erreur.message?.startsWith("Seul ") ? erreur.message : "Action refusée : vous n'êtes pas administrateur de la plateforme.";
    default:
      return erreur.message ?? "Erreur inconnue";
  }
}
