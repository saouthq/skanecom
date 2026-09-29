import Link from "next/link";
import { exigeAdmin } from "@/lib/console/session";

/* Toute page sous ce dossier exige un administrateur de la plateforme,
   connecté en double authentification. Ce layout le vérifie pour poser
   l'en-tête, mais CHAQUE PAGE le revérifie aussi : lors d'une navigation
   côté client, Next peut ne rendre que la page, sans relancer le layout — et
   la page lit les données avec la clé service_role. Les gestionnaires POST
   revérifient eux-mêmes (lib/console/http.ts). */
export default async function ConsoleProtegee({ children }: { children: React.ReactNode }) {
  const { user, role } = await exigeAdmin();
  return (
    <>
      <a className="saut-contenu" href="#principal">Aller au contenu</a>
      <header className="console-entete">
        <div className="enveloppe rang">
          <Link href="/" className="font-semibold">SkanEcom · console</Link>
          <nav aria-label="Console">
            <Link href="/">Boutiques</Link>
            <Link href="/nouvelle-boutique">Nouvelle boutique</Link>
          </nav>
          <div className="qui">
            <span>{user.email} · {role === "super_admin" ? "super-administrateur" : "support"}</span>
            <form action="/session/fermer" method="post">
              <button type="submit">Se déconnecter</button>
            </form>
          </div>
        </div>
      </header>
      <main id="principal" className="enveloppe flex-1 py-8">{children}</main>
    </>
  );
}
