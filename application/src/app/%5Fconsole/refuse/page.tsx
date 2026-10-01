// La feuille de la console : ici, pas dans le layout racine (voir ../layout.tsx).
import "../feuille.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acces, accesEquipe } from "@/lib/console/session";
import { Porte } from "@/components/console/Porte";

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
    <Porte
      titre="Accès refusé"
      qui={a.user.email ?? a.user.phone}
      description={
        <>
          Ce compte n&apos;a accès ni à la console SkanEcom, ni au backoffice d&apos;une boutique. Si vous travaillez pour une
          boutique, demandez à son propriétaire de vous ajouter à l&apos;équipe.
        </>
      }
    >
      <form action="/session/fermer" method="post" className="text-center">
        <button type="submit" className="btn btn-second">Se déconnecter</button>
      </form>
    </Porte>
  );
}
