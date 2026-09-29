"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { couleurDeColoris } from "@/lib/coloris";
import { champ, t } from "@/lib/i18n";
import { millimesVersDinars } from "@/lib/prix";
import { cheminFiltres, nombre, type Filtres } from "@/lib/filtres";
import { noteReprise, reprends } from "@/lib/reprise";
import type { Liste, OptionAxe } from "@/lib/catalogue";

/* ============================================================================
   LE FORMULAIRE DE FILTRES

   Un vrai <form method="get"> vers /filtrer, qui redirige vers l'adresse
   canonique de la liste (lib/filtres.ts) : sans JavaScript, on coche et on
   valide, la page revient filtrée.

   Avec JavaScript, cocher mène DIRECTEMENT à l'adresse canonique, sans
   recharger la page : le focus reste sur la case (clavier), la page ne
   remonte pas, la feuille de filtres du mobile reste ouverte pour cocher la
   suivante. Les cases suivent l'état du formulaire, qui suit l'adresse :
   retirer une puce ou revenir en arrière les remet d'accord.

   Les axes ne sont PAS écrits ici : ce sont ceux des variantes du rayon
   (couleur, taille, version, conditionnement…), renvoyés par la base avec
   leur libellé. Une option qui ne laisserait AUCUN résultat s'affiche éteinte
   et ne se coche pas : on prévient l'erreur au lieu de l'annoncer après.
   ========================================================================== */

const TAILLES = ["XXS", "XS", "XS/S", "S", "S/M", "M", "M/L", "L", "L/XL", "XL", "XXL", "3XL"];

/** Les valeurs d'un axe dans l'ordre où on les lit : les tailles de XS à XL,
 *  les mesures du plus petit au plus grand (4 mm, 6 mm, 10 mm). Sinon, l'ordre
 *  de la base. */
export function ordreNaturel<T extends { valeur: string }>(options: T[]): T[] {
  const rang = (v: string) => TAILLES.indexOf(v.trim().toUpperCase());
  if (options.every((o) => rang(o.valeur) >= 0)) return [...options].sort((a, b) => rang(a.valeur) - rang(b.valeur));
  const nombre = (v: string) => Number.parseFloat(v.replace(",", "."));
  if (options.every((o) => Number.isFinite(nombre(o.valeur)))) return [...options].sort((a, b) => nombre(a.valeur) - nombre(b.valeur));
  return options;
}

