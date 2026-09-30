"use client";

import { Prix } from "./Prix";
import { t } from "@/lib/i18n";
import { prixApplique, usePrixPro } from "@/lib/prix-pro";

/* Le prix d'une carte : « dès » le plus bas des déclinaisons — pour un pro
   validé et connecté, au prix pro, avec sa pastille (module comptes_pro).
   Rendu d'abord au prix public, comme la page servie à tous ; le prix pro
   arrive après l'hydratation, sans décalage de la mise en page. */
export function PrixCarte({ produitId, variantes, fort = false, ttc = false, classe }: {
  produitId: string;
  variantes: { id: string; prix_millimes: number }[];
  fort?: boolean;
  ttc?: boolean;
  classe: string;
}) {
  const pro = usePrixPro([produitId]);
  if (variantes.length === 0) return null;
  const prix = variantes.map((v) => prixApplique(pro, v));
  const bas = Math.min(...prix);
  const haut = Math.max(...prix);
  const avecPro = variantes.some((v) => pro[v.id] !== undefined && pro[v.id] < v.prix_millimes);
  return (
    <span className={classe} data-pro={avecPro ? "" : undefined}>
      {avecPro ? <span className="carte-pro">{t.pro.badge}</span> : null}
      {haut > bas ? <span className="dès">{t.catalogue.aPartirDe}</span> : null}
      <Prix millimes={bas} fort={fort} />
      {ttc ? <span className="ttc">{t.produit.ttc}</span> : null}
    </span>
  );
}
