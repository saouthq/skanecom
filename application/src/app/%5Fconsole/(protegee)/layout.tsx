// La feuille de la console : ici, pas dans le layout racine (voir ../layout.tsx).
import "../feuille.css";
import { exigeAdmin } from "@/lib/console/session";
import { Coquille, LogoSkanEcom } from "@/components/console/Coquille";

/* Toute page sous ce dossier exige un administrateur de la plateforme,
   connecté en double authentification. Ce layout le vérifie pour poser la
   coquille, mais CHAQUE PAGE le revérifie aussi : lors d'une navigation
   côté client, Next peut ne rendre que la page, sans relancer le layout — et
   la page lit les données avec la clé service_role. Les gestionnaires POST
   revérifient eux-mêmes (lib/console/http.ts). */
export default async function ConsoleProtegee({ children }: { children: React.ReactNode }) {
  const { user, role } = await exigeAdmin();
  return (
    <Coquille
      accueil="/"
      titre="SkanEcom"
      sousTitre="Console de la plateforme"
      logo={<LogoSkanEcom />}
      groupes={[
        {
          titre: "Boutiques",
          liens: [
            { href: "/", libelle: "Boutiques", icone: "boutique", exact: true, aussi: ["/boutiques/"] },
            { href: "/tableau", libelle: "Tableau de bord", icone: "graphique" },
            { href: "/nouvelle-boutique", libelle: "Nouvelle boutique", icone: "plus", exact: true },
            { href: "/annonces", libelle: "Annonces", icone: "cloche" },
          ],
        },
        {
          titre: "Plateforme",
          liens: [
            { href: "/formules", libelle: "Formules", icone: "billet" },
            { href: "/modeles", libelle: "Modèles", icone: "ecran" },
            { href: "/courriels", libelle: "E-mails", icone: "courriel" },
            { href: "/equipe-plateforme", libelle: "Équipe SkanEcom", icone: "equipe" },
            { href: "/journal", libelle: "Journal", icone: "journal" },
          ],
        },
      ]}
      email={user.email ?? ""}
      role={role === "super_admin" ? "Super-administrateur" : "Support"}
    >
      {children}
    </Coquille>
  );
}
