import type { Metadata } from "next";
import Link from "next/link";
import { Gabarit } from "@/components/Gabarit";
import { CarteProduit } from "@/components/CarteProduit";
import { Fleche, Loupe } from "@/components/Icones";
import { cadre as chargeCadre } from "@/lib/boutique";
import { listeProduits } from "@/lib/catalogue";
import { t } from "@/lib/i18n";

/* La recherche lit son terme dans l'adresse (`?q=`) : c'est la seule page de
   la vitrine qui n'est pas mise en cache. Elle cherche en base (nom, marque,
   description, référence, fautes de frappe comprises : public.liste_produits). */

export const metadata: Metadata = {
  title: t.seo.rechercheTitre,
  robots: { index: false, follow: true },
};

export default async function Recherche({
  params,
  searchParams,
}: {
  params: Promise<{ boutique: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ boutique }, { q }] = await Promise.all([params, searchParams]);
  const cadre = await chargeCadre(boutique);
  const requete = (q ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const liste = requete.length >= 2 ? await listeProduits(cadre.boutique.id, { q: requete }, "pertinence", 1, 48) : null;
  const n = liste?.total ?? 0;

  return (
    <Gabarit>
      <nav className="fil pt-4" aria-label={t.commun.filAriane}>
        <Link href="/">{t.commun.accueil}</Link>
        <Fleche taille={14} className="rtl:-scale-x-100" />
        <span aria-current="page" className="text-encre">{t.recherche.titre}</span>
      </nav>

      <header className="pt-6 pb-8">
        <h1 className="text-t2 md:text-t1">{t.recherche.titre}</h1>

        <form action="/recherche" method="get" className="flex flex-wrap gap-3 mt-6 max-w-[36rem]">
          <div className="champ flex-1 min-w-[16rem]">
            <label htmlFor="q" className="sr-only">{t.recherche.champAria}</label>
            <input id="q" name="q" type="search" defaultValue={requete} placeholder={t.recherche.placeholder} autoComplete="off" />
          </div>
          <button type="submit" className="btn btn-primaire">
            <Loupe taille={18} />
            {t.recherche.lancer}
          </button>
        </form>

        <p className="text-petit text-encre-doux mt-4">
          {liste ? t.recherche.resultats(n, requete) : t.recherche.invite}
        </p>
      </header>

      {liste && liste.produits.length > 0 ? (
        <div className="grille-produits pb-12">
          {liste.produits.map((p) => (
            <CarteProduit key={p.id} produit={p} />
          ))}
        </div>
      ) : liste ? (
        <div className="border border-filet rounded-carte bg-surface p-8 mb-12">
          <p className="text-petit text-encre-doux max-w-[46ch]">{t.recherche.videTexte}</p>
          <Link className="btn btn-second mt-6" href="/catalogue">{t.commun.voirLeCatalogue}</Link>
        </div>
      ) : null}
    </Gabarit>
  );
}
