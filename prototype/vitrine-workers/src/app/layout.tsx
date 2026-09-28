import type { Metadata } from "next";
import { Young_Serif, IBM_Plex_Sans, IBM_Plex_Sans_Arabic, Reem_Kufi } from "next/font/google";
import "./globals.css";
import { DIRECTION, LANGUE_ACTIVE, LOCALE_OG, t } from "@/lib/i18n";

/* Câblage des polices par `next/font` — JAMAIS un @import Google dans le CSS :
   deux chemins de chargement concurrents donnent du texte invisible et un
   décalage de mise en page (charte §9). Les noms de variables sont exactement
   ceux qu'attend docs/brand/tokens.css. */
const display = Young_Serif({
  weight: "400",
  subsets: ["latin", "latin-ext"],
  variable: "--font-young-serif",
  display: "swap",
});

const texte = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-plex-sans",
  display: "swap",
});

/* Les deux familles arabes sont DÉCLARÉES et non préchargées : `preload:false`
   évite de télécharger des fichiers que la v1 française n'affiche jamais. Le
   jour où `dir="rtl"` est posé, tokens.css bascule dessus sans autre geste. */
const arabe = IBM_Plex_Sans_Arabic({
  weight: ["400", "600"],
  subsets: ["arabic"],
  variable: "--font-plex-arabic",
  display: "swap",
  preload: false,
});

const kufi = Reem_Kufi({
  subsets: ["arabic"],
  variable: "--font-reem-kufi",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://maymar.tn"),
  title: { default: t.seo.accueilTitre, template: t.seo.gabaritTitre },
  description: t.seo.descriptionSite,
  applicationName: t.marque.nom,
  icons: { icon: "/marque/favicon.svg" },
  openGraph: {
    type: "website",
    siteName: t.marque.nom,
    locale: LOCALE_OG,
    title: t.seo.accueilTitre,
    description: t.seo.descriptionSite,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={LANGUE_ACTIVE}
      dir={DIRECTION}
      className={`${display.variable} ${texte.variable} ${arabe.variable} ${kufi.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-fond text-encre">{children}</body>
    </html>
  );
}
