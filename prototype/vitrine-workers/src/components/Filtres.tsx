"use client";

import { useRef } from "react";
import { couleurDeColoris } from "@/lib/coloris";
import { t } from "@/lib/i18n";
import type { Facettes, Filtres } from "@/lib/filtres";

/* ============================================================================
   LE FORMULAIRE DE FILTRES

   C'est un vrai <form method="get"> : sans JavaScript, on coche et on valide,
   la page revient filtrée. Le script n'ajoute qu'une commodité — la
   soumission au changement, pour que le desktop se comporte comme on l'attend
   d'une boutique.

   Une option qui ne laisserait AUCUN résultat s'affiche éteinte et ne se
   coche pas : on prévient l'erreur au lieu de l'annoncer après (règle de Lina).
   ========================================================================== */

export function FormulaireFiltres({
  action,
  facettes,
  valeurs,
  prefixe,
  avecRayons,
}: {
  action: string;
  facettes: Facettes;
  valeurs: Filtres;
  /** Le formulaire est rendu deux fois (colonne desktop + feuille mobile) :
   *  les identifiants doivent rester uniques dans la page. */
  prefixe: string;
  avecRayons: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const envoie = () => form.current?.requestSubmit();

  return (
    <form ref={form} action={action} method="get" className="filtres-form">
      {/* Le tri voyage avec les filtres : sans ce champ, filtrer ferait perdre
          le tri choisi juste avant. */}
      {valeurs.tri !== "nouveautes" ? <input type="hidden" name="tri" value={valeurs.tri} /> : null}

      {avecRayons && facettes.rayons.length > 1 ? (
        <div className="groupe">
          <h3>{t.catalogue.rayon}</h3>
          {facettes.rayons.map((r) => (
            <label key={r.valeur} className={`opt${r.compte === 0 ? " eteint" : ""}`}>
              <input
                type="checkbox"
                name="rayon"
                value={r.valeur}
                defaultChecked={valeurs.rayons.includes(r.valeur)}
                disabled={r.compte === 0 && !valeurs.rayons.includes(r.valeur)}
                onChange={envoie}
              />
              {r.nom}
              <span className="n">{r.compte}</span>
            </label>
          ))}
        </div>
      ) : null}

      {facettes.couleurs.length > 0 ? (
        <div className="groupe">
          <h3>{t.catalogue.couleur}</h3>
          <div className="pastilles-couleur">
            {facettes.couleurs.map((c) => {
              const coche = valeurs.couleurs.includes(c.valeur);
              const eteint = c.compte === 0 && !coche;
              return (
                <label
                  key={c.valeur}
                  className={`pc${coche ? " pc-active" : ""}${eteint ? " eteint" : ""}`}
                  title={`${c.valeur} — ${c.compte}`}
                >
                  <input
                    type="checkbox"
                    name="couleur"
                    value={c.valeur}
                    defaultChecked={coche}
                    disabled={eteint}
                    onChange={envoie}
                    className="sr-only"
                  />
                  <i style={{ background: couleurDeColoris(c.valeur) }} aria-hidden="true" />
                  <span className="sr-only">{c.valeur}</span>
                </label>
              );
            })}
          </div>
          {valeurs.couleurs.length === 0 ? (
            <p className="legende mt-2">{t.catalogue.aucuneCouleur}</p>
          ) : (
            <p className="legende mt-2">{valeurs.couleurs.join(", ")}</p>
          )}
        </div>
      ) : null}

      {facettes.tailles.length > 0 ? (
        <div className="groupe">
          <h3>{t.catalogue.taille}</h3>
          {facettes.tailles.map((s) => {
            const coche = valeurs.tailles.includes(s.valeur);
            return (
              <label key={s.valeur} className={`opt${s.compte === 0 && !coche ? " eteint" : ""}`}>
                <input
                  type="checkbox"
                  name="taille"
                  value={s.valeur}
                  defaultChecked={coche}
                  disabled={s.compte === 0 && !coche}
                  onChange={envoie}
                />
                {s.valeur}
                <span className="n">{s.compte}</span>
              </label>
            );
          })}
        </div>
      ) : null}

      {facettes.bornes ? (
        <div className="groupe">
          <h3>{t.catalogue.prixTnd}</h3>
          <div className="prix-bornes">
            <input
              type="number"
              name="min"
              inputMode="numeric"
              min={0}
              placeholder={String(facettes.bornes.min)}
              defaultValue={valeurs.minDinars ?? ""}
              aria-label={t.catalogue.prixMin}
              id={`${prefixe}-min`}
            />
            <span className="text-encre-doux" aria-hidden="true">
              —
            </span>
            <input
              type="number"
              name="max"
              inputMode="numeric"
              min={0}
              placeholder={String(facettes.bornes.max)}
              defaultValue={valeurs.maxDinars ?? ""}
              aria-label={t.catalogue.prixMax}
              id={`${prefixe}-max`}
            />
          </div>
        </div>
      ) : null}

      <div className="groupe">
        <h3>{t.catalogue.disponibilite}</h3>
        <label className="opt">
          <input
            type="checkbox"
            name="stock"
            value="1"
            defaultChecked={valeurs.enStock}
            onChange={envoie}
          />
          {t.catalogue.enStockSeulement}
        </label>
      </div>

      <div className="groupe grid gap-2 border-b border-filet">
        {/* Sans JavaScript, c'est ce bouton qui applique les filtres. Avec, il
            reste utile pour les bornes de prix (on ne soumet pas à chaque
            frappe). */}
        <button type="submit" className="btn btn-primaire btn-bloc">
          {t.catalogue.appliquer}
        </button>
        <a className="btn btn-second btn-bloc" href={action}>
          {t.catalogue.toutEffacer}
        </a>
      </div>
    </form>
  );
}
