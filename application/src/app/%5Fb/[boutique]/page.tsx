import type { Metadata } from "next";
import { Gabarit } from "@/components/Gabarit";
import { AccueilEditorial } from "@/components/AccueilEditorial";
import { AccueilTechnique } from "@/components/AccueilTechnique";
import { AccueilBento } from "@/components/AccueilBento";
import { AccueilImmersif } from "@/components/AccueilImmersif";
import { cadre as chargeCadre } from "@/lib/boutique";
import { donneesAccueil } from "@/lib/accueil";
import { texte } from "@/lib/theme";

/* ============================================================================
   L'ACCUEIL — composé des SECTIONS du thème de la boutique, dans l'ordre
   qu'elle a choisi (table `themes.sections`, ou les sections par défaut du
   gabarit), rendues par les composants de SON gabarit. Aucun texte de
   marque n'est écrit ici : il vient du thème.

   Chaque section « sélection » a sa propre liste (un rayon, ou tout le
   catalogue, dans l'ordre choisi) ; les avis, les questions et les marques
   (la bibliothèque, migration 59) sont lus avec elles, en parallèle.
   ========================================================================== */

export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ boutique: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  const titre = texte(cadre.theme.textes, "seo_titre") || cadre.boutique.nom;
  return { title: { absolute: titre }, alternates: { canonical: "/" } };
}

export default async function Accueil({ params }: Params) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);

  const donnees = await donneesAccueil(cadre);

  return (
    <Gabarit className="flex-1">
      {cadre.theme.code === "technique" ? (
        <div className="enveloppe">
          <AccueilTechnique cadre={cadre} donnees={donnees} />
        </div>
      ) : cadre.theme.structure === "bento" ? (
        <AccueilBento cadre={cadre} donnees={donnees} />
      ) : cadre.theme.structure === "immersif" ? (
        <AccueilImmersif cadre={cadre} donnees={donnees} />
      ) : (
        <AccueilEditorial cadre={cadre} donnees={donnees} />
      )}
    </Gabarit>
  );
}
