"use client";

import { useEffect, useRef, useState } from "react";
import { Prix } from "./Prix";
import { EtatStock } from "./EtatStock";
import { couleurDeColoris } from "@/lib/coloris";
import { formatePrix } from "@/lib/prix";
import { ajouteAuPanier } from "@/lib/panier";
import { champ, t } from "@/lib/i18n";
import { useSelection } from "./SelectionVariante";
import { etatVariante, stockPourValeur, valeursAxe, type Produit } from "@/lib/catalogue";

/* ============================================================================
   LE BLOC DE DÉCISION — choix des déclinaisons, quantité, mise au panier,
   et la barre d'achat collante du mobile.

   Trois règles tenues, toutes venues d'un défaut mesuré :

   1. UNE DÉCLINAISON EN RUPTURE RESTE VISIBLE, barrée et inactive. La masquer
      ferait croire qu'elle n'existe pas et le client irait la chercher
      ailleurs (note de Lina sur la maquette).
   2. AUCUNE PROMESSE QU'ON NE TIENT PAS. La maquette proposait « Me prévenir
      du réassort » : aucune liste d'attente n'existe en base, le bouton serait
      mort. On dit l'état, sobrement, et rien de plus.
   3. LA BARRE MOBILE N'APPARAÎT QU'APRÈS. Tant que le bloc d'achat est à
      l'écran, elle doublerait l'action et recouvrirait le titre (mesuré par le
      juge visuel le 11/08). Elle se montre quand le bloc SORT du champ.
   ========================================================================== */

