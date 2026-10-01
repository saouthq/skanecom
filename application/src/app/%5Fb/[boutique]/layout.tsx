import { FavorisActifs } from "@/components/FavorisActifs";
import { MesureAudience } from "@/components/MesureAudience";
import { PixelsPub } from "@/components/PixelsPub";
import { scriptPixels } from "@/lib/pixels";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../globals.css";
import { chargeCadre } from "@/lib/boutique";
import { attributsDuStyle, feuilleDuTheme, texte } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";
import { directionDe, localeOgDe, t } from "@/lib/i18n";
import { Entete } from "@/components/Entete";
import { Pied } from "@/components/Pied";
import { BoutonWhatsApp } from "@/components/BoutonWhatsApp";
import { BarreComparaison, ComparaisonActive } from "@/components/Comparaison";
import { BarreOnglets } from "@/components/BarreOnglets";
import { Apparitions } from "@/components/Apparitions";
import { TransitionsVue } from "@/components/TransitionsVue";
import { AncresDouces } from "@/components/AncresDouces";
import { Suspense } from "react";
import { ProgressionNavigation } from "@/components/console/Retours";
import { ApercuApparence } from "@/components/ApercuApparence";

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
   composants d'après le même code. Le style réglé à l'écran « Apparence »
   (`data-coins`, `data-boutons`…) est lu par app/apparence.css ; dans le
   cadre d'aperçu du backoffice, ApercuApparence le remplace en direct.

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
    robots: cadre.apercu ? { index: false, follow: false } : { index: true, follow: true },
  };
}

export default async function RacineBoutique({ children, params }: Props) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) notFound();

  const langue = cadre.boutique.langue_defaut;
  // La structure Commerce : la comparaison, la barre d'onglets du téléphone.
  const commerce = cadre.theme.structure === "commerce";
  return (
    <html
      lang={langue}
      dir={directionDe(langue)}
      data-boutique={cadre.boutique.slug}
      data-pro={cadre.comptesPro ? cadre.boutique.id : undefined}
      data-gabarit={cadre.theme.code}
      data-structure={cadre.theme.structure}
      data-monogramme={cadre.theme.monogramme ? "" : undefined}
      {...attributsDuStyle(cadre.theme.style)}
      className="h-full"
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: feuilleDuTheme(cadre.theme, urlFichier) }} />
        {/* Les pixels publicitaires, d'emblée si ce navigateur les a acceptés (lib/pixels.ts). */}
        {cadre.pixels && !cadre.apercu ? <script dangerouslySetInnerHTML={{ __html: scriptPixels(cadre.boutique.slug, cadre.pixels) }} /> : null}
      </head>
      <body className="min-h-full flex flex-col bg-fond text-encre">
        <a className="saut-contenu" href="#principal">
          {t.commun.sauterAuContenu}
        </a>
        {/* Le bandeau des pixels, fixé en bas de l'écran mais premier au clavier : on y répond sans traverser la page. */}
        {cadre.pixels && !cadre.apercu ? <PixelsPub boutique={cadre.boutique.slug} nom={cadre.boutique.nom} pixels={cadre.pixels} /> : null}
        {/* L'aperçu d'un brouillon d'apparence, ouvert hors du backoffice (un téléphone) : il le dit, et s'en sort. */}
        {cadre.apercu ? (
          <p className="bandeau-apercu" role="status">
            <span>{t.apercu.bandeau}</span>
            <a href="/?apercu=fin">{t.apercu.quitter}</a>
          </p>
        ) : null}
        <FavorisActifs actif={cadre.favoris}>
          <ComparaisonActive actif={commerce}>
            <Entete cadre={cadre} />
            {children}
            <Pied cadre={cadre} />
            {commerce ? <BarreComparaison /> : null}
          </ComparaisonActive>
          {commerce ? <BarreOnglets favoris={cadre.favoris} compte={cadre.reglages["compte.obligatoire"] !== false} /> : null}
        </FavorisActifs>
        {cadre.whatsappFlottant && cadre.whatsapp ? <BoutonWhatsApp numero={cadre.whatsapp} nom={cadre.boutique.nom} /> : null}
        {cadre.statistiques && !cadre.apercu ? <MesureAudience /> : null}
        <Apparitions />
        <TransitionsVue />
        <AncresDouces />
        <ApercuApparence code={cadre.theme.code} structure={cadre.theme.structure} />
        <Suspense fallback={null}>
          <ProgressionNavigation />
        </Suspense>
      </body>
    </html>
  );
}
