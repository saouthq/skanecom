import type { Metadata } from "next";
import Link from "next/link";
import { Entete } from "@/components/Entete";
import { Pied } from "@/components/Pied";
import { Listing } from "@/components/Listing";
import { Fleche } from "@/components/Icones";
import { chargeCadre } from "@/lib/boutique";
import { chargeCatalogue } from "@/lib/catalogue";
import { litFiltres } from "@/lib/filtres";
import { t } from "@/lib/i18n";

export const revalidate = 300;

export const metadata: Metadata = {
  title: t.catalogue.titre,
  description: t.seo.catalogueDescription,
  alternates: { canonical: "/catalogue" },
};

export default async function Catalogue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [cadre, produits, params] = await Promise.all([
    chargeCadre(),
    chargeCatalogue(),
    searchParams,
  ]);
  const filtres = litFiltres(params);

  return (
    <>
      <a className="saut-contenu" href="#principal">
        {t.commun.sauterAuContenu}
      </a>
      <Entete categories={cadre.categories} actif="catalogue" />

      <main id="principal" className="enveloppe flex-1">
        <nav className="fil pt-4" aria-label={t.commun.filAriane}>
          <Link href="/">{t.commun.accueil}</Link>
          <Fleche taille={14} className="rtl:-scale-x-100" />
          <span aria-current="page" className="text-encre">
            {t.catalogue.titre}
          </span>
        </nav>

        <header className="pt-6 pb-8">
          <p className="etiquette">
            <b>—</b> <span>{t.catalogue.etiquette}</span>
          </p>
          <h1 className="text-t2 md:text-t1 mt-3">{t.catalogue.titre}</h1>
          <p className="chapo mt-4">{t.catalogue.chapo}</p>
        </header>

        <Listing produits={produits} filtres={filtres} action="/catalogue" avecRayons />
      </main>

      <Pied categories={cadre.categories} livraison={cadre.livraison} />
    </>
  );
}
