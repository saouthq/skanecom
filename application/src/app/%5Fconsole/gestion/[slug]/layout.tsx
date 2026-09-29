import Link from "next/link";
import { exigeMembre } from "@/lib/console/session";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";

/* ============================================================================
   LE BACKOFFICE D'UNE BOUTIQUE — pour son équipe (PRD §6.2), sur téléphone
   autant que sur ordinateur : le père de Skander confirme ses commandes
   entre deux clients, au comptoir.

   Ce layout vérifie le membre pour poser l'en-tête ; chaque page et chaque
   gestionnaire le revérifient (une navigation côté client peut ne rendre
   que la page), et la base, elle, revérifie le rôle à chaque geste.
   ========================================================================== */
export default async function BackofficeBoutique({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, boutique, boutiques } = await exigeMembre(slug);

  return (
    <>
      <a className="saut-contenu" href="#principal">Aller au contenu</a>
      <header className="bo-entete">
        <div className="enveloppe bo-entete-rang">
          <Link href={`/gestion/${slug}`} className="bo-marque">
            <span className="bo-marque-nom">{boutique.nom}</span>
            <span className="bo-marque-sous">Backoffice</span>
          </Link>
          <nav aria-label="Backoffice" className="bo-nav">
            <Link href={`/gestion/${slug}`}>Commandes</Link>
          </nav>
          <div className="bo-qui">
            <span className="bo-qui-compte">
              {user.email} · {LIBELLES_ROLE[boutique.role] ?? boutique.role}
            </span>
            {boutiques.length > 1 ? <Link href="/gestion" className="bo-qui-lien">Changer de boutique</Link> : null}
            <form action="/session/fermer" method="post">
              <button type="submit">Se déconnecter</button>
            </form>
          </div>
        </div>
      </header>
      <main id="principal" className="enveloppe flex-1 bo-page">{children}</main>
    </>
  );
}
