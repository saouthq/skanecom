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
   3. la DOUBLE AUTHENTIFICATION (aal2) — voir plus bas.

   LE BACKOFFICE (accesEquipe, exigeMembre) :
   1. une session ;
   2. un MEMBRE actif d'au moins une boutique (public.mes_acces, lu avec la
      session de l'utilisateur : la base ne rend que SES boutiques) ;
   3. la double authentification — voir plus bas.
   Un compte qui n'est ni l'un ni l'autre est refusé (/refuse).

   LA DOUBLE AUTHENTIFICATION (migration …_double_auth_facultative) :
   · qui a enregistré une application donne TOUJOURS son code (aal2) :
     sans quoi un mot de passe volé suffirait ;
   · qui n'en a pas en est tenu seulement si un réglage l'exige — celui de
     la plateforme pour son équipe, celui de la boutique pour ses
     propriétaires et administrateurs ; coupés par défaut. Sinon elle lui
     est proposée à la connexion (« Plus tard » la reporte), et il l'active
     quand il veut depuis « Mon compte ».

   L'ACCÈS SUPPORT (C7) : un administrateur de la plateforme entre dans le
   backoffice d'une boutique le temps d'un accès ouvert depuis la console
   (mes_acces le rend avec son échéance et son motif), aux mêmes conditions
   de double authentification (la base les revérifie) ; échu ou fermé, il
   est renvoyé à la console.
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
  if (niveau?.currentLevel !== "aal2") {
    // Une application enregistrée : son code, toujours.
    if (niveau?.nextLevel === "aal2") return { etat: "aal1", user, role: role as string };
    // Aucune : seulement si la plateforme l'exige de son équipe.
    const { data: exigee } = await clientService().rpc("console_double_auth_exigee");
    if (exigee === true) return { etat: "aal1", user, role: role as string };
  }
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
export type Membre = {
  boutique_id: string;
  slug: string;
  nom: string;
  statut: string;
  role: Role;
  /** Un accès support (C7) : son échéance et son motif ; null pour l'équipe. */
  support_jusqu_a: string | null;
  support_motif: string | null;
};

/** Les rôles à qui la double authentification est proposée à la connexion
 *  (et qu'une boutique peut tenir de l'avoir). */
export const ROLES_AAL2: Role[] = ["proprietaire", "admin"];

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

  const { data: niveau } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (niveau?.currentLevel !== "aal2") {
    // Une application enregistrée (quel que soit le rôle) : son code, toujours.
    if (niveau?.nextLevel === "aal2") return { etat: "aal1", user, boutiques };
    // Aucune : seulement si une boutique (ou la plateforme, pour l'accès
    // support) l'exige des rôles qui ont la main.
    if (boutiques.some((b) => ROLES_AAL2.includes(b.role) || b.support_jusqu_a)) {
      const { data: exigee } = await sb.rpc("double_auth_exigee_pour_moi");
      if (exigee === true) return { etat: "aal1", user, boutiques };
    }
  }
  return { etat: "ok", user, boutiques };
}

/** Pour les pages et les gestionnaires du backoffice d'UNE boutique : le
 *  membre et son rôle, ou la bonne porte. Une boutique dont on n'est pas
 *  membre n'existe pas (404), comme pour un visiteur. */
export async function exigeMembre(slug: string): Promise<{ user: User; boutique: Membre; boutiques: Membre[] }> {
  const a = await accesEquipe();
  if (a.etat === "anonyme") redirect("/connexion");
  if (a.etat === "aal1") redirect("/double-authentification");
  const boutique = a.etat === "ok" ? a.boutiques.find((b) => b.slug === slug) : undefined;
  if (!boutique) {
    // Un administrateur de la plateforme dont l'accès support a pris fin
    // retrouve la page Support de la boutique dans la console.
    if (await estAdministrateur(a.user.id)) redirect(`/boutiques/${encodeURIComponent(slug)}/support?fin=1`);
    if (a.etat === "aucune") redirect("/refuse");
    notFound();
  }
  return { user: a.user, boutique, boutiques: a.etat === "ok" ? a.boutiques : [] };
}

export async function estAdministrateur(userId: string): Promise<boolean> {
  const { data } = await clientService().rpc("console_administrateur", { p_user_id: userId });
  return Boolean(data);
}
