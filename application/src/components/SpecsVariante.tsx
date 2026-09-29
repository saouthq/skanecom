"use client";

import { useSelection } from "./SelectionVariante";
import { t } from "@/lib/i18n";

/* ============================================================================
   LE COUP D'ŒIL — poids et référence de la déclinaison RÉELLEMENT choisie.

   Ces deux valeurs suivent la sélection : afficher le SKU d'une autre
   déclinaison est une erreur commerciale, pas un détail (le client le dicte
   au téléphone). Tant qu'aucune combinaison n'existe, on n'affiche rien
   plutôt qu'une valeur d'à-côté.

   <bdi> sur les valeurs : en RTL, « 2,6 kg » et un SKU se réordonnent sinon
   (mesuré en posant dir="rtl" sur la page réelle).
   ========================================================================== */

export function SpecsVariante() {
  const { variante } = useSelection();
  if (!variante) return null;

  const poids =
    typeof variante.poids_grammes === "number" && variante.poids_grammes > 0
      ? `${(variante.poids_grammes / 1000).toFixed(1).replace(".", ",")} kg`
      : null;

  return (
    <dl className="coup-oeil">
      {poids ? (
        <div>
          <dt>{t.produit.poids}</dt>
          <dd>
            <bdi>{poids}</bdi>
          </dd>
        </div>
      ) : null}
      <div>
        <dt>{t.produit.reference}</dt>
        <dd>
          <bdi>{variante.sku}</bdi>
        </dd>
      </div>
    </dl>
  );
}
