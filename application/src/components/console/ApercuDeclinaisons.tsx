"use client";

import { useEffect, useRef, useState } from "react";
import { combinaisons, referenceProposee } from "@/lib/gestion/catalogue";

/* ============================================================================
   L'APERÇU DES DÉCLINAISONS — pendant qu'on tape les axes d'un produit neuf :
   « 2 × 3 = 6 déclinaisons », les premières en clair, la référence que
   recevra la première. Même lecture que la route de création (valeurs
   séparées par des virgules, doublons retirés, 100 au plus).
   ========================================================================== */

type Etat = { axes: { label: string; valeurs: string[] }[]; base: string };

function lit(form: HTMLFormElement): Etat {
  const f = new FormData(form);
  const axes = [0, 1, 2]
    .map((i) => ({
      label: String(f.get(`axe_nom_${i}`) ?? "").trim(),
      valeurs: [...new Set(String(f.get(`axe_valeurs_${i}`) ?? "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean))],
    }))
    .filter((a) => a.valeurs.length > 0);
  return { axes, base: String(f.get("sku") ?? "").trim() || String(f.get("nom") ?? "").trim() };
}

export function ApercuDeclinaisons() {
  const repere = useRef<HTMLParagraphElement>(null);
  const [etat, setEtat] = useState<Etat | null>(null);

  useEffect(() => {
    const form = repere.current?.closest("form");
    if (!form) return;
    const relit = () => setEtat(lit(form));
    const id = requestAnimationFrame(relit); // les valeurs déjà saisies (retour d'erreur)
    form.addEventListener("input", relit);
    return () => {
      cancelAnimationFrame(id);
      form.removeEventListener("input", relit);
    };
  }, []);

  const combis = etat ? combinaisons(etat.axes.map((a, i) => ({ cle: String(i), valeurs: a.valeurs }))) : [];
  const n = etat?.axes.length ? combis.length : 0;

  return (
    <p ref={repere} className="apercu-declinaisons" data-trop={n > 100 ? "" : undefined} aria-live="polite">
      {!etat || n === 0 ? (
        <span>Sans axe : une seule déclinaison (modèle unique).</span>
      ) : (
        <>
          <b className="tabular-nums">
            {etat.axes.map((a) => a.valeurs.length).join(" × ")}
            {etat.axes.length > 1 ? ` = ${n}` : ""} déclinaison{n > 1 ? "s" : ""}
          </b>
          {n > 100 ? (
            <span> : 100 au plus, retirez des valeurs.</span>
          ) : (
            <span className="apercu-declinaisons-liste">
              {combis.slice(0, 4).map((c) => Object.values(c).join(" · ")).join(", ")}
              {n > 4 ? `, et ${n - 4} autre${n - 4 > 1 ? "s" : ""}` : ""}
              {etat.base ? <span className="discret"> — première référence : {referenceProposee(etat.base, Object.values(combis[0] ?? {}))}</span> : null}
            </span>
          )}
        </>
      )}
    </p>
  );
}
