import type { Metadata } from "next";
import { PageLegale } from "@/components/PageLegale";
import { confidentialite } from "@/components/TextesLegaux";
import { cadre as chargeCadre } from "@/lib/boutique";

/* La politique de confidentialité de la boutique, composée depuis ses
   réglages (components/TextesLegaux.tsx). */

export const revalidate = 300;

export const metadata: Metadata = { title: "Confidentialité" };

export default async function Confidentialite({ params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  const { intro, sections } = confidentialite(cadre);
  return <PageLegale chemin="/confidentialite" titre="Politique de confidentialité" boutique={cadre.boutique.nom} intro={intro} sections={sections} />;
}
