// La feuille de la console : ici, pas dans le layout racine (voir ../layout.tsx).
import "../feuille.css";
import { exigeAdmin } from "@/lib/console/session";
import { Coquille, LogoSkanEcom } from "@/components/console/Coquille";
import { chargeAccueil } from "@/lib/console/accueil-serveur";
import { compteAlertes } from "@/lib/console/accueil";

/* Toute page sous ce dossier exige un administrateur de la plateforme,
   connecté en double authentification. Ce layout le vérifie pour poser la
   coquille, mais CHAQUE PAGE le revérifie aussi : lors d'une navigation
   côté client, Next peut ne rendre que la page, sans relancer le layout — et
   la page lit les données avec la clé service_role. Les gestionnaires POST
   revérifient eux-mêmes (lib/console/http.ts). */
export default async function ConsoleProtegee({ children }: { children: React.ReactNode }) {
  const { user, role } = await exigeAdmin();
  // Le compteur de « Boutiques » : ce qui presse dans « À surveiller » (hors
  // reporté), rouge s'il y a de l'urgent. Illisible : pas de compteur, la page s'ouvre.
  const alertes = await chargeAccueil(user.id).then((a) => compteAlertes(a.pressants), () => null);
  const badge = alertes?.n ? (
    <span className="app-nav-compte" data-urgent={alertes.urgent ? "" : undefined} aria-label={`${alertes.n} point${alertes.n > 1 ? "s" : ""} à surveiller`}>{alertes.n}</span>
  ) : undefined;
  return (
    <Coquille
      accueil="/"
      titre="SkanEcom"
      sousTitre="Console de la plateforme"
      logo={<LogoSkanEcom />}
      // Rangée par usage ; « Nouvelle boutique » est un bouton de l'accueil, pas une rubrique.
      groupes={[
        {
          titre: "Piloter",
          liens: [
            { href: "/", libelle: "Boutiques", icone: "boutique", exact: true, aussi: ["/boutiques/", "/nouvelle-boutique"], extra: badge },
            { href: "/tableau", libelle: "Tableau de bord", icone: "graphique" },
          ],
        },
        {
          titre: "Offre",
          liens: [
            { href: "/formules", libelle: "Formules", icone: "billet" },
            { href: "/modeles", libelle: "Modèles", icone: "ecran" },
          ],
        },
        {
          titre: "Communiquer",
          liens: [
            { href: "/annonces", libelle: "Annonces", icone: "cloche" },
            { href: "/courriels", libelle: "E-mails", icone: "courriel" },
          ],
        },
        {
          titre: "Administrer",
          liens: [
            { href: "/equipe-plateforme", libelle: "Équipe SkanEcom", icone: "equipe" },
            { href: "/journal", libelle: "Journal", icone: "journal" },
          ],
        },
      ]}
      email={user.email ?? ""}
      compte="/compte"
      role={role === "super_admin" ? "Super-administrateur" : "Support"}
    >
      {children}
    </Coquille>
  );
}
