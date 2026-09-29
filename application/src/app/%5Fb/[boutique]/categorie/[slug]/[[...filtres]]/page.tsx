import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Gabarit } from "@/components/Gabarit";
import { Listing } from "@/components/Listing";
import { EnteteListe } from "@/components/EnteteListe";
import { cadre as chargeCadre, descendance } from "@/lib/boutique";
import { listeProduits } from "@/lib/catalogue";
import { cheminFiltres, estCanonique, litSegments, nombreFiltresActifs, versCriteres } from "@/lib/filtres";
import { champ, t } from "@/lib/i18n";

/* Un rayon, ses sous-rayons compris (rayons profonds de la quincaillerie :
   Plomberie › Raccords › Laiton). Filtres dans le chemin, comme le catalogue. */
export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ boutique: string; slug: string; filtres?: string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { boutique, slug, filtres } = await params;
  const cadre = await chargeCadre(boutique);
  const categorie = cadre.categories.find((c) => c.slug === slug);
  if (!categorie) return {};
  const f = litSegments(filtres);
  return {
    title: champ(categorie, "nom"),
    description: champ(categorie, "description") || t.seo.catalogueDescription(cadre.boutique.nom),
    alternates: { canonical: cheminFiltres(`/categorie/${slug}`, f) },
    ...(nombreFiltresActifs(f) > 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function Rayon({ params }: Params) {
  const { boutique, slug, filtres } = await params;
  const base = `/categorie/${slug}`;
  const f = litSegments(filtres);
  if (!estCanonique(base, filtres, f)) redirect(cheminFiltres(base, f));

  const cadre = await chargeCadre(boutique);
  const categorie = cadre.categories.find((c) => c.slug === slug);
  if (!categorie) notFound();

  const famille = descendance(cadre.categories, slug);
  const sousRayons = cadre.categories.filter((c) => c.parent_id === categorie.id);
  const parent = cadre.categories.find((c) => c.id === categorie.parent_id);
  const liste = await listeProduits(cadre.boutique.id, versCriteres(f, slug), f.tri, f.page);
  const nom = champ(categorie, "nom");

  return (
    <Gabarit>
      <EnteteListe
        gabarit={cadre.theme.code}
        fil={[
          { nom: t.commun.toutLeCatalogue, href: "/catalogue" },
          ...(parent ? [{ nom: champ(parent, "nom"), href: `/categorie/${parent.slug}` }] : []),
          { nom },
        ]}
        titre={nom}
        chapo={champ(categorie, "description")}
        sousRayons={sousRayons.map((c) => ({
          slug: c.slug,
          nom: champ(c, "nom"),
          compte: descendance(cadre.categories, c.slug).reduce((n, d) => n + (d.nb_produits ?? 0), 0),
        }))}
      />
      <Listing
        liste={liste}
        filtres={f}
        base={base}
        corpus={famille.reduce((n, c) => n + (c.nb_produits ?? 0), 0)}
        avecRayons={false}
        gabarit={cadre.theme.code}
        prixBarres={cadre.prixBarres}
      />
    </Gabarit>
  );
}
