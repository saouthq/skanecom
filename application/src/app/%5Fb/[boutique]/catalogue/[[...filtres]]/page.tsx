import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gabarit } from "@/components/Gabarit";
import { Listing } from "@/components/Listing";
import { Fleche } from "@/components/Icones";
import { cadre as chargeCadre } from "@/lib/boutique";
import { listeProduits } from "@/lib/catalogue";
import { cheminFiltres, estCanonique, litSegments, nombreFiltresActifs, versCriteres } from "@/lib/filtres";
import { t } from "@/lib/i18n";

/* Tout le catalogue, filtres dans le chemin (lib/filtres.ts) : chaque liste
   filtrée est une page mise en cache, servie même pendant une panne de la base. */
export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ boutique: string; filtres?: string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { boutique, filtres } = await params;
  const cadre = await chargeCadre(boutique);
  const f = litSegments(filtres);
  return {
    title: t.catalogue.titre,
    description: t.seo.catalogueDescription(cadre.boutique.nom),
    alternates: { canonical: cheminFiltres("/catalogue", f) },
    // Une liste filtrée se partage, elle ne s'indexe pas : Google n'a besoin
    // que du catalogue et de ses pages.
    ...(nombreFiltresActifs(f) > 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function Catalogue({ params }: Params) {
  const { boutique, filtres } = await params;
  const f = litSegments(filtres);
  if (!estCanonique("/catalogue", filtres, f)) redirect(cheminFiltres("/catalogue", f));

  const cadre = await chargeCadre(boutique);
  const liste = await listeProduits(cadre.boutique.id, versCriteres(f), f.tri, f.page);

  return (
    <Gabarit>
      <nav className="fil pt-4" aria-label={t.commun.filAriane}>
        <Link href="/">{t.commun.accueil}</Link>
        <Fleche taille={14} className="rtl:-scale-x-100" />
        <span aria-current="page" className="text-encre">{t.catalogue.titre}</span>
      </nav>

      <header className="pt-6 pb-8">
        <p className="etiquette">
          <b>—</b> <span>{t.catalogue.etiquette}</span>
        </p>
        <h1 className="text-t2 md:text-t1 mt-3">{t.catalogue.titre}</h1>
        <p className="chapo mt-4">{t.catalogue.chapo}</p>
      </header>

      <Listing liste={liste} filtres={f} base="/catalogue" corpus={cadre.boutique.nb_produits} avecRayons />
    </Gabarit>
  );
}
