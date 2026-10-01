"use client";

import { useSelection } from "./SelectionVariante";
import { champ, t } from "@/lib/i18n";
import { valeurAvecUnite } from "@/lib/caracteristiques";

/* ============================================================================
   LES CARACTÉRISTIQUES — de la déclinaison RÉELLEMENT choisie.

   La référence et le poids suivent la sélection : afficher le SKU d'une
   autre déclinaison est une erreur commerciale, pas un détail (le client le
   dicte au téléphone). Tant qu'aucune combinaison n'existe, on n'affiche
   rien plutôt qu'une valeur d'à-côté.

   · `ref`     — la ligne « Réf. … » sous le titre (gabarit technique) ;
   · `cles`    — l'essentiel, sous le titre (gabarit technique) : quatre
                 caractéristiques au plus, celles « sur la carte » d'abord —
                 ce qui décide l'achat d'un artisan (puissance, mandrin,
                 tension) avant le prix, plutôt qu'à la fin de la page ;
   · `tableau` — le tableau complet : la fiche technique du produit
                 (puissance, tension… — B9, dans l'ordre de la boutique),
                 la déclinaison, la référence, le poids, la marque, le rayon.

   <bdi> sur les valeurs : en RTL, « 2,6 kg » et un SKU se réordonnent sinon.
   ========================================================================== */

function poidsDe(grammes: number | null): string | null {
  if (typeof grammes !== "number" || grammes <= 0) return null;
  return grammes < 1000 ? `${grammes} g` : `${(grammes / 1000).toFixed(1).replace(".", ",")} kg`;
}

export function SpecsVariante({
  mode = "tableau",
  marque,
  rayon,
}: {
  mode?: "ref" | "cles" | "tableau";
  marque?: string | null;
  rayon?: string | null;
}) {
  const { produit, variante } = useSelection();
  if (!variante) return null;

  if (mode === "ref") {
    return (
      <p className="ref-variante">
        {t.produit.refCourte} <bdi>{variante.sku}</bdi>
      </p>
    );
  }

  if (mode === "cles") {
    const propres = (produit.caracteristiques ?? []).filter((c) => !variante.options?.[c.cle] && c.valeur);
    const cles = [...propres.filter((c) => c.en_carte), ...propres.filter((c) => !c.en_carte)].slice(0, 4);
    if (cles.length < 2) return null;
    return (
      <div className="specs-cles">
        <ul aria-label={t.produit.essentiel}>
          {cles.map((c) => (
            <li key={c.cle}>
              <span>{champ(c, "label") || c.cle}</span>
              <b><bdi>{valeurAvecUnite(c.valeur, c)}</bdi></b>
            </li>
          ))}
        </ul>
        <a className="specs-cles-tout" href="#caracteristiques">{t.produit.toutesCaracteristiques}</a>
      </div>
    );
  }

  const poids = poidsDe(variante.poids_grammes);
  const lignes: [string, string][] = [
    // Une caractéristique du même nom qu'un axe de la déclinaison lui cède la place.
    ...(produit.caracteristiques ?? [])
      .filter((c) => !variante.options?.[c.cle])
      .map((c): [string, string] => [champ(c, "label") || c.cle, valeurAvecUnite(c.valeur, c)]),
    ...produit.options
      .filter((o) => variante.options?.[o.cle])
      .map((o): [string, string] => [champ(o, "label") || o.cle, variante.options[o.cle]]),
    [t.produit.reference, variante.sku],
    ...(poids ? [[t.produit.poids, poids] as [string, string]] : []),
    ...(marque ? [[t.produit.marque, marque] as [string, string]] : []),
    ...(rayon ? [[t.catalogue.rayon, rayon] as [string, string]] : []),
  ];

  return (
    <dl className="caracteristiques">
      {lignes.map(([nom, valeur]) => (
        <div key={nom}>
          <dt>{nom}</dt>
          <dd>
            <bdi>{valeur}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
}
