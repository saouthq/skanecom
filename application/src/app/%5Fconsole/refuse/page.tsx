// La feuille de la console : ici, pas dans le layout racine (voir ../layout.tsx).
import "../feuille.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acces, accesEquipe, clientSession } from "@/lib/console/session";
import { Porte } from "@/components/console/Porte";
import { deNom } from "@/lib/console/libelles";

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
  // Un ancien membre : l'équipe d'une boutique lui a retiré l'accès — le dire, avec son nom.
  const { data } = await (await clientSession()).rpc("mes_acces_retires");
  const retires = (Array.isArray(data) ? data : []) as string[];
  const liste = retires.length > 1 ? `${retires.slice(0, -1).join(", ")} et ${retires.at(-1)}` : retires[0];
  return (
    <Porte
      titre="Accès refusé"
      qui={a.user.email ?? a.user.phone}
      description={
        retires.length ? (
          <>
            L&apos;équipe {deNom(liste)} a retiré l&apos;accès de ce compte à son backoffice. Si c&apos;est une erreur, demandez à son
            propriétaire de vous le rendre : Équipe, puis « Rendre l&apos;accès ».
          </>
        ) : (
          <>
            Ce compte n&apos;a accès ni à la console SkanEcom, ni au backoffice d&apos;une boutique. Si vous travaillez pour une
            boutique, demandez à son propriétaire de vous ajouter à l&apos;équipe.
          </>
        )
      }
    >
      <form action="/session/fermer" method="post" className="text-center">
        <button type="submit" className="btn btn-second">Se déconnecter</button>
      </form>
    </Porte>
  );
}
