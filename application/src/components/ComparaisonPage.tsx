"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { lienComparaison, lisComparaison, remplaceComparaison, type PieceComparee } from "@/lib/comparaison";
import { t } from "@/lib/i18n";

/* ============================================================================
   LES MORCEAUX VIVANTS DE LA PAGE /comparer

   · SuiviComparaison — la liste du navigateur suit la page (une pièce
     retirée par son lien, une pièce qui n'est plus publiée) ; arrivé sur
     /comparer sans pièces dans l'adresse, on y met celles du navigateur.
   · DifferencesSeules — « Seulement les différences » : masque les lignes
     où toutes les pièces disent la même chose (data-pareil).
   ========================================================================== */

export function SuiviComparaison({ pieces }: { pieces: PieceComparee[] }) {
  const router = useRouter();
  const cle = pieces.map((p) => p.slug).join(",");
  useEffect(() => {
    if (pieces.length === 0) {
      const gardees = lisComparaison();
      if (gardees.length) router.replace(lienComparaison(gardees));
      return;
    }
    remplaceComparaison(pieces);
    // `cle` dit la liste : la même liste relue ne réécrit rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return null;
}

export function DifferencesSeules({ children }: { children: React.ReactNode }) {
  const [seules, setSeules] = useState(false);
  const id = useId();
  return (
    <div className="cp" data-differences={seules ? "" : undefined}>
      <p className="cp-options">
        <input id={id} type="checkbox" checked={seules} onChange={(e) => setSeules(e.currentTarget.checked)} />
        <label htmlFor={id}>{t.comparaison.differences}</label>
      </p>
      {children}
    </div>
  );
}