/** Demande de fermeture du tiroir de filtres (« Voir les résultats »). */
export const FERMER_FEUILLE = "skanecom:filtres-fermer";

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
  resultats,
}: {
  /** L'adresse de la liste sans filtres : /catalogue ou /categorie/<slug>. */
  base: string;
  facettes: Liste["facettes"];
  valeurs: Filtres;
  /** Le formulaire est rendu deux fois (colonne desktop + feuille mobile) :
   *  les identifiants doivent rester uniques dans la page. */
  prefixe: string;
  avecRayons: boolean;
  /** Nombre de résultats de la liste courante, dit sur le bouton. */
  resultats?: number;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const canonique = cheminFiltres(base, valeurs);

  // La liste vient d'être remontée par un filtre : le focus revient où il était.
  useEffect(() => reprends(`filtres-${prefixe}`, form.current), [prefixe]);
  const [choix, setChoix] = useState(valeurs);
  const [min, setMin] = useState(valeurs.minDinars?.toString() ?? "");
  const [max, setMax] = useState(valeurs.maxDinars?.toString() ?? "");

  // L'adresse a changé ailleurs (puce retirée, retour arrière) : on la suit,
  // pendant le rendu (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [suivie, setSuivie] = useState(canonique);
  if (suivie !== canonique) {
    setSuivie(canonique);
    setChoix(valeurs);
    setMin(valeurs.minDinars?.toString() ?? "");
    setMax(valeurs.maxDinars?.toString() ?? "");
  }

  /** Applique un état : les bornes de prix saisies voyagent avec lui, même
   *  si on n'a pas encore cliqué sur « Appliquer ». */
  const applique = (f: Filtres, declencheur?: EventTarget | null) => {
    const suivant = { ...f, minDinars: nombre(min), maxDinars: nombre(max), page: 1 };
    setChoix(suivant);
    if (declencheur instanceof HTMLElement && declencheur.hasAttribute("data-voir")) {
      // « Voir les résultats » : on veut la liste, pas le tiroir.
      window.dispatchEvent(new CustomEvent(FERMER_FEUILLE));
    } else {
      noteReprise(`filtres-${prefixe}`, form.current, declencheur);
    }
    router.push(cheminFiltres(base, suivant), { scroll: false });
  };

  const bascule = (cle: string, valeur: string, coche: boolean, declencheur: EventTarget) => {
    const liste = choix.options[cle] ?? [];
    applique({ ...choix, options: { ...choix.options, [cle]: coche ? [...liste, valeur] : liste.filter((v) => v !== valeur) } }, declencheur);
  };

  const envoie = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    applique(choix, (e.nativeEvent as SubmitEvent).submitter);
  };

  // Les axes déclarés d'abord, dans leur ordre ; puis ceux sans déclaration.
  const cles = [
    ...facettes.axes.map((a) => a.cle).filter((c) => c in facettes.options),
    ...Object.keys(facettes.options).filter((c) => !facettes.axes.some((a) => a.cle === c)),
  ];

  return (
    <form ref={form} action="/filtrer" method="get" className="filtres-form" onSubmit={envoie}>
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
        const options = ordreNaturel(facettes.options[cle] ?? []);
        const choisies = choix.options[cle] ?? [];
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
                    <input type="checkbox" name={`a.${cle}`} value={o.valeur} checked={coche}
                      disabled={eteint} onChange={(e) => bascule(cle, o.valeur, e.target.checked, e.target)} className="sr-only" />
                    <i style={{ background: couleurDeColoris(o.valeur) }} aria-hidden="true" />
                    <span className="sr-only">{o.valeur}</span>
                  </label>
                ) : (
                  <label key={o.valeur} className={`opt${eteint ? " eteint" : ""}`}>
                    <input type="checkbox" name={`a.${cle}`} value={o.valeur} checked={coche}
                      disabled={eteint} onChange={(e) => bascule(cle, o.valeur, e.target.checked, e.target)} />
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
              value={min} onChange={(e) => setMin(e.target.value)} aria-label={t.catalogue.prixMin} id={`${prefixe}-min`} />
            <span className="text-encre-doux" aria-hidden="true">—</span>
            <input type="number" name="max" inputMode="numeric" min={0}
              placeholder={String(Math.ceil(millimesVersDinars(facettes.prix.max)))}
              value={max} onChange={(e) => setMax(e.target.value)} aria-label={t.catalogue.prixMax} id={`${prefixe}-max`} />
          </div>
        </div>
      ) : null}

      <div className="groupe">
        <h3>{t.catalogue.disponibilite}</h3>
        <label className="opt">
          <input type="checkbox" name="stock" value="1" checked={choix.enStock}
            onChange={(e) => applique({ ...choix, enStock: e.target.checked }, e.target)} />
          {t.catalogue.enStockSeulement}
        </label>
      </div>

      <div className="filtres-actions">
        {/* Sans JavaScript, c'est ce bouton qui applique les filtres ; avec, il
            sert aux bornes de prix (on ne soumet pas à chaque frappe) et
            referme le tiroir. */}
        <button type="submit" className="btn btn-primaire btn-bloc" data-voir>
          {resultats !== undefined ? t.catalogue.voirResultats(resultats) : t.catalogue.appliquer}
        </button>
        <Link className="btn btn-second btn-bloc" href={base} scroll={false}>
          {t.catalogue.toutEffacer}
        </Link>
      </div>
    </form>
  );
}
