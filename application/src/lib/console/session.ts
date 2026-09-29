import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { clientService } from "./service";

/* ============================================================================
   LA SESSION DE LA CONSOLE — qui est là, et a-t-il le droit d'entrer.

   Trois portes, dans cet ordre :
   1. une session (connexion par mot de passe, GoTrue) ;
   2. un ADMINISTRATEUR de la plateforme (plateforme.administrateurs) : un
      membre d'une boutique est refusé avant même la double authentification ;
   3. la DOUBLE AUTHENTIFICATION (aal2), obligatoire pour la console
      (docs/cadrage/02-infrastructure.md §5.3).
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
  if (a.etat === "refuse") redirect("/refuse");
  if (a.etat === "aal1") redirect("/double-authentification");
  return a;
}
