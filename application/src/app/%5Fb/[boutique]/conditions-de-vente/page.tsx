import type { Metadata } from "next";
import { PageLegale } from "@/components/PageLegale";
import { conditionsDeVente } from "@/components/TextesLegaux";
import { cadre as chargeCadre } from "@/lib/boutique";

/* Les conditions de vente de la boutique, composées depuis ses réglages
   (components/TextesLegaux.tsx). */

export const revalidate = 300;

export const metadata: Metadata = { title: "Conditions de vente" };

export default async function ConditionsDeVente({ params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  const { intro, sections } = conditionsDeVente(cadre);
  return <PageLegale chemin="/conditions-de-vente" titre="Conditions de vente" boutique={cadre.boutique.nom} intro={intro} sections={sections} />;
}
