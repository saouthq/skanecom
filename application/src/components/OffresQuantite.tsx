"use client";

import { useId } from "react";
import { Prix } from "./Prix";
import { remisePalier, totalAvecPaliers, type Palier } from "@/lib/paliers";
import { formatePrix } from "@/lib/prix";
import { t } from "@/lib/i18n";

/* ============================================================================
   LES OFFRES PAR QUANTITÉ — « 1 pièce · 2 pièces −10 % · 3 pièces −15 % » :
   un groupe de choix (radio) qui règle la quantité du bloc d'achat. Sur la
   fiche, en pastilles ; sur la page de vente (structure Monoproduit), en
   grandes cartes. Le prix de chaque offre est celui que la base appliquera
   (lib/paliers.ts) ; une offre au-delà du stock ne se choisit pas.
   ========================================================================== */

export function OffresQuantite({ prixUnitaire, paliers, quantite, stock, minimum = 1, onChoisir, forme = "pastilles" }: {
  prixUnitaire: number;
  paliers: Palier[];
  quantite: number;
  stock: number;
  minimum?: number;
  onChoisir: (q: number) => void;
  forme?: "pastilles" | "cartes";
}) {
  const nom = useId();
  const offres = [{ quantite: Math.max(1, minimum), prixMillimes: prixUnitaire * Math.max(1, minimum) }, ...paliers.filter((p) => p.quantite > minimum)];
  // La meilleure à l'unité : la dernière (la base veut l'unité de moins en moins chère).
  const meilleure = offres.length > 1 ? offres[offres.length - 1].quantite : null;
  return (
    <fieldset className="offres" data-forme={forme}>
      <legend className="offres-titre">{t.produit.offresTitre}</legend>
      <div className="offres-liste">
        {offres.map((o) => {
          const total = totalAvecPaliers(prixUnitaire, o.quantite, paliers).total;
          const remise = o.quantite > 1 ? remisePalier(prixUnitaire, { quantite: o.quantite, prixMillimes: total }) : 0;
          const choisie = quantite === o.quantite;
          const hors = o.quantite > stock;
          return (
            <label key={o.quantite} className="offre" data-choisie={choisie ? "" : undefined} data-hors={hors ? "" : undefined}>
              <input type="radio" name={nom} value={o.quantite} checked={choisie} disabled={hors}
                onChange={() => onChoisir(o.quantite)} />
              <span className="offre-quantite">{t.produit.offrePieces(o.quantite)}</span>
              <span className="offre-prix"><Prix millimes={total} /></span>
              {o.quantite > 1 ? (
                <span className="offre-detail">
                  {t.produit.offreUnite(formatePrix(Math.round(total / o.quantite)))}
                  {remise > 0 ? <span className="offre-remise">−{remise} %</span> : null}
                </span>
              ) : (
                <span className="offre-detail">{t.produit.offreUneSeule}</span>
              )}
              {forme === "cartes" && o.quantite === meilleure ? <span className="offre-badge">{t.produit.offreMeilleure}</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
