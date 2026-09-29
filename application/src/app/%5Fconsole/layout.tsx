import type { Metadata } from "next";
import { Archivo, IBM_Plex_Sans, Young_Serif } from "next/font/google";
import "../globals.css";
import "./console.css";
import { feuilleDuTheme, themeDeLaBoutique } from "@/lib/theme";

/* ============================================================================
   LA CONSOLE SKANECOM — racine (PRD §6.1). Outil interne de Skander et de son
   père : mettre une boutique en place, du domaine au catalogue.

   Elle réemploie les styles de la vitrine (boutons, champs, jetons), habillés
   d'une palette à elle : on sait toujours si l'on regarde la console ou une
   boutique. Jamais en cache, jamais indexée (le proxy pose les en-têtes).
   ========================================================================== */

const plexSans = IBM_Plex_Sans({ weight: ["400", "500", "600"], subsets: ["latin", "latin-ext"], variable: "--font-plex-sans", display: "swap" });
// Pour l'aperçu de la marque : les polices de titres qu'une boutique peut choisir.
const youngSerif = Young_Serif({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-young-serif", display: "swap", preload: false });
const archivo = Archivo({ weight: ["500", "600", "700"], subsets: ["latin", "latin-ext"], variable: "--font-archivo", display: "swap", preload: false });

const THEME_CONSOLE = themeDeLaBoutique({
  code: "catalogue_technique",
  polices: { titres: "plex-sans" },
  couleurs: {
    fond: "#F4F5F7", surface: "#FFFFFF", surface_2: "#ECEEF2", filet: "#DCE0E6", filet_fort: "#B6BDC8",
    contour_champ: "#8792A2", encre: "#121826", encre_doux: "#4A5568", accent: "#1E4FD8", accent_clair: "#6E8FF0",
    succes: "#17693A", erreur: "#B42318", alerte: "#8A5A00",
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
    <html lang="fr" dir="ltr" className={`${plexSans.variable} ${youngSerif.variable} ${archivo.variable} h-full`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: feuilleDuTheme(THEME_CONSOLE, (c) => c) }} />
      </head>
      <body className="console min-h-full flex flex-col bg-fond text-encre">{children}</body>
    </html>
  );
}
