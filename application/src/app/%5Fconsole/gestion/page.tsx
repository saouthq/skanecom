import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { accesEquipe } from "@/lib/console/session";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";
import { Porte } from "@/components/console/Porte";
import { Icone } from "@/components/console/Icone";

export const metadata: Metadata = { title: "Vos boutiques" };

/* L'entrée du backoffice : la boutique du membre, ou le choix s'il en a
   plusieurs (un employé partagé, un propriétaire de deux enseignes). */
export default async function MesBoutiques() {
  const a = await accesEquipe();
  if (a.etat === "anonyme") redirect("/connexion");
  if (a.etat === "aucune") redirect("/refuse");
  if (a.etat === "aal1") redirect("/double-authentification");
  if (a.boutiques.length === 1) redirect(`/gestion/${a.boutiques[0].slug}`);

  return (
    <Porte
      titre="Vos boutiques"
      qui={a.user.email}
      description="Choisissez le backoffice à ouvrir."
      pied={
        <form action="/session/fermer" method="post">
          <button type="submit" className="btn-lien">Se déconnecter</button>
        </form>
      }
    >
      <ul className="carte porte-carte choix-boutiques" role="list">
        {a.boutiques.map((b) => (
          <li key={b.slug}>
            <Link href={`/gestion/${b.slug}`} className="choix-boutique">
              <span className="initiale" aria-hidden="true">{b.nom.trim().charAt(0).toUpperCase()}</span>
              <span className="choix-boutique-texte">
                <span className="font-medium">{b.nom}</span>
                <span className="text-petit discret">{LIBELLES_ROLE[b.role] ?? b.role}</span>
              </span>
              <Icone nom="droite" className="discret" />
            </Link>
          </li>
        ))}
      </ul>
    </Porte>
  );
}
