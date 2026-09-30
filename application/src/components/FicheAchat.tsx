"use client";

import { useEffect, useRef, useState } from "react";
import { Prix } from "./Prix";
import { EtatStock } from "./EtatStock";
import { Coche } from "./Icones";
import { couleurDeColoris } from "@/lib/coloris";
import { formatePrix } from "@/lib/prix";
import { ajouteAuPanier, ouvrePanier } from "@/lib/panier";
import { champ, t } from "@/lib/i18n";
import { useSelection } from "./SelectionVariante";
import { etatVariante, stockPourValeur, valeursAxe, type Produit } from "@/lib/catalogue";
import type { CodeTheme } from "@/lib/theme";

/* ============================================================================
   LE BLOC DE DÉCISION — prix, choix des déclinaisons, quantité, mise au
   panier, et la barre d'achat collante du mobile.

   Trois règles tenues, toutes venues d'un défaut mesuré :

   1. UNE DÉCLINAISON EN RUPTURE RESTE VISIBLE, barrée et inactive. La masquer
      ferait croire qu'elle n'existe pas et le client irait la chercher
      ailleurs.
   2. AUCUNE PROMESSE QU'ON NE TIENT PAS : pas de « Me prévenir du réassort »
      tant qu'aucune liste d'attente n'existe en base. On dit l'état, sobrement.
   3. LA BARRE MOBILE N'APPARAÎT QU'APRÈS. Tant que le bloc d'achat est à
      l'écran, elle doublerait l'action et recouvrirait le titre. Elle se
      montre quand le bloc SORT du champ.

   Les deux gabarits partagent cette logique ; ils diffèrent par la mise en
   forme (editorial.css, technique.css) et par ce qu'ils disent du stock :
   le gabarit technique donne toujours le nombre de pièces.
   ========================================================================== */

