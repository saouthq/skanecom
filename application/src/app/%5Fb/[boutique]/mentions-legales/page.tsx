import type { Metadata } from "next";
import { PageLegale } from "@/components/PageLegale";
import { mentionsLegales } from "@/components/TextesLegaux";
import { cadre as chargeCadre } from "@/lib/boutique";

/* Les mentions légales de la boutique, composées depuis ses réglages
   (components/TextesLegaux.tsx). */

export const revalidate = 300;

export const metadata: Metadata = { title: "Mentions légales" };

export default async function MentionsLegales({ params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  const { intro, sections } = mentionsLegales(cadre);
  return <PageLegale chemin="/mentions-legales" titre="Mentions légales" boutique={cadre.boutique.nom} intro={intro} sections={sections} />;
}
