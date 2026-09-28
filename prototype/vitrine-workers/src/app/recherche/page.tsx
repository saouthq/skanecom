import type { Metadata } from "next";
import Link from "next/link";
import { Entete } from "@/components/Entete";
import { Pied } from "@/components/Pied";
import { CarteProduit } from "@/components/CarteProduit";
import { Fleche, Loupe } from "@/components/Icones";
import { chargeCadre } from "@/lib/boutique";
import { nettoieRequete, recherche } from "@/lib/catalogue";
import { t } from "@/lib/i18n";

export const revalidate = 300;

export const metadata: Metadata = {
  title: t.seo.rechercheTitre,
  description: t.seo.catalogueDescription,
  alternates: { canonical: "/recherche" },
  // Une page de résultats n'a rien à faire dans l'index : elle n'existe que
  // pour le visiteur, et Google la lirait comme du contenu dupliqué.
  robots: { index: false, follow: true },
};

export default async function Recherche({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, cadre] = await Promise.all([searchParams, chargeCadre()]);
  const requete = nettoieRequete(q ?? "");
  const resultats = requete.length >= 2 ? await recherche(requete) : [];

  return (
    <>
      <a className="saut-contenu" href="#principal">
        {t.commun.sauterAuContenu}
      </a>
      <Entete categories={cadre.categories} />

      <main id="principal" className="enveloppe flex-1">
        <nav className="fil pt-4" aria-label={t.commun.filAriane}>
          <Link href="/">{t.commun.accueil}</Link>
          <Fleche taille={14} className="rtl:-scale-x-100" />
          <span aria-current="page" className="text-encre">
            {t.recherche.titre}
          </span>
        </nav>

        <header className="pt-6 pb-8">
          <h1 className="text-t2 md:text-t1">{t.recherche.titre}</h1>

          <form action="/recherche" method="get" className="flex flex-wrap gap-3 mt-6 max-w-[36rem]">
            <div className="champ flex-1 min-w-[16rem]">
              <label htmlFor="q" className="sr-only">
                {t.recherche.champAria}
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={q ?? ""}
                placeholder={t.recherche.placeholder}
                autoComplete="off"
              />
            </div>
            <button type="submit" className="btn btn-primaire">
              <Loupe taille={18} />
              {t.recherche.lancer}
            </button>
          </form>

          <p className="text-petit text-encre-doux mt-4">
            {requete.length >= 2 ? t.recherche.resultats(resultats.length, requete) : t.recherche.invite}
          </p>
        </header>

        {resultats.length > 0 ? (
          <div className="grille-produits pb-12">
            {resultats.map((p) => (
              <CarteProduit key={p.id} produit={p} />
            ))}
          </div>
        ) : requete.length >= 2 ? (
          <div className="border border-filet rounded-carte bg-surface p-8 mb-12">
            <p className="text-petit text-encre-doux max-w-[46ch]">{t.recherche.videTexte}</p>
            <Link className="btn btn-second mt-6" href="/catalogue">
              {t.commun.voirLeCatalogue}
            </Link>
          </div>
        ) : null}
      </main>

      <Pied categories={cadre.categories} livraison={cadre.livraison} />
    </>
  );
}
