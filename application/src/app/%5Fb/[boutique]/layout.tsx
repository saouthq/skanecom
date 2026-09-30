import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../globals.css";
import { chargeCadre } from "@/lib/boutique";
import { feuilleDuTheme, texte } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";
import { directionDe, localeOgDe, t } from "@/lib/i18n";
import { Entete } from "@/components/Entete";
import { Pied } from "@/components/Pied";
import { Apparitions } from "@/components/Apparitions";
import { Suspense } from "react";
import { ProgressionNavigation } from "@/components/console/Retours";

/* ============================================================================
   LE LAYOUT RACINE D'UNE BOUTIQUE

   La façade (src/proxy.ts) a trouvé la boutique à partir du domaine et
   réécrit l'adresse vers /_b/<boutique>/… : ce layout est donc la racine de
   toute page de boutique. Il pose sur <html> la langue et le sens d'écriture
   de la boutique, écrit la balise <style> de son thème (lib/theme.ts) :
   couleurs, polices, rayons, logo — et pose l'en-tête et le pied, communs à
   toutes les pages. Une boutique inconnue ou inactive donne 404.

   `data-gabarit` sur <html> choisit la feuille du gabarit (editorial.css ou
   technique.css) ; l'en-tête, le pied et les pages choisissent leurs
   composants d'après le même code.

   Polices : servies par l'application (app/polices.css, @fontsource),
   jamais par Google ; chaque famille ne se charge que si le thème l'emploie.
   ========================================================================== */

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
      data-gabarit={cadre.theme.code}
      data-monogramme={cadre.theme.monogramme ? "" : undefined}
      className="h-full"
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
        <Apparitions />
        <Suspense fallback={null}>
          <ProgressionNavigation />
        </Suspense>
      </body>
    </html>
  );
}
