"use client";

import { couleurDeColoris } from "@/lib/coloris";
import { formatePrix } from "@/lib/prix";
import { prixApplique as prixDe, type PrixPro } from "@/lib/prix-pro";
import { champ, t } from "@/lib/i18n";
import { jourPrevu, precommandeDe, stockPourValeur, valeursAxe, type Produit } from "@/lib/catalogue";

/* ============================================================================
   LES AXES D'UNE DÉCLINAISON — taille, couleur, contenance : un bouton par
   valeur, la couleur en pastille. Partagés par le bloc d'achat de la fiche
   (FicheAchat) et la page de vente (VenteMonoproduit).

   Une valeur entièrement épuisée reste visible, barrée et inactive (la
   masquer ferait croire qu'elle n'existe pas) ; avec « Prévenez-moi de son
   retour », elle reste choisissable — et aussi quand un arrivage annoncé
   l'apporte (réglage catalogue.precommandes) : elle se précommande. Le prix
   par valeur ne s'affiche que sur l'axe qui le fait varier.
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
  /* Parmi elles, celles qu'un arrivage apporte : la date la plus proche. */
  const precommande = (cle: string, valeur: string) =>
    produit.variantes
      .filter((v) => v.options?.[cle] === valeur)
      .map((v) => precommandeDe(v)?.date_prevue)
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? null;

  return produit.options.map((axe) => {
    const valeurs = valeursAxe(produit, axe.cle);
    const epuiseesAxe = epuisees(axe.cle);
    const aPrecommander = epuiseesAxe.filter((v) => precommande(axe.cle, v));
    const horsStock = epuiseesAxe.filter((v) => !aPrecommander.includes(v));
    const estCouleur = axe.cle === "couleur";

    /* Le prix par valeur, quand c'est CET axe qui le fait varier (une
       valise de 75 cm ne coûte pas celui d'une 55). Sur un axe qui ne
       change rien au prix (la couleur), on n'affiche rien. Le prix dit est
       celui de la déclinaison qu'on obtiendrait avec les autres choix
       gardés (la cabine noire, si le noir est choisi) — sinon le plus bas
       de la valeur : jamais un prix qu'on ne paiera pas. */
    const prixParValeur = new Map<string, number>();
    for (const valeur of valeurs) {
      const cible: Record<string, string | undefined> = { ...choix, [axe.cle]: valeur };
      const exacte = produit.variantes.find((v) => produit.options.every((o) => v.options?.[o.cle] === cible[o.cle]));
      if (exacte) { prixParValeur.set(valeur, prixDe(prixPros, exacte)); continue; }
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
            const enPrecommande = aPrecommander.includes(valeur);
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
                data-precommande={enPrecommande ? "" : undefined}
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
        {/* Une phrase par date d'arrivée : deux arrivages, deux dates dites. */}
        {[...new Set(aPrecommander.map((v) => precommande(axe.cle, v)!))].sort().map((date) => (
          <p key={date} className="legende axe-note axe-note-precommande">
            {t.precommande.valeurs(aPrecommander.filter((v) => precommande(axe.cle, v) === date).join(", "), jourPrevu(date))}
          </p>
        ))}
        {horsStock.length > 0 ? (
          <p className="legende axe-note">
            {prevenirRetour ? t.alerte.ruptureExpliquee(horsStock.join(", ")) : t.produit.ruptureExpliquee(horsStock.join(", "))}
          </p>
        ) : null}
      </fieldset>
    );
  });
}
