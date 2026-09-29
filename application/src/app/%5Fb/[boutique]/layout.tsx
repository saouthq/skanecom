import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Young_Serif, IBM_Plex_Sans, IBM_Plex_Sans_Arabic, Reem_Kufi, Archivo } from "next/font/google";
import "../../globals.css";
import { chargeCadre } from "@/lib/boutique";
import { feuilleDuTheme, texte } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";
import { directionDe, localeOgDe, t } from "@/lib/i18n";
import { Entete } from "@/components/Entete";
import { Pied } from "@/components/Pied";

/* ============================================================================
   LE LAYOUT RACINE D'UNE BOUTIQUE

   La façade (src/proxy.ts) a trouvé la boutique à partir du domaine et
   réécrit l'adresse vers /_b/<boutique>/… : ce layout est donc la racine de
   toute page de boutique. Il pose sur <html> la langue et le sens d'écriture
   de la boutique, écrit la balise <style> de son thème (lib/theme.ts) :
   couleurs, polices, rayons, logo — et pose l'en-tête et le pied, communs à
   toutes les pages. Une boutique inconnue ou inactive donne 404.

   Polices : câblées par `next/font` — JAMAIS un @import Google dans le CSS
   (deux chemins de chargement concurrents = texte invisible et décalage de
   mise en page). Seules celles du thème n°1 sont préchargées ; Archivo (thème
   technique) et les familles arabes se chargent à l'usage.
   ========================================================================== */

const youngSerif = Young_Serif({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-young-serif", display: "swap" });
const plexSans = IBM_Plex_Sans({ weight: ["400", "500", "600"], subsets: ["latin", "latin-ext"], variable: "--font-plex-sans", display: "swap" });
const archivo = Archivo({ weight: ["500", "600", "700"], subsets: ["latin", "latin-ext"], variable: "--font-archivo", display: "swap", preload: false });
const plexArabe = IBM_Plex_Sans_Arabic({ weight: ["400", "600"], subsets: ["arabic"], variable: "--font-plex-arabic", display: "swap", preload: false });
const kufi = Reem_Kufi({ subsets: ["arabic"], variable: "--font-reem-kufi", display: "swap", preload: false });

type Props = { children: React.ReactNode; params: Promise<{ boutique: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) return {};
  const { boutique: b, theme } = cadre;
  const titre = texte(theme.textes, "seo_titre") || b.nom;
  const description =
    texte(theme.textes, "seo_description") || texte(theme.textes, "resume") || t.seo.descriptionSite(b.nom);

  return {
    metadataBase: b.hote_principal ? new URL(`https://${b.hote_principal}`) : undefined,
    title: { default: titre, template: t.seo.gabaritTitre(b.nom) },
    description,
    applicationName: b.nom,
    icons: theme.favicon ? { icon: urlFichier(theme.favicon) } : undefined,
    openGraph: { type: "website", siteName: b.nom, locale: localeOgDe(b.langue_defaut), title: titre, description },
    robots: { index: true, follow: true },
  };
}

export default async function RacineBoutique({ children, params }: Props) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) notFound();

  const langue = cadre.boutique.langue_defaut;
  return (
    <html
      lang={langue}
      dir={directionDe(langue)}
      data-boutique={cadre.boutique.slug}
      data-monogramme={cadre.theme.monogramme ? "" : undefined}
      className={`${youngSerif.variable} ${plexSans.variable} ${archivo.variable} ${plexArabe.variable} ${kufi.variable} h-full`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: feuilleDuTheme(cadre.theme, urlFichier) }} />
      </head>
      <body className="min-h-full flex flex-col bg-fond text-encre">
        <a className="saut-contenu" href="#principal">
          {t.commun.sauterAuContenu}
        </a>
        <Entete cadre={cadre} />
        {children}
        <Pied cadre={cadre} />
      </body>
    </html>
  );
}
