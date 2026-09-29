import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { accesEquipe } from "@/lib/console/session";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";

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
    <main id="principal" className="flex-1 grid place-items-center px-4 py-12">
      <div className="w-full max-w-[32rem]">
        <p className="text-petit text-encre-doux">{a.user.email}</p>
        <h1 className="mt-1">Vos boutiques</h1>
        <ul className="bo-choix mt-6">
          {a.boutiques.map((b) => (
            <li key={b.slug}>
              <Link href={`/gestion/${b.slug}`} className="carte bo-choix-lien">
                <span className="font-semibold">{b.nom}</span>
                <span className="text-petit text-encre-doux">{LIBELLES_ROLE[b.role] ?? b.role}</span>
              </Link>
            </li>
          ))}
        </ul>
        <form action="/session/fermer" method="post" className="mt-6 text-center">
          <button type="submit" className="btn-lien text-petit">Se déconnecter</button>
        </form>
      </div>
    </main>
  );
}
