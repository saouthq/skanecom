import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Entete } from "@/components/Entete";
import { Pied } from "@/components/Pied";
import { Listing } from "@/components/Listing";
import { Fleche } from "@/components/Icones";
import { chargeCadre } from "@/lib/boutique";
import { chargeCatalogue } from "@/lib/catalogue";
import { litFiltres } from "@/lib/filtres";
import { champ, t } from "@/lib/i18n";

export const revalidate = 300;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const cadre = await chargeCadre();
  const categorie = cadre.categories.find((c) => c.slug === slug);
  if (!categorie) return {};

  const nom = champ(categorie, "nom");
  return {
    title: nom,
    description: champ(categorie, "description") || t.seo.catalogueDescription,
    alternates: { canonical: `/categorie/${slug}` },
    openGraph: { title: nom, description: champ(categorie, "description") || t.seo.catalogueDescription },
  };
}

export default async function Rayon({
  params,
  searchParams,
}: Params & { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, requete, cadre, tout] = await Promise.all([
    params,
    searchParams,
    chargeCadre(),
    chargeCatalogue(),
  ]);

  const categorie = cadre.categories.find((c) => c.slug === slug);
  if (!categorie) notFound();

  const produits = tout.filter((p) => p.categorie?.slug === slug);
  const filtres = litFiltres(requete);
  const nom = champ(categorie, "nom");

  return (
    <>
      <a className="saut-contenu" href="#principal">
        {t.commun.sauterAuContenu}
      </a>
      <Entete categories={cadre.categories} actif={slug} />

      <main id="principal" className="enveloppe flex-1">
        <nav className="fil pt-4" aria-label={t.commun.filAriane}>
          <Link href="/">{t.commun.accueil}</Link>
          <Fleche taille={14} className="rtl:-scale-x-100" />
          <Link href="/catalogue">{t.commun.toutLeCatalogue}</Link>
          <Fleche taille={14} className="rtl:-scale-x-100" />
          <span aria-current="page" className="text-encre">
            {nom}
          </span>
        </nav>

        <header className="pt-6 pb-8">
          <p className="etiquette">
            <b>—</b> <span>{t.catalogue.modeles(produits.length)}</span>
          </p>
          <h1 className="text-t2 md:text-t1 mt-3">{nom}</h1>
          {champ(categorie, "description") ? (
            <p className="chapo mt-4">{champ(categorie, "description")}</p>
          ) : null}
        </header>

        <Listing
          produits={produits}
          filtres={filtres}
          action={`/categorie/${slug}`}
          avecRayons={false}
        />
      </main>

      <Pied categories={cadre.categories} livraison={cadre.livraison} />
    </>
  );
}
