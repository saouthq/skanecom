import type { Metadata } from "next";
import { Gabarit } from "@/components/Gabarit";
import { AccueilEditorial } from "@/components/AccueilEditorial";
import { AccueilTechnique } from "@/components/AccueilTechnique";
import { cadre as chargeCadre } from "@/lib/boutique";
import { listeProduits, type Produit } from "@/lib/catalogue";
import { texte } from "@/lib/theme";

/* ============================================================================
   L'ACCUEIL — composé des SECTIONS du thème de la boutique, dans l'ordre
   qu'elle a choisi (table `themes.sections`, ou les sections par défaut du
   gabarit), rendues par les composants de SON gabarit. Aucun texte de
   marque n'est écrit ici : il vient du thème.

   Chaque section « sélection » a sa propre liste (un rayon, ou tout le
   catalogue), lue en base en parallèle.
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

  const selections = new Map<number, Produit[]>();
  await Promise.all(
    cadre.theme.sections.map(async (s, i) => {
      if (s.type !== "selection") return;
      const liste = await listeProduits(cadre.boutique.id, s.rayon ? { rayon: s.rayon } : {}, "selection", 1, s.nombre ?? 8);
      selections.set(i, liste.produits);
    }),
  );

  return (
    <Gabarit className="flex-1">
      {cadre.theme.code === "technique" ? (
        <div className="enveloppe">
          <AccueilTechnique cadre={cadre} selections={selections} />
        </div>
      ) : (
        <AccueilEditorial cadre={cadre} selections={selections} />
      )}
    </Gabarit>
  );
}
