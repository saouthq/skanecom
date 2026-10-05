import type { Metadata } from "next";
import "../globals.css";
/* La feuille de la console (feuille.css : console.css, ses finitions, son
   mouvement) n'est PAS importée ici : le CSS des deux layouts racines
   (vitrine et console) part dans une seule feuille, que chaque page de
   vitrine chargeait avec ces ~75 Ko de console dedans. Chaque entrée
   l'importe elle-même, en direct depuis son fichier (un module
   intermédiaire sans composant n'est pas relié à la page) : la coquille
   protégée et les pages de la porte (connexion, double authentification,
   bienvenue, refus) ; le backoffice, en tête de gestion.css (importée à
   côté, elle partirait dans une feuille chargée APRÈS celle du backoffice).
   Une nouvelle page hors de ces dossiers doit l'importer aussi. */
import { Suspense } from "react";
import { EnvoiFormulaires, ProgressionNavigation } from "@/components/console/Retours";
import { FermeConfirmations } from "@/components/console/FermeConfirmations";
import { EnvoiAuChangement } from "@/components/console/EnvoiAuChangement";
import { BordsOnglets } from "@/components/console/BordsOnglets";
import { AncresDouces } from "@/components/AncresDouces";
import { feuilleDuTheme, themeDeLaBoutique } from "@/lib/theme";

/* ============================================================================
   LA CONSOLE SKANECOM — racine (PRD §6.1). Outil interne de Skander et de son
   père : mettre une boutique en place, du domaine au catalogue.

   Son interface à elle (console.css : Inter, neutres froids, barre latérale)
   habille les mêmes classes que la vitrine (boutons, champs) : on sait
   toujours si l'on regarde un outil ou une boutique. Jamais en cache, jamais
   indexée (le proxy pose les en-têtes).
   ========================================================================== */

/* Toutes les familles sont déclarées (app/polices.css) : l'aperçu de la
   marque montre celles qu'une boutique peut choisir. Aucune n'est chargée
   avant d'être employée. La console ne pose pas `data-gabarit` : elle ne
   prend que le socle commun (socle.css). */
const THEME_CONSOLE = themeDeLaBoutique({
  code: "technique",
  polices: { titres: "plex-sans", texte: "plex-sans" },
  couleurs: {
    fond: "#F6F6F7", surface: "#FFFFFF", surface_2: "#F4F4F5", filet: "#E4E4E7", filet_fort: "#D4D4D8",
    contour_champ: "#8E8E98", encre: "#18181B", encre_doux: "#52525B", accent: "#4F46E5", accent_clair: "#A5B4FC",
    succes: "#15803D", erreur: "#B91C1C", alerte: "#B45309",
  },
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Console SkanEcom", template: "%s · Console SkanEcom" },
  robots: { index: false, follow: false },
  icons: { icon: { url: "/favicon.ico", type: "image/svg+xml" } },
};

export default function RacineConsole({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" dir="ltr" className="h-full">
      <head>
        <style dangerouslySetInnerHTML={{ __html: feuilleDuTheme(THEME_CONSOLE, (c) => c) }} />
      </head>
      <body className="console min-h-full flex flex-col bg-fond text-encre">
        <Suspense fallback={null}><ProgressionNavigation /></Suspense>
        <EnvoiFormulaires />
        <FermeConfirmations />
        <EnvoiAuChangement />
        <BordsOnglets />
        <AncresDouces />
        {children}
      </body>
    </html>
  );
}
