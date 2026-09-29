import Link from "next/link";
import { CarteProduit } from "./CarteProduit";
import { FormulaireFiltres } from "./Filtres";
import { SelecteurTri } from "./SelecteurTri";
import { Croix, Filtre } from "./Icones";
import { t } from "@/lib/i18n";
import { cheminFiltres, nombreFiltresActifs, puces, type Filtres } from "@/lib/filtres";
import type { Liste } from "@/lib/catalogue";

/* ============================================================================
   LE LISTING — partagé par « tout le catalogue » et par chaque rayon.

   La liste arrive filtrée, triée et paginée par la base
   (public.liste_produits) : tous les nombres affichés (compte de résultats,
   compteur par option, bornes de prix) en viennent. Aucun n'est écrit à la
   main.
   ========================================================================== */

export function Listing({
  liste,
  filtres,
  base,
  corpus,
  avecRayons,
}: {
  liste: Liste;
  filtres: Filtres;
  /** L'adresse de la liste sans filtres — cible des formulaires et des puces. */
  base: string;
  /** Nombre de produits de la liste sans aucun filtre (rayon ou catalogue). */
  corpus: number;
  avecRayons: boolean;
}) {
  const actifs = nombreFiltresActifs(filtres);
  const pages = Math.max(1, Math.ceil(liste.total / liste.par_page));
  const lesPuces = puces(base, filtres, { enStock: t.stock.enStock, prix: t.catalogue.prixEntre });

  return (
    <div className="listing">
      <aside className="filtres cache-mobile" aria-label={t.catalogue.filtres}>
        <p className="etiquette pb-3">
          <b>—</b> <span>{t.catalogue.affiner}</span>
        </p>
        <FormulaireFiltres base={base} facettes={liste.facettes} valeurs={filtres} prefixe="bureau" avecRayons={avecRayons} />
      </aside>

      <section>
        {/* Feuille de filtres mobile : un <details>, donc ouvrable au clavier
            et sans JavaScript. */}
        <details className="filtres-mobile cache-desktop">
          <summary className="btn btn-second btn-bloc">
            <Filtre />
            {t.catalogue.filtrer}
            {actifs > 0 ? <span className="text-accent"> ({actifs})</span> : null}
          </summary>
          <div className="pt-2">
            <FormulaireFiltres base={base} facettes={liste.facettes} valeurs={filtres} prefixe="mobile" avecRayons={avecRayons} />
          </div>
        </details>

        {lesPuces.length > 0 ? (
          <div className="actifs">
            {lesPuces.map((p) => (
              <Link key={p.url + p.libelle} className="puce" href={p.url} scroll={false} aria-label={t.catalogue.retirerLeFiltre(p.libelle)}>
                <b>{p.libelle}</b>
                <Croix taille={13} />
              </Link>
            ))}
          </div>
        ) : null}

        <div className="outils">
          <span className="compte">
            <b>{t.catalogue.compte(liste.total, corpus)}</b>
            {actifs > 0 ? <span className="cache-mobile"> — {t.catalogue.filtresActifs(actifs)}</span> : null}
          </span>
          <SelecteurTri base={base} valeurs={filtres} />
        </div>

        {liste.produits.length > 0 ? (
          <>
            <div className="grille-produits">
              {liste.produits.map((p) => (
                <CarteProduit key={p.id} produit={p} avecRayon={avecRayons} />
              ))}
            </div>

            {pages > 1 ? (
              <nav className="flex items-center justify-center gap-3 mt-12" aria-label={t.catalogue.pageSur(liste.page, pages)}>
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
              <div className="flex flex-col items-center gap-3 mt-12">
                <p className="legende">{t.catalogue.tousAffiches(liste.total)}</p>
                <Link className="btn btn-second" href={base}>
                  {t.catalogue.retirerEtVoirTout(corpus)}
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <div className="border border-filet rounded-carte bg-surface p-8 text-center">
            <h2 className="text-t4">{t.catalogue.videTitre}</h2>
            <p className="text-petit text-encre-doux mt-2 mx-auto max-w-[42ch]">{t.catalogue.videTexte}</p>
            <Link className="btn btn-primaire mt-6" href={base}>
              {t.catalogue.retirerLesFiltres}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
