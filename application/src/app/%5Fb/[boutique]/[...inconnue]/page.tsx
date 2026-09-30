import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gabarit } from "@/components/Gabarit";
import { PageContenu } from "@/components/PageContenu";
import { cadre as chargeCadre } from "@/lib/boutique";
import { chargePage, resumePage } from "@/lib/pages";
import { champ } from "@/lib/i18n";

/* ============================================================================
   TOUTE AUTRE ADRESSE D'UNE BOUTIQUE — une page qu'elle a écrite au
   backoffice (« /a-propos », « /questions »…), publiée ; sinon sa page
   introuvable (not-found.tsx, à ses couleurs, avec la recherche), et non
   celle du framework — en anglais, sans en-tête ni sortie.

   Une route attrape-tout a la priorité la plus basse : elle ne prend que ce
   qu'aucune autre ne sert. Mise en cache comme les autres pages (cinq
   minutes) : `generateStaticParams` vide l'y autorise.
   ========================================================================== */

export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ boutique: string; inconnue: string[] }> };

async function laPage({ params }: Params) {
  const { boutique, inconnue } = await params;
  if (inconnue.length !== 1) return null;
  const cadre = await chargeCadre(boutique);
  const page = await chargePage(cadre.boutique.id, inconnue[0]);
  return page ? { cadre, page } : null;
}

export async function generateMetadata(p: Params): Promise<Metadata> {
  const trouvee = await laPage(p);
  if (!trouvee) return {};
  const { page } = trouvee;
  const description = resumePage(champ(page, "corps"));
  return {
    title: champ(page, "titre"),
    ...(description ? { description } : {}),
    alternates: { canonical: `/${page.slug}` },
  };
}

export default async function PageOuAdresseInconnue(p: Params) {
  const trouvee = await laPage(p);
  if (!trouvee) notFound();
  return (
    <Gabarit className="enveloppe flex-1">
      <PageContenu cadre={trouvee.cadre} page={trouvee.page} />
    </Gabarit>
  );
}