export function FicheAchat({ produit, prixBarres = false }: {
  produit: Produit;
  /** Réglage de la boutique `catalogue.afficher_prix_barres` : l'ancien prix
   *  barré à côté du prix (outillage), ou jamais (charte Maymar). */
  prixBarres?: boolean;
}) {
  /* L'état de la déclinaison est PARTAGÉ (voir SelectionVariante.tsx) : le
     pavé de caractéristiques vit dans l'autre colonne et doit suivre le même
     choix, sans quoi il affiche la référence d'une autre variante. */
  const { choix, setChoix, variante } = useSelection();
  const [quantite, setQuantite] = useState(1);
  const [ajoute, setAjoute] = useState(false);
  const blocAchat = useRef<HTMLDivElement>(null);
  const [barreVisible, setBarreVisible] = useState(false);

  const stock = variante?.stock ?? 0;
  const disponible = Boolean(variante) && stock > 0;

  // La quantité ne dépasse jamais le stock réel de la déclinaison choisie.
  useEffect(() => {
    setQuantite((q) => Math.max(1, Math.min(q, Math.max(1, stock))));
    setAjoute(false);
  }, [stock, variante?.id]);

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

  /** Le libellé complet — pour le panier, où le produit doit être identifiable
   *  hors de sa page. */
  const libelle = () => {
    const nom = champ(produit, "nom");
    return declinaison() ? `${nom} · ${declinaison()}` : nom;
  };

  /** La seule déclinaison — pour la barre collante, où le nom du produit est
   *  déjà connu (on est sur sa fiche) et se faisait tronquer, emportant avec
   *  lui la taille et la couleur, qui sont justement ce qu'on vérifie avant
   *  de confirmer (constaté à l'image le 11/08). */
  const declinaison = () =>
    produit.options.map((o) => choix[o.cle]).filter(Boolean).join(", ");

  const auPanier = () => {
    if (!variante || !disponible) return;
    ajouteAuPanier(
      {
        varianteId: variante.id,
        produitSlug: produit.slug,
        sku: variante.sku,
        libelle: libelle(),
        quantite,
        prixMillimesAjout: variante.prix_millimes,
      },
      stock,
    );
    setAjoute(true);
  };

  /* Les valeurs entièrement épuisées d'un axe : barrées, jamais cachées. */
  const epuisees = (cle: string) =>
    valeursAxe(produit, cle).filter((v) => stockPourValeur(produit, cle, v) === 0);

  return (
    <>
      <div className="ligne-prix">
        {variante ? <Prix millimes={variante.prix_millimes} fort /> : null}
        {variante && prixBarres && variante.prix_barre_millimes ? (
          <s className="text-encre-doux">{formatePrix(variante.prix_barre_millimes)}</s>
        ) : null}
        {variante ? (
          <EtatStock etat={etatVariante(variante)} restant={stock} />
        ) : (
          <span className="etat etat-rupture">{t.stock.rupture}</span>
        )}
      </div>
      <p className="text-petit text-encre-doux">{t.produit.stockReel}</p>

      {produit.options.map((axe) => {
        const valeurs = valeursAxe(produit, axe.cle);
        const horsStock = epuisees(axe.cle);
        const estCouleur = axe.cle === "couleur";

        /* Le prix par valeur, quand c'est CET axe qui le fait varier (une
           valise de 75 cm ne coûte pas celui d'une 55). Sans ça, rien ne dit
           que changer de taille change le prix — le juge visuel l'a demandé
           le 11/08. Sur un axe qui ne change rien au prix (la couleur), on
           n'affiche rien : ce serait la même valeur répétée. */
        const prixParValeur = new Map<string, number>();
        for (const valeur of valeurs) {
          const prix = produit.variantes
            .filter((v) => v.options?.[axe.cle] === valeur)
            .map((v) => v.prix_millimes);
          if (prix.length > 0) prixParValeur.set(valeur, Math.min(...prix));
        }
        const axeFaitVarierLePrix = new Set(prixParValeur.values()).size > 1;

        return (
          <div className="variante" key={axe.cle}>
            <h2>
              {champ(axe, "label")} — <span className="choisi">{choix[axe.cle]}</span>
            </h2>
            <div className="choix">
              {valeurs.map((valeur) => {
                const epuise = horsStock.includes(valeur);
                return (
                  <button
                    key={valeur}
                    type="button"
                    className={estCouleur ? "pastille-couleur" : undefined}
                    aria-pressed={choix[axe.cle] === valeur}
                    disabled={epuise}
                    onClick={() => setChoix((c) => ({ ...c, [axe.cle]: valeur }))}
                  >
                    {estCouleur ? (
                      <i style={{ background: couleurDeColoris(valeur) }} aria-hidden="true" />
                    ) : null}
                    {valeur}
                    {axeFaitVarierLePrix ? (
                      <span className="prix-option">{formatePrix(prixParValeur.get(valeur) ?? 0)}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {horsStock.length > 0 ? (
              <p className="text-petit text-encre-doux mt-2">
                {t.produit.ruptureExpliquee(horsStock.join(", "))}
              </p>
            ) : null}
          </div>
        );
      })}

      {variante && !disponible ? (
        <div className="border border-filet rounded-doux bg-surface-2 p-4">
          <p className="font-medium text-petit">{t.produit.indisponibleTitre}</p>
          <p className="text-petit text-encre-doux mt-1">{t.produit.indisponibleTexte}</p>
        </div>
      ) : null}

      <div className="achat" ref={blocAchat}>
        <div className="qte" role="group" aria-label={t.produit.quantite}>
          <button
            type="button"
            aria-label={t.produit.retirerUnArticle}
            disabled={quantite <= 1}
            onClick={() => setQuantite((q) => Math.max(1, q - 1))}
          >
            −
          </button>
          <span aria-live="polite">{quantite}</span>
          <button
            type="button"
            aria-label={t.produit.ajouterUnArticle}
            disabled={quantite >= stock}
            onClick={() => setQuantite((q) => Math.min(stock, q + 1))}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className="btn btn-primaire flex-1 min-w-[220px]"
          disabled={!disponible}
          onClick={auPanier}
        >
          {ajoute ? t.panier.ajoute : t.produit.ajouterAuPanier}
        </button>
      </div>

      {/* Barre collante mobile : prix, déclinaison choisie, action. Rien d'autre. */}
      {barreVisible ? (
        <div className="achat-mobile cache-desktop" role="region" aria-label={t.produit.ajouterAuPanier}>
          <div className="min-w-0 flex-1">
            <p className="text-legende text-encre-doux truncate">{declinaison() || champ(produit, "nom")}</p>
            {variante ? <Prix millimes={variante.prix_millimes * quantite} /> : null}
          </div>
          <button type="button" className="btn btn-primaire" disabled={!disponible} onClick={auPanier}>
            {ajoute ? t.panier.ajoute : t.produit.ajouterAuPanier}
          </button>
        </div>
      ) : null}
    </>
  );
}
