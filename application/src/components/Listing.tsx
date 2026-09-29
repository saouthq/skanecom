import Link from "next/link";
import { CarteProduit } from "./CarteProduit";
import { FormulaireFiltres } from "./Filtres";
import { FeuilleFiltres } from "./FeuilleFiltres";
import { SelecteurTri } from "./SelecteurTri";
import { Croix } from "./Icones";
import { t } from "@/lib/i18n";
import { cheminFiltres, nombreFiltresActifs, puces, type Filtres } from "@/lib/filtres";
import type { Liste } from "@/lib/catalogue";
import type { CodeTheme } from "@/lib/theme";

/* ============================================================================
   LE LISTING — partagé par « tout le catalogue » et par chaque rayon.

   La liste arrive filtrée, triée et paginée par la base
   (public.liste_produits) : tous les nombres affichés (compte de résultats,
   compteur par option, bornes de prix) en viennent.

   Deux dispositions :
   · ÉDITORIALE — la grille prend toute la largeur ; les filtres vivent dans
     un tiroir (« Filtrer »), comme chez les maisons de mode ;
   · TECHNIQUE — colonne de filtres permanente sur grand écran (on affine
     beaucoup : tension, conditionnement, dimension), tiroir sur téléphone.
   ========================================================================== */

export function Listing({
  liste,
  filtres,
  base,
  corpus,
  avecRayons,
  gabarit,
  prixBarres = false,
}: {
  liste: Liste;
  filtres: Filtres;
  /** L'adresse de la liste sans filtres — cible des formulaires et des puces. */
  base: string;
  /** Nombre de produits de la liste sans aucun filtre (rayon ou catalogue). */
  corpus: number;
  avecRayons: boolean;
  gabarit: CodeTheme;
  prixBarres?: boolean;
}) {
  const actifs = nombreFiltresActifs(filtres);
  const pages = Math.max(1, Math.ceil(liste.total / liste.par_page));
  const lesPuces = puces(base, filtres, { enStock: t.stock.enStock, prix: t.catalogue.prixEntre });
  const technique = gabarit === "technique";

  const formulaire = (prefixe: string) => (
    <FormulaireFiltres base={base} facettes={liste.facettes} valeurs={filtres} prefixe={prefixe} avecRayons={avecRayons} resultats={liste.total} />
  );

  /* Rien à filtrer : la boutique (ou le rayon) n'a encore aucune pièce
     publiée. Ni filtres ni tri — parler de filtres serait faux. */
  if (corpus === 0) {
    return (
      <div className="listing-vide">
        <h2>{t.accueil.selectionVideTitre}</h2>
        <p>{t.accueil.selectionVide}</p>
      </div>
    );
  }

  return (
    <div className={technique ? "te-listing" : "ed-listing"}>
      {technique ? (
        <aside className="te-filtres cache-mobile" aria-label={t.catalogue.filtres}>
          <p className="te-filtres-titre">{t.catalogue.affiner}</p>
          {formulaire("bureau")}
        </aside>
      ) : null}

      <section className="listing-corps" aria-label={t.catalogue.compte(liste.total, corpus)}>
        <div className="listing-outils">
          <FeuilleFiltres actifs={actifs} className={technique ? "cache-desktop" : undefined}>
            {formulaire("feuille")}
          </FeuilleFiltres>
          <p className="compte" aria-live="polite">
            {t.catalogue.compte(liste.total, corpus)}
          </p>
          <SelecteurTri base={base} valeurs={filtres} />
        </div>

        {lesPuces.length > 0 ? (
          <div className="puces listing-puces">
            {lesPuces.map((p) => (
              <Link key={p.url + p.libelle} className="puce" href={p.url} scroll={false} aria-label={t.catalogue.retirerLeFiltre(p.libelle)}>
                {p.libelle}
                <Croix taille={12} />
              </Link>
            ))}
            <Link className="btn-lien legende" href={base} scroll={false}>
              {t.catalogue.toutEffacer}
            </Link>
          </div>
        ) : null}

        {liste.produits.length > 0 ? (
          <>
            <div className={technique ? "te-grille" : "ed-grille"}>
              {liste.produits.map((p, i) => (
                <CarteProduit key={p.id} produit={p} gabarit={gabarit} prixBarres={prixBarres} prioritaire={i < 4} />
              ))}
            </div>

            {pages > 1 ? (
              <nav className="pagination" aria-label={t.catalogue.pageSur(liste.page, pages)}>
                {liste.page > 1 ? (
                  <Link className="btn btn-second" rel="prev" href={cheminFiltres(base, { ...filtres, page: liste.page - 1 })}>
                    {t.catalogue.precedente}
                  </Link>
                ) : null}
                <span className="legende">{t.catalogue.pageSur(liste.page, pages)}</span>
                {liste.page < pages ? (
                  <Link className="btn btn-second" rel="next" href={cheminFiltres(base, { ...filtres, page: liste.page + 1 })}>
                    {t.catalogue.suivante}
                  </Link>
                ) : null}
              </nav>
            ) : actifs > 0 ? (
              <div className="listing-fin">
                <p className="legende">{t.catalogue.tousAffiches(liste.total)}</p>
                <Link className="btn btn-second" href={base}>
                  {t.catalogue.retirerEtVoirTout(corpus)}
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <div className="listing-vide">
            <h2>{t.catalogue.videTitre}</h2>
            <p>{t.catalogue.videTexte}</p>
            <Link className="btn btn-primaire" href={base}>
              {t.catalogue.retirerLesFiltres}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
