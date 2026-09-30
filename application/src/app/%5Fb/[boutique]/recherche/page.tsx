import type { Metadata } from "next";
import Link from "next/link";
import { Gabarit } from "@/components/Gabarit";
import { CarteProduit } from "@/components/CarteProduit";
import { EnteteListe } from "@/components/EnteteListe";
import { ChampRecherche } from "@/components/ChampRecherche";
import { Loupe } from "@/components/Icones";
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
  const gabarit = cadre.theme.code;

  return (
    <Gabarit>
      <EnteteListe gabarit={gabarit} fil={[{ nom: t.recherche.titre }]} titre={t.recherche.titre}>
        <form action="/recherche" method="get" role="search" className="recherche-page">
          <label htmlFor="q" className="sr-only">
            {t.recherche.champAria}
          </label>
          <span className="recherche-page-champ">
            <ChampRecherche id="q" defaultValue={requete} placeholder={t.recherche.placeholder} />
          </span>
          <button type="submit" className="btn btn-primaire">
            <Loupe taille={18} />
            {t.recherche.lancer}
          </button>
        </form>
        <p className="recherche-bilan" aria-live="polite">
          {liste ? t.recherche.resultats(n, requete) : t.recherche.invite}
        </p>
      </EnteteListe>

      {liste && liste.produits.length > 0 ? (
        <div className={`${gabarit === "technique" ? "te-grille" : "ed-grille"} recherche-resultats`}>
          {liste.produits.map((p, i) => (
            <CarteProduit key={p.id} produit={p} gabarit={gabarit} prixBarres={cadre.prixBarres} prioritaire={i < 4} />
          ))}
        </div>
      ) : liste ? (
        <div className="listing-vide">
          <p>{t.recherche.videTexte}</p>
          <Link className="btn btn-second" href="/catalogue">
            {t.commun.voirLeCatalogue}
          </Link>
        </div>
      ) : null}
    </Gabarit>
  );
}
