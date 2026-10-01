"use client";

import { couleurDeColoris } from "@/lib/coloris";
import { formatePrix } from "@/lib/prix";
import { prixApplique as prixDe, type PrixPro } from "@/lib/prix-pro";
import { champ, t } from "@/lib/i18n";
import { stockPourValeur, valeursAxe, type Produit } from "@/lib/catalogue";

/* ============================================================================
   LES AXES D'UNE DÉCLINAISON — taille, couleur, contenance : un bouton par
   valeur, la couleur en pastille. Partagés par le bloc d'achat de la fiche
   (FicheAchat) et la page de vente (VenteMonoproduit).

   Une valeur entièrement épuisée reste visible, barrée et inactive (la
   masquer ferait croire qu'elle n'existe pas) ; avec « Prévenez-moi de son
   retour », elle reste choisissable. Le prix par valeur ne s'affiche que
   sur l'axe qui le fait varier.
   ========================================================================== */

export function AxesDeclinaison({ produit, choix, setChoix, prixPros, prevenirRetour }: {
  produit: Produit;
  choix: Record<string, string>;
  setChoix: (maj: (c: Record<string, string>) => Record<string, string>) => void;
  prixPros: PrixPro;
  prevenirRetour: boolean;
}) {
  /* Les valeurs entièrement épuisées d'un axe : barrées, jamais cachées. */
  const epuisees = (cle: string) => valeursAxe(produit, cle).filter((v) => stockPourValeur(produit, cle, v) === 0);

  return produit.options.map((axe) => {
    const valeurs = valeursAxe(produit, axe.cle);
    const horsStock = epuisees(axe.cle);
    const estCouleur = axe.cle === "couleur";

    /* Le prix par valeur, quand c'est CET axe qui le fait varier (une
       valise de 75 cm ne coûte pas celui d'une 55). Sur un axe qui ne
       change rien au prix (la couleur), on n'affiche rien. */
    const prixParValeur = new Map<string, number>();
    for (const valeur of valeurs) {
      const prix = produit.variantes.filter((v) => v.options?.[axe.cle] === valeur).map((v) => prixDe(prixPros, v));
      if (prix.length > 0) prixParValeur.set(valeur, Math.min(...prix));
    }
    const axeFaitVarierLePrix = new Set(prixParValeur.values()).size > 1;

    return (
      <fieldset className="axe" key={axe.cle}>
        <legend>
          <span>{champ(axe, "label")}</span>
          <span className="choisi">{choix[axe.cle]}</span>
        </legend>
        <div className={estCouleur ? "valeurs valeurs-couleur" : "valeurs"}>
          {valeurs.map((valeur) => {
            const epuise = horsStock.includes(valeur);
            return (
              <button
                key={valeur}
                type="button"
                className={estCouleur ? "valeur valeur-couleur" : "valeur"}
                aria-pressed={choix[axe.cle] === valeur}
                aria-label={estCouleur ? valeur : undefined}
                title={estCouleur ? valeur : undefined}
                disabled={epuise && !prevenirRetour}
                data-epuise={epuise && prevenirRetour ? "" : undefined}
                onClick={() => setChoix((c) => ({ ...c, [axe.cle]: valeur }))}
              >
                {estCouleur ? (
                  <i style={{ background: couleurDeColoris(valeur) }} aria-hidden="true" />
                ) : (
                  <>
                    <span>{valeur}</span>
                    {axeFaitVarierLePrix ? <span className="prix-option">{formatePrix(prixParValeur.get(valeur) ?? 0)}</span> : null}
                  </>
                )}
              </button>
            );
          })}
        </div>
        {horsStock.length > 0 ? (
          <p className="legende axe-note">
            {prevenirRetour ? t.alerte.ruptureExpliquee(horsStock.join(", ")) : t.produit.ruptureExpliquee(horsStock.join(", "))}
          </p>
        ) : null}
      </fieldset>
    );
  });
}
