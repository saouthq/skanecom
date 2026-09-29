import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acces } from "@/lib/console/session";

export const metadata: Metadata = { title: "Connexion" };

/* La porte de la console. Un formulaire HTML ordinaire : il marche sans
   JavaScript, et le mot de passe ne transite que par un POST vers /session. */
export default async function Connexion({ searchParams }: { searchParams: Promise<{ erreur?: string; email?: string }> }) {
  const a = await acces();
  if (a.etat === "ok") redirect("/");
  if (a.etat === "aal1") redirect("/double-authentification");
  const { erreur, email } = await searchParams;

  return (
    <main id="principal" className="flex-1 grid place-items-center px-4 py-12">
      <div className="w-full max-w-[26rem]">
        <p className="text-petit text-encre-doux">SkanEcom</p>
        <h1 className="mt-1">Console de mise en place</h1>
        <p className="text-petit text-encre-doux mt-2">Réservée aux administrateurs de la plateforme. Double authentification obligatoire.</p>

        <form action="/session/ouvrir" method="post" className="carte formulaire mt-6">
          {erreur ? <p className="message message-erreur" role="alert">{erreur}</p> : null}
          <div className="champ">
            <label htmlFor="email">Adresse e-mail</label>
            <input id="email" name="email" type="email" autoComplete="username" required defaultValue={email ?? ""} autoFocus />
          </div>
          <div className="champ">
            <label htmlFor="mot_de_passe">Mot de passe</label>
            <input id="mot_de_passe" name="mot_de_passe" type="password" autoComplete="current-password" required />
          </div>
          <button type="submit" className="btn btn-primaire btn-bloc">Se connecter</button>
        </form>
      </div>
    </main>
  );
}
