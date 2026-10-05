"use client";

import { useState } from "react";
import { formateMontant } from "@/lib/prix";
import { pourcentage, type LotGestion, type ProduitAuCatalogue } from "@/lib/gestion/lots";

/* ============================================================================
   COMPOSER OU CHANGER UN LOT — un formulaire HTML ordinaire (il part sans
   script) que le navigateur aide : à mesure qu'on choisit les produits, il
   dit ce qu'ils valent achetés un à un (au plus bas) et ce que le prix tapé
   fait économiser. La base revérifie tout : deux à quatre produits en vente,
   un prix plus bas que leur valeur.
   ========================================================================== */

const PLACES = [0, 1, 2, 3] as const;
const montant = (millimes: number | null | undefined) => (millimes ? formateMontant(millimes).replace(/\s/g, "") : "");

/** « 359 » ou « 359,500 » : ce que l'équipe a tapé, en millimes (null : illisible). */
function lu(texte: string): number | null {
  const t = texte.replace(/\s|tnd|dt/gi, "").replace(",", ".");
  return /^\d+(\.\d{1,3})?$/.test(t) ? Math.round(Number(t) * 1000) : null;
}

export function FormLot({ action, produits, lot, suffixe }: {
  action: string; produits: ProduitAuCatalogue[]; lot?: LotGestion; suffixe: string;
}) {
  const initial = PLACES.map((i) => lot?.produits[i]?.id ?? "");
  const [choix, setChoix] = useState<string[]>(initial);
  const [prix, setPrix] = useState(montant(lot?.prix_millimes));
  const id = (nom: string) => `lot-${suffixe}-${nom}`;

  // Les rayons, dans l'ordre où la base les range.
  const rayons = [...new Set(produits.map((p) => p.rayon ?? "Sans rayon"))];
  const parId = new Map(produits.map((p) => [p.id, p]));
  const pris = choix.filter(Boolean).map((x) => parId.get(x)).filter((p): p is ProduitAuCatalogue => Boolean(p));
  const distincts = new Set(pris.map((p) => p.id)).size === pris.length;
  const valeur = pris.reduce((s, p) => s + p.prix_min_millimes, 0);
  const prixLu = lu(prix);
  const economie = prixLu !== null && pris.length >= 2 ? valeur - prixLu : null;

  return (
    <form action={action} method="post" className="pm-form lot-form"
          onReset={() => { setChoix(initial); setPrix(montant(lot?.prix_millimes)); }}>
      <input type="hidden" name="geste" value="enregistrer" />
      {lot ? <input type="hidden" name="lot_id" value={lot.id} /> : null}

      <div className="pm-grille">
        <div className="champ">
          <label htmlFor={id("nom")}>Le nom du lot</label>
          <input id={id("nom")} name="nom" required minLength={2} maxLength={60} defaultValue={lot?.nom ?? ""} placeholder="Ex. La tenue du week-end" />
        </div>
        <div className="champ">
          <label htmlFor={id("accroche")}>Sa phrase sur la vitrine <span className="aide">(facultative)</span></label>
          <input id={id("accroche")} name="accroche" maxLength={160} defaultValue={lot?.accroche ?? ""} placeholder="Ex. Pour les après-midi d'été" />
        </div>
      </div>

      <fieldset className="lot-produits">
        <legend>Les produits <span className="aide">— de 2 à 4 ; le client choisit sa taille ou sa couleur</span></legend>
        {PLACES.map((i) => (
          <div className="champ" key={i}>
            <label htmlFor={id(`produit-${i}`)}>Produit {i + 1}{i < 2 ? "" : " (facultatif)"}</label>
            <select id={id(`produit-${i}`)} name="produit" required={i < 2} value={choix[i]}
                    onChange={(e) => setChoix((c) => c.map((x, j) => (j === i ? e.target.value : x)))}>
              <option value="">{i < 2 ? "Choisir un produit…" : "Aucun"}</option>
              {rayons.map((r) => (
                <optgroup key={r} label={r}>
                  {produits.filter((p) => (p.rayon ?? "Sans rayon") === r).map((p) => (
                    <option key={p.id} value={p.id}>{p.nom} — {montant(p.prix_min_millimes)} TND</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ))}
      </fieldset>

      <div className="pm-grille lot-prix-grille">
        <div className="champ">
          <label htmlFor={id("prix")}>Le prix du lot</label>
          <span className="pm-unite">
            <input id={id("prix")} name="prix" required inputMode="decimal" className="tabular-nums" value={prix}
                   onChange={(e) => setPrix(e.target.value)} placeholder="359" aria-describedby={id("bilan")} />
            <span aria-hidden="true">TND</span>
          </span>
        </div>
        <p id={id("bilan")} className="lot-bilan" aria-live="polite">
          {pris.length < 2 ? (
            <span className="aide">Choisissez au moins deux produits : leur valeur s&apos;affiche ici.</span>
          ) : !distincts ? (
            <span className="lot-bilan-refus">Le même produit deux fois : choisissez-en un autre.</span>
          ) : (
            <>
              <span>Achetés un à un : <b className="tabular-nums">{montant(valeur)} TND</b> au plus bas</span>
              {economie === null ? null : economie > 0 ? (
                <span className="lot-bilan-gain">Le client économise <b className="tabular-nums">{montant(economie)} TND</b> ({pourcentage(valeur, prixLu!)})</span>
              ) : (
                <span className="lot-bilan-refus">Le lot doit coûter moins que {montant(valeur)} TND.</span>
              )}
            </>
          )}
        </p>
      </div>

      <div className="carte-pied">
        <button className="btn btn-primaire">{lot ? "Enregistrer le lot" : "Mettre le lot en vente"}</button>
        {lot ? <button type="reset" className="btn btn-second">Annuler</button> : null}
      </div>
    </form>
  );
}
