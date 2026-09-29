import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acces } from "@/lib/console/session";

export const metadata: Metadata = { title: "Accès refusé" };

/* Un compte qui existe (membre d'une boutique, client…) mais n'est pas
   administrateur de la plateforme : refusé AVANT la double authentification. */
export default async function Refuse() {
  const a = await acces();
  if (a.etat === "anonyme") redirect("/connexion");
  if (a.etat !== "refuse") redirect("/");
  return (
    <main id="principal" className="flex-1 grid place-items-center px-4 py-12">
      <div className="carte w-full max-w-[30rem]">
        <h1>Accès refusé</h1>
        <p className="mt-3 text-encre-doux">
          Le compte <b className="text-encre">{a.user.email}</b> n&apos;est pas administrateur de la plateforme SkanEcom.
          Le backoffice d&apos;une boutique se trouve à une autre adresse.
        </p>
        <form action="/session/fermer" method="post" className="mt-6">
          <button type="submit" className="btn btn-second">Se déconnecter</button>
        </form>
      </div>
    </main>
  );
}
