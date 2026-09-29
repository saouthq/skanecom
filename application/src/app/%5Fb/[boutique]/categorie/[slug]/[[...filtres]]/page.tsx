import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Gabarit } from "@/components/Gabarit";
import { Listing } from "@/components/Listing";
import { Fleche } from "@/components/Icones";
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
    <Gabarit cadre={cadre} actif={parent?.slug ?? slug}>
      <nav className="fil pt-4" aria-label={t.commun.filAriane}>
        <Link href="/">{t.commun.accueil}</Link>
        <Fleche taille={14} className="rtl:-scale-x-100" />
        <Link href="/catalogue">{t.commun.toutLeCatalogue}</Link>
        <Fleche taille={14} className="rtl:-scale-x-100" />
        {parent ? (
          <>
            <Link href={`/categorie/${parent.slug}`}>{champ(parent, "nom")}</Link>
            <Fleche taille={14} className="rtl:-scale-x-100" />
          </>
        ) : null}
        <span aria-current="page" className="text-encre">{nom}</span>
      </nav>

      <header className="pt-6 pb-8">
        <p className="etiquette">
          <b>—</b> <span>{t.catalogue.modeles(famille.reduce((n, c) => n + (c.nb_produits ?? 0), 0))}</span>
        </p>
        <h1 className="text-t2 md:text-t1 mt-3">{nom}</h1>
        {champ(categorie, "description") ? <p className="chapo mt-4">{champ(categorie, "description")}</p> : null}
        {sousRayons.length > 0 ? (
          <div className="actifs mt-6">
            {sousRayons.map((c) => (
              <Link key={c.slug} className="puce" href={`/categorie/${c.slug}`}>
                <b>{champ(c, "nom")}</b>
              </Link>
            ))}
          </div>
        ) : null}
      </header>

      <Listing
        liste={liste}
        filtres={f}
        base={base}
        corpus={famille.reduce((n, c) => n + (c.nb_produits ?? 0), 0)}
        avecRayons={false}
      />
    </Gabarit>
  );
}
