import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acces, accesEquipe } from "@/lib/console/session";

export const metadata: Metadata = { title: "Accès refusé" };

/* Un compte qui existe (un acheteur, un ancien membre…) mais n'est ni
   administrateur de la plateforme ni membre d'une boutique : refusé AVANT la
   double authentification. */
export default async function Refuse() {
  const a = await acces();
  if (a.etat === "anonyme") redirect("/connexion");
  if (a.etat !== "refuse") redirect("/");
  const e = await accesEquipe();
  if (e.etat === "ok") redirect("/gestion");
  if (e.etat === "aal1") redirect("/double-authentification");
  return (
    <main id="principal" className="flex-1 grid place-items-center px-4 py-12">
      <div className="carte w-full max-w-[30rem]">
        <h1>Accès refusé</h1>
        <p className="mt-3 text-encre-doux">
          Le compte <b className="text-encre">{a.user.email ?? a.user.phone}</b> n&apos;a accès ni à la console SkanEcom,
          ni au backoffice d&apos;une boutique. Si vous travaillez pour une boutique, demandez à son propriétaire
          de vous ajouter à l&apos;équipe.
        </p>
        <form action="/session/fermer" method="post" className="mt-6">
          <button type="submit" className="btn btn-second">Se déconnecter</button>
        </form>
      </div>
    </main>
  );
}
