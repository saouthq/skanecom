"use client";

import { useSelection } from "./SelectionVariante";
import { champ, t } from "@/lib/i18n";

/* ============================================================================
   LES CARACTÉRISTIQUES — de la déclinaison RÉELLEMENT choisie.

   La référence et le poids suivent la sélection : afficher le SKU d'une
   autre déclinaison est une erreur commerciale, pas un détail (le client le
   dicte au téléphone). Tant qu'aucune combinaison n'existe, on n'affiche
   rien plutôt qu'une valeur d'à-côté.

   · `ref`     — la ligne « Réf. … » sous le titre (gabarit technique) ;
   · `tableau` — le tableau complet : déclinaison, référence, poids, marque,
                 rayon.

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
  mode?: "ref" | "tableau";
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

  const poids = poidsDe(variante.poids_grammes);
  const lignes: [string, string][] = [
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
