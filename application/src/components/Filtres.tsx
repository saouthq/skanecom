"use client";

import { useRef } from "react";
import Link from "next/link";
import { couleurDeColoris } from "@/lib/coloris";
import { champ, t } from "@/lib/i18n";
import { millimesVersDinars } from "@/lib/prix";
import { cheminFiltres, type Filtres } from "@/lib/filtres";
import type { Liste, OptionAxe } from "@/lib/catalogue";

/* ============================================================================
   LE FORMULAIRE DE FILTRES

   Un vrai <form method="get"> vers /filtrer, qui redirige vers l'adresse
   canonique de la liste (lib/filtres.ts) : sans JavaScript, on coche et on
   valide, la page revient filtrée. Le script n'ajoute que la soumission au
   changement.

   Les axes ne sont PAS écrits ici : ce sont ceux des variantes du rayon
   (couleur, taille, version, conditionnement…), renvoyés par la base avec
   leur libellé. Une option qui ne laisserait AUCUN résultat s'affiche éteinte
   et ne se coche pas : on prévient l'erreur au lieu de l'annoncer après.
   ========================================================================== */

export function libelleAxe(cle: string, axes: OptionAxe[]): string {
  const axe = axes.find((a) => a.cle === cle);
  return (axe && champ(axe, "label")) || t.catalogue.axes[cle] || cle.charAt(0).toUpperCase() + cle.slice(1).replace(/_/g, " ");
}

export function FormulaireFiltres({
  base,
  facettes,
  valeurs,
  prefixe,
  avecRayons,
}: {
  /** L'adresse de la liste sans filtres : /catalogue ou /categorie/<slug>. */
  base: string;
  facettes: Liste["facettes"];
  valeurs: Filtres;
  /** Le formulaire est rendu deux fois (colonne desktop + feuille mobile) :
   *  les identifiants doivent rester uniques dans la page. */
  prefixe: string;
  avecRayons: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const envoie = () => form.current?.requestSubmit();

  // Les axes déclarés d'abord, dans leur ordre ; puis ceux sans déclaration.
  const cles = [
    ...facettes.axes.map((a) => a.cle).filter((c) => c in facettes.options),
    ...Object.keys(facettes.options).filter((c) => !facettes.axes.some((a) => a.cle === c)),
  ];

  return (
    <form ref={form} action="/filtrer" method="get" className="filtres-form">
      <input type="hidden" name="base" value={base} />
      {/* Le tri voyage avec les filtres : filtrer ne défait pas le tri. */}
      {valeurs.tri !== "nouveautes" ? <input type="hidden" name="tri" value={valeurs.tri} /> : null}

      {avecRayons && facettes.rayons.length > 1 ? (
        <div className="groupe">
          <h3>{t.catalogue.rayon}</h3>
          {facettes.rayons.map((r) => (
            <Link
              key={r.slug}
              className={`opt${r.compte === 0 ? " eteint" : ""}`}
              href={cheminFiltres(`/categorie/${r.slug}`, { ...valeurs, page: 1 })}
            >
              {champ(r, "nom")}
              <span className="n">{r.compte}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {cles.map((cle) => {
        const options = facettes.options[cle] ?? [];
        const choisies = valeurs.options[cle] ?? [];
        if (options.length < 2 && choisies.length === 0) return null;
        const estCouleur = cle === "couleur";
        return (
          <div className="groupe" key={cle}>
            <h3>{libelleAxe(cle, facettes.axes)}</h3>
            <div className={estCouleur ? "pastilles-couleur" : undefined}>
              {options.map((o) => {
                const coche = choisies.includes(o.valeur);
                const eteint = o.compte === 0 && !coche;
                return estCouleur ? (
                  <label
                    key={o.valeur}
                    className={`pc${coche ? " pc-active" : ""}${eteint ? " eteint" : ""}`}
                    title={`${o.valeur} — ${o.compte}`}
                  >
                    <input type="checkbox" name={`a.${cle}`} value={o.valeur} defaultChecked={coche}
                      disabled={eteint} onChange={envoie} className="sr-only" />
                    <i style={{ background: couleurDeColoris(o.valeur) }} aria-hidden="true" />
                    <span className="sr-only">{o.valeur}</span>
                  </label>
                ) : (
                  <label key={o.valeur} className={`opt${eteint ? " eteint" : ""}`}>
                    <input type="checkbox" name={`a.${cle}`} value={o.valeur} defaultChecked={coche}
                      disabled={eteint} onChange={envoie} />
                    {o.valeur}
                    <span className="n">{o.compte}</span>
                  </label>
                );
              })}
            </div>
            {estCouleur ? (
              <p className="legende mt-2">{choisies.length > 0 ? choisies.join(", ") : t.catalogue.aucuneValeur}</p>
            ) : null}
          </div>
        );
      })}

      {facettes.prix ? (
        <div className="groupe">
          <h3>{t.catalogue.prixTnd}</h3>
          <div className="prix-bornes">
            <input type="number" name="min" inputMode="numeric" min={0}
              placeholder={String(Math.floor(millimesVersDinars(facettes.prix.min)))}
              defaultValue={valeurs.minDinars ?? ""} aria-label={t.catalogue.prixMin} id={`${prefixe}-min`} />
            <span className="text-encre-doux" aria-hidden="true">—</span>
            <input type="number" name="max" inputMode="numeric" min={0}
              placeholder={String(Math.ceil(millimesVersDinars(facettes.prix.max)))}
              defaultValue={valeurs.maxDinars ?? ""} aria-label={t.catalogue.prixMax} id={`${prefixe}-max`} />
          </div>
        </div>
      ) : null}

      <div className="groupe">
        <h3>{t.catalogue.disponibilite}</h3>
        <label className="opt">
          <input type="checkbox" name="stock" value="1" defaultChecked={valeurs.enStock} onChange={envoie} />
          {t.catalogue.enStockSeulement}
        </label>
      </div>

      <div className="groupe grid gap-2 border-b border-filet">
        {/* Sans JavaScript, c'est ce bouton qui applique les filtres ; avec, il
            sert aux bornes de prix (on ne soumet pas à chaque frappe). */}
        <button type="submit" className="btn btn-primaire btn-bloc">
          {t.catalogue.appliquer}
        </button>
        <Link className="btn btn-second btn-bloc" href={base}>
          {t.catalogue.toutEffacer}
        </Link>
      </div>
    </form>
  );
}
