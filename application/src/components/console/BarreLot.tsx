"use client";

import { useEffect, useState } from "react";
import { Icone } from "./Icone";

/* ============================================================================
   LES GESTES GROUPÉS DE LA LISTE — « À préparer » : les colis remis au
   livreur ; « Expédiées » : le point du livreur, ceux qu'il a livrés. Chaque
   ligne a sa case (input form="<formulaire>" name="n") ; la barre compte les
   cases cochées, coche ou décoche tout, et envoie le formulaire (Retours.tsx
   l'envoie en place, la liste revient à jour). Sans script, les cases et le
   bouton suffisent.
   ========================================================================== */

export function BarreLot({ formulaire, geste }: { formulaire: string; geste: "expedier" | "livrer" }) {
  const [n, setN] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const cases = () => [...document.querySelectorAll<HTMLInputElement>(`input[form="${formulaire}"][name="n"]`)];
    const compte = () => {
      const toutes = cases();
      setTotal(toutes.length);
      setN(toutes.filter((c) => c.checked).length);
    };
    compte();
    document.addEventListener("change", compte);
    // La liste revient du serveur après le geste (envoi en place) : les cases ont changé.
    const regard = new MutationObserver(compte);
    regard.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("change", compte);
      regard.disconnect();
    };
  }, [formulaire]);

  if (total === 0) return null;
  const tout = (coche: boolean) => {
    for (const c of document.querySelectorAll<HTMLInputElement>(`input[form="${formulaire}"][name="n"]`)) c.checked = coche;
    setN(coche ? total : 0);
  };
  const libelle = geste === "expedier"
    ? `Remettre au livreur${n ? ` (${n})` : ""}`
    : `Marquer livrées, payées${n ? ` (${n})` : ""}`;

  return (
    <div className="bo-lot" role="group" aria-label={geste === "expedier" ? "Remettre plusieurs colis au livreur" : "Le point du livreur"}>
      <label className="opt bo-lot-tout">
        <input type="checkbox" checked={n === total} ref={(c) => { if (c) c.indeterminate = n > 0 && n < total; }}
               onChange={(e) => tout(e.target.checked)} aria-label="Tout cocher" />
        <span aria-live="polite">{n ? `${n} cochée${n > 1 ? "s" : ""} sur ${total}` : "Tout cocher"}</span>
      </label>
      {geste === "expedier" ? (
        <input form={formulaire} name="transporteur" className="entree bo-lot-transporteur" maxLength={80} autoComplete="off"
               placeholder="Transporteur (sinon celui de chaque commande)" aria-label="Transporteur" />
      ) : null}
      <button type="submit" form={formulaire} className="btn btn-primaire" disabled={n === 0}>
        <Icone nom={geste === "expedier" ? "camion" : "coche"} taille={16} /> {libelle}
      </button>
    </div>
  );
}
