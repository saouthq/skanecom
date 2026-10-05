// La feuille de la console : ici, pas dans le layout racine (voir ../layout.tsx).
import "../feuille.css";
import { exigeAdmin } from "@/lib/console/session";
import { Coquille, LogoSkanEcom } from "@/components/console/Coquille";
import { chargeAccueil } from "@/lib/console/accueil-serveur";
import { compteAlertes } from "@/lib/console/accueil";
import { clientService } from "@/lib/console/service";
import { aRelancer, type Prospect } from "@/lib/console/prospects";
import { OuvrirPalette, Palette } from "@/components/console/Palette";
import type { ElementPalette } from "@/lib/gestion/palette";

/** La palette (Ctrl+K) : les pages et les gestes de la console, puis ce que la recherche trouve. */
const PAGES: ElementPalette[] = [
  { groupe: "Aller à", icone: "boutique", href: "/", titre: "Boutiques" },
  { groupe: "Aller à", icone: "plus", href: "/nouvelle-boutique", titre: "Nouvelle boutique" },
  { groupe: "Aller à", icone: "graphique", href: "/tableau", titre: "Tableau de bord" },
  { groupe: "Aller à", icone: "tendance", href: "/revenus", titre: "Revenus" },
  { groupe: "Aller à", icone: "billet", href: "/formules", titre: "Formules" },
  { groupe: "Aller à", icone: "ecran", href: "/modeles", titre: "Modèles" },
  { groupe: "Aller à", icone: "personne", href: "/prospects", titre: "Prospects" },
  { groupe: "Aller à", icone: "plus", href: "/prospects#nouveau", titre: "Nouveau prospect" },
  { groupe: "Aller à", icone: "cloche", href: "/annonces", titre: "Annonces" },
  { groupe: "Aller à", icone: "courriel", href: "/courriels", titre: "E-mails" },
  { groupe: "Aller à", icone: "equipe", href: "/equipe-plateforme", titre: "Équipe SkanEcom" },
  { groupe: "Aller à", icone: "journal", href: "/journal", titre: "Journal" },
  { groupe: "Aller à", icone: "courriel", href: "/journal?vue=envois", titre: "Journal des envois" },
  { groupe: "Aller à", icone: "outil", href: "/etat", titre: "État technique" },
  { groupe: "Aller à", icone: "personne", href: "/compte", titre: "Mon compte" },
];

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
  // Le compteur de « Prospects » : ceux à relancer aujourd'hui ou en retard.
  const relances = await clientService().rpc("console_prospects", { p_acteur: user.id })
    .then(({ data }) => aRelancer((data ?? []) as Prospect[]), () => 0);
  const badgeProspects = relances ? (
    <span className="app-nav-compte" aria-label={`${relances} prospect${relances > 1 ? "s" : ""} à relancer`}>{relances}</span>
  ) : undefined;
  return (
    <Coquille
      accueil="/"
      titre="SkanEcom"
      sousTitre="Console de la plateforme"
      logo={<LogoSkanEcom />}
      recherche={<OuvrirPalette />}
      rechercheCompacte={<OuvrirPalette compact />}
      palette={<Palette source="/recherche" pages={PAGES} invite="Une boutique, un client, un prospect, une page…" />}
      // Rangée par usage ; « Nouvelle boutique » est un bouton de l'accueil, pas une rubrique.
      groupes={[
        {
          titre: "Piloter",
          liens: [
            { href: "/", libelle: "Boutiques", icone: "boutique", exact: true, aussi: ["/boutiques/", "/nouvelle-boutique"], extra: badge },
            { href: "/tableau", libelle: "Tableau de bord", icone: "graphique" },
            { href: "/revenus", libelle: "Revenus", icone: "tendance" },
          ],
        },
        {
          titre: "Offre",
          liens: [
            { href: "/formules", libelle: "Formules", icone: "billet" },
            { href: "/modeles", libelle: "Modèles", icone: "ecran" },
            { href: "/prospects", libelle: "Prospects", icone: "personne", extra: badgeProspects },
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
            { href: "/etat", libelle: "État technique", icone: "outil" },
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
