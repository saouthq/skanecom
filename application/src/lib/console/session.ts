import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { clientService } from "./service";

/* ============================================================================
   LA SESSION — console de la plateforme ET backoffice des boutiques, sur le
   même domaine (app.skanecom.tn ; docs/cadrage/02-infrastructure.md) : même
   connexion, deux portes.

   LA CONSOLE (acces, exigeAdmin), dans cet ordre :
   1. une session (connexion par mot de passe, GoTrue) ;
   2. un ADMINISTRATEUR de la plateforme (plateforme.administrateurs) ;
   3. la DOUBLE AUTHENTIFICATION (aal2), obligatoire (infra §5.3).

   LE BACKOFFICE (accesEquipe, exigeMembre) :
   1. une session ;
   2. un MEMBRE actif d'au moins une boutique (public.mes_acces, lu avec la
      session de l'utilisateur : la base ne rend que SES boutiques) ;
   3. la double authentification pour qui est propriétaire ou admin d'une
      boutique (PRD B7) ; un confirmateur, un préparateur ou un lecteur
      entre avec son mot de passe.
   Un compte qui n'est ni l'un ni l'autre est refusé (/refuse).
   ========================================================================== */

export async function clientSession() {
  const magasin = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => magasin.getAll(),
      setAll: (liste) => {
        // Un composant serveur ne peut pas écrire de cookie : le proxy a déjà
        // rafraîchi la session, on ignore. Les gestionnaires POST, eux, écrivent.
        try {
          for (const { name, value, options } of liste) magasin.set(name, value, options);
        } catch {}
      },
    },
  });
}

export type Acces =
  | { etat: "anonyme" }
  | { etat: "refuse"; user: User }
  | { etat: "aal1"; user: User; role: string }
  | { etat: "ok"; user: User; role: string };

export async function acces(): Promise<Acces> {
  const sb = await clientSession();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return { etat: "anonyme" };

  const { data: role } = await clientService().rpc("console_administrateur", { p_user_id: user.id });
  if (!role) return { etat: "refuse", user };

  const { data: niveau } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (niveau?.currentLevel !== "aal2") return { etat: "aal1", user, role: role as string };
  return { etat: "ok", user, role: role as string };
}

/** Pour les pages protégées : renvoie l'administrateur, ou redirige vers la
 *  bonne porte. */
export async function exigeAdmin(): Promise<{ user: User; role: string }> {
  const a = await acces();
  if (a.etat === "anonyme") redirect("/connexion");
  if (a.etat === "refuse") {
    // Pas administrateur : peut-être membre d'une boutique.
    const e = await accesEquipe();
    redirect(e.etat === "ok" ? "/gestion" : e.etat === "aal1" ? "/double-authentification" : "/refuse");
  }
  if (a.etat === "aal1") redirect("/double-authentification");
  return a;
}

/* ---------------------------------------------------------------------------
   Le backoffice des boutiques
   ------------------------------------------------------------------------- */

export type Role = "proprietaire" | "admin" | "confirmateur" | "preparateur" | "lecture";
export type Membre = { boutique_id: string; slug: string; nom: string; statut: string; role: Role };

/** Les rôles qui exigent la double authentification pour entrer. */
const ROLES_AAL2: Role[] = ["proprietaire", "admin"];

export type AccesEquipe =
  | { etat: "anonyme" }
  | { etat: "aucune"; user: User }
  | { etat: "aal1"; user: User; boutiques: Membre[] }
  | { etat: "ok"; user: User; boutiques: Membre[] };

export async function accesEquipe(): Promise<AccesEquipe> {
  const sb = await clientSession();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return { etat: "anonyme" };

  const { data: lignes } = await sb.rpc("mes_acces");
  const boutiques = (lignes ?? []) as Membre[];
  if (boutiques.length === 0) return { etat: "aucune", user };

  if (boutiques.some((b) => ROLES_AAL2.includes(b.role))) {
    const { data: niveau } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (niveau?.currentLevel !== "aal2") return { etat: "aal1", user, boutiques };
  }
  return { etat: "ok", user, boutiques };
}

/** Pour les pages et les gestionnaires du backoffice d'UNE boutique : le
 *  membre et son rôle, ou la bonne porte. Une boutique dont on n'est pas
 *  membre n'existe pas (404), comme pour un visiteur. */
export async function exigeMembre(slug: string): Promise<{ user: User; boutique: Membre; boutiques: Membre[] }> {
  const a = await accesEquipe();
  if (a.etat === "anonyme") redirect("/connexion");
  if (a.etat === "aucune") redirect("/refuse");
  if (a.etat === "aal1") redirect("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) notFound();
  return { user: a.user, boutique, boutiques: a.boutiques };
}
