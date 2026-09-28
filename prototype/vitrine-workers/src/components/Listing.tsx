import Link from "next/link";
import { CarteProduit } from "./CarteProduit";
import { FormulaireFiltres } from "./Filtres";
import { SelecteurTri } from "./SelecteurTri";
import { Croix, Filtre } from "./Icones";
import { t } from "@/lib/i18n";
import {
  applique,
  facettes as calculeFacettes,
  nombreFiltresActifs,
  puces,
  urlSans,
  type Filtres,
} from "@/lib/filtres";
import type { Produit } from "@/lib/catalogue";

/* ============================================================================
   LE LISTING — partagé par « tout le catalogue » et par chaque rayon.

   Tous les nombres affichés (compte de résultats, compteur par option, bornes
   de prix) sont calculés à partir du corpus reçu. Aucun n'est écrit à la main.
   ========================================================================== */

export function Listing({
  produits,
  filtres,
  action,
  avecRayons,
}: {
  /** Le corpus de CETTE page : tout le catalogue, ou le seul rayon. */
  produits: Produit[];
  filtres: Filtres;
  /** L'URL de la page, sans paramètres — cible des formulaires et des puces. */
  action: string;
  avecRayons: boolean;
}) {
  const resultats = applique(produits, filtres);
  const facettes = calculeFacettes(produits, filtres);
  const actifs = nombreFiltresActifs(filtres);
  const nomRayon = (slug: string) =>
    facettes.rayons.find((r) => r.valeur === slug)?.nom ?? slug;

  return (
    <div className="listing">
      <aside className="filtres cache-mobile" aria-label={t.catalogue.filtres}>
        <p className="etiquette pb-3">
          <b>—</b> <span>{t.catalogue.affiner}</span>
        </p>
        <FormulaireFiltres
          action={action}
          facettes={facettes}
          valeurs={filtres}
          prefixe="bureau"
          avecRayons={avecRayons}
        />
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
            <FormulaireFiltres
              action={action}
              facettes={facettes}
              valeurs={filtres}
              prefixe="mobile"
              avecRayons={avecRayons}
            />
          </div>
        </details>

        {actifs > 0 ? (
          <div className="actifs">
            {puces(filtres, nomRayon).map((p) => (
              <Link
                key={`${p.cle}-${p.valeur}`}
                className="puce"
                href={urlSans(action, filtres, p.cle, p.valeur)}
                aria-label={t.catalogue.retirerLeFiltre(p.libelle)}
              >
                <b>{p.libelle}</b>
                <Croix taille={13} />
              </Link>
            ))}
          </div>
        ) : null}

        <div className="outils">
          <span className="compte">
            <b>{t.catalogue.compte(resultats.length, produits.length)}</b>
            {actifs > 0 ? (
              <span className="cache-mobile"> — {t.catalogue.filtresActifs(actifs)}</span>
            ) : null}
          </span>
          <SelecteurTri action={action} valeurs={filtres} />
        </div>

        {resultats.length > 0 ? (
          <>
            <div className="grille-produits">
              {resultats.map((p) => (
                <CarteProduit key={p.id} produit={p} avecRayon={avecRayons} />
              ))}
            </div>

            {actifs > 0 ? (
              <div className="flex flex-col items-center gap-3 mt-12">
                <p className="legende">{t.catalogue.tousAffiches(resultats.length)}</p>
                <Link className="btn btn-second" href={action}>
                  {t.catalogue.retirerEtVoirTout(produits.length)}
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <div className="border border-filet rounded-carte bg-surface p-8 text-center">
            <h2 className="text-t4">{t.catalogue.videTitre}</h2>
            <p className="text-petit text-encre-doux mt-2 mx-auto max-w-[42ch]">
              {t.catalogue.videTexte}
            </p>
            <Link className="btn btn-primaire mt-6" href={action}>
              {t.catalogue.retirerLesFiltres}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