export function FicheAchat({
  produit,
  gabarit,
  prixBarres = false,
}: {
  produit: Produit;
  gabarit: CodeTheme;
  /** Réglage `catalogue.afficher_prix_barres` : l'ancien prix barré à côté du
   *  prix, ou jamais. */
  prixBarres?: boolean;
}) {
  /* L'état de la déclinaison est PARTAGÉ (SelectionVariante.tsx) : le pavé de
     caractéristiques vit ailleurs dans la page et doit suivre le même choix,
     sans quoi il afficherait la référence d'une autre variante. */
  const { choix, setChoix, variante } = useSelection();
  const [quantite, setQuantite] = useState(1);
  const [ajoute, setAjoute] = useState(false);
  const blocAchat = useRef<HTMLDivElement>(null);
  const [barreVisible, setBarreVisible] = useState(false);

  const stock = variante?.stock ?? 0;
  const disponible = Boolean(variante) && stock > 0;
  const technique = gabarit === "technique";

  // La quantité ne dépasse jamais le stock réel de la déclinaison choisie ;
  // changer de déclinaison efface le « Ajouté ». Ajusté pendant le rendu,
  // pas dans un effet (un rendu de moins, pas d'état faux affiché).
  const cleDeclinaison = `${variante?.id ?? ""}:${stock}`;
  const [declinaisonVue, setDeclinaisonVue] = useState(cleDeclinaison);
  if (declinaisonVue !== cleDeclinaison) {
    setDeclinaisonVue(cleDeclinaison);
    setQuantite((q) => Math.max(1, Math.min(q, Math.max(1, stock))));
    setAjoute(false);
  }

  useEffect(() => {
    const cible = blocAchat.current;
    if (!cible) return;
    const observateur = new IntersectionObserver(
      ([entree]) => setBarreVisible(!entree.isIntersecting && entree.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observateur.observe(cible);
    return () => observateur.disconnect();
  }, []);

  /** La seule déclinaison — pour la barre collante, où le nom du produit est
   *  déjà connu : la taille et la couleur sont ce qu'on vérifie avant de
   *  confirmer. */
  const declinaison = () => produit.options.map((o) => choix[o.cle]).filter(Boolean).join(", ");

  /** Le libellé complet — pour le panier, où le produit doit être
   *  identifiable hors de sa page. */
  const libelle = () => {
    const nom = champ(produit, "nom");
    return declinaison() ? `${nom} · ${declinaison()}` : nom;
  };

  const auPanier = () => {
    if (!variante || !disponible) return;
    const image =
      variante.image_chemin ??
      produit.images.find((i) => i.variante_id === variante.id)?.chemin ??
      produit.images.find((i) => i.variante_id === null)?.chemin;
    ajouteAuPanier(
      {
        varianteId: variante.id,
        produitSlug: produit.slug,
        sku: variante.sku,
        libelle: libelle(),
        quantite,
        prixMillimesAjout: variante.prix_millimes,
        ...(image ? { image } : {}),
      },
      stock,
    );
    setAjoute(true);
    ouvrePanier();
  };

  /* Les valeurs entièrement épuisées d'un axe : barrées, jamais cachées. */
  const epuisees = (cle: string) => valeursAxe(produit, cle).filter((v) => stockPourValeur(produit, cle, v) === 0);

  const prixBarre = variante && prixBarres && variante.prix_barre_millimes ? variante.prix_barre_millimes : null;

  return (
    <div className="fiche-achat">
      <div className="fiche-prix">
        {variante ? <Prix millimes={variante.prix_millimes} fort /> : null}
        {technique && variante ? <span className="ttc">{t.produit.ttc}</span> : null}
        {prixBarre ? <s className="prix-barre">{formatePrix(prixBarre)}</s> : null}
      </div>

      {produit.options.map((axe) => {
        const valeurs = valeursAxe(produit, axe.cle);
        const horsStock = epuisees(axe.cle);
        const estCouleur = axe.cle === "couleur";

        /* Le prix par valeur, quand c'est CET axe qui le fait varier (une
           valise de 75 cm ne coûte pas celui d'une 55). Sur un axe qui ne
           change rien au prix (la couleur), on n'affiche rien. */
        const prixParValeur = new Map<string, number>();
        for (const valeur of valeurs) {
          const prix = produit.variantes.filter((v) => v.options?.[axe.cle] === valeur).map((v) => v.prix_millimes);
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
                    disabled={epuise}
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
            {horsStock.length > 0 ? <p className="legende axe-note">{t.produit.ruptureExpliquee(horsStock.join(", "))}</p> : null}
          </fieldset>
        );
      })}

      {variante && !disponible ? (
        <div className="fiche-indisponible">
          <p>{t.produit.indisponibleTitre}</p>
          <p className="legende">{t.produit.indisponibleTexte}</p>
        </div>
      ) : null}

      <div className="fiche-stock">
        {variante ? <EtatStock etat={etatVariante(variante)} restant={stock} /> : <span className="etat etat-rupture">{t.stock.rupture}</span>}
      </div>

      <div className="achat" ref={blocAchat}>
        <div className="qte" role="group" aria-label={t.produit.quantite}>
          <button type="button" aria-label={t.produit.retirerUnArticle} disabled={quantite <= 1} onClick={() => setQuantite((q) => Math.max(1, q - 1))}>
            −
          </button>
          <span aria-live="polite">{quantite}</span>
          <button type="button" aria-label={t.produit.ajouterUnArticle} disabled={quantite >= stock} onClick={() => setQuantite((q) => Math.min(stock, q + 1))}>
            +
          </button>
        </div>
        <button type="button" className="btn btn-primaire btn-ajout" data-ajoute={ajoute ? "" : undefined} disabled={!disponible} onClick={auPanier}>
          {ajoute ? <Coche taille={16} /> : null}
          {ajoute ? t.panier.ajoute : t.produit.ajouterAuPanier}
        </button>
      </div>
      <p className="legende fiche-note">{t.produit.stockReel}</p>

      {/* Barre collante mobile : prix, déclinaison choisie, action. Rien d'autre. */}
      {barreVisible ? (
        <div className="achat-mobile cache-desktop" role="region" aria-label={t.produit.ajouterAuPanier}>
          <div className="min-w-0 flex-1">
            <p className="legende truncate">{declinaison() || champ(produit, "nom")}</p>
            {variante ? <Prix millimes={variante.prix_millimes * quantite} /> : null}
          </div>
          <button type="button" className="btn btn-primaire" data-ajoute={ajoute ? "" : undefined} disabled={!disponible} onClick={auPanier}>
            {ajoute ? <Coche taille={16} /> : null}
            {ajoute ? t.panier.ajoute : t.produit.ajouterAuPanier}
          </button>
        </div>
      ) : null}
    </div>
  );
}
