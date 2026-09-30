"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Prix } from "./Prix";
import { EtatStock } from "./EtatStock";
import { Coche, Lot, Panier } from "./Icones";
import { LivraisonEstimee } from "./LivraisonEstimee";
import { couleurDeColoris } from "@/lib/coloris";
import { formatePrix } from "@/lib/prix";
import { ajouteAuPanier, ouvrePanier } from "@/lib/panier";
import { prixApplique as prixDe, usePrixPro } from "@/lib/prix-pro";
import { champ, t } from "@/lib/i18n";
import { useSelection } from "./SelectionVariante";
import { etatVariante, minimumVariante, stockPourValeur, valeursAxe, type Produit } from "@/lib/catalogue";
import type { CodeTheme } from "@/lib/theme";

/* ============================================================================
   LE BLOC DE DÉCISION — prix, choix des déclinaisons, quantité, mise au
   panier, et la barre d'achat collante du mobile. Réglage de la boutique
   (commande.achat_express) : « Commander maintenant » mène droit au tunnel
   avec cette déclinaison et cette quantité seules, le panier n'est pas
   touché.

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
  delaiJours = null,
  achatExpress = false,
}: {
  produit: Produit;
  gabarit: CodeTheme;
  /** Réglage `commande.achat_express` : le bouton « Commander maintenant ». */
  achatExpress?: boolean;
  /** L'enveloppe du délai de livraison (jours ouvrés) : la fenêtre estimée. */
  delaiJours?: { min: number; max: number } | null;
  /** Réglage `catalogue.afficher_prix_barres` : l'ancien prix barré à côté du
   *  prix, ou jamais. */
  prixBarres?: boolean;
}) {
  /* L'état de la déclinaison est PARTAGÉ (SelectionVariante.tsx) : le pavé de
     caractéristiques vit ailleurs dans la page et doit suivre le même choix,
     sans quoi il afficherait la référence d'une autre variante. */
  const { choix, setChoix, variante } = useSelection();
  // Le minimum de commande de la déclinaison (des vis par dix) : la quantité
  // part de là et n'y redescend pas en dessous.
  const minimum = minimumVariante(variante);
  const [quantite, setQuantite] = useState(minimum);
  const [ajoute, setAjoute] = useState(false);
  const blocAchat = useRef<HTMLDivElement>(null);
  const [barreVisible, setBarreVisible] = useState(false);

  // Le prix pro du client connecté, s'il en est un (lu après l'hydratation :
  // la page servie est la même pour tous).
  const prixPros = usePrixPro([produit.id]);
  const prixProVariante = variante ? prixPros[variante.id] : undefined;
  const prixApplique = prixProVariante ?? variante?.prix_millimes ?? 0;

  const stock = variante?.stock ?? 0;
  const sousMinimum = Boolean(variante) && stock > 0 && stock < minimum;
  const disponible = Boolean(variante) && stock > 0 && !sousMinimum;
  const technique = gabarit === "technique";

  // La quantité ne dépasse jamais le stock réel de la déclinaison choisie, ni
  // ne descend sous son minimum ; changer de déclinaison efface le « Ajouté ».
  // Ajusté pendant le rendu, pas dans un effet (un rendu de moins, pas d'état
  // faux affiché).
  const cleDeclinaison = `${variante?.id ?? ""}:${stock}:${minimum}`;
  const [declinaisonVue, setDeclinaisonVue] = useState(cleDeclinaison);
  const [minimumVu, setMinimumVu] = useState(minimum);
  if (declinaisonVue !== cleDeclinaison) {
    setDeclinaisonVue(cleDeclinaison);
    setMinimumVu(minimum);
    // Un autre minimum (les vis au détail par 20, la boîte de 200 à l'unité) :
    // la quantité repart de lui — jamais 20 boîtes par surprise.
    setQuantite((q) => (minimumVu !== minimum ? minimum : Math.max(minimum, Math.min(q, Math.max(minimum, stock)))));
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
        prixMillimesAjout: prixApplique,
        ...(image ? { image } : {}),
        ...(minimum > 1 ? { quantiteMin: minimum } : {}),
      },
      stock,
    );
    setAjoute(true);
    ouvrePanier();
  };

  // L'achat express : cette déclinaison, cette quantité, rien d'autre.
  const lienExpress = variante && disponible ? `/commande?article=${variante.id}&quantite=${quantite}` : null;

  /* Les valeurs entièrement épuisées d'un axe : barrées, jamais cachées. */
  const epuisees = (cle: string) => valeursAxe(produit, cle).filter((v) => stockPourValeur(produit, cle, v) === 0);

  const prixBarre = variante && prixBarres && variante.prix_barre_millimes ? variante.prix_barre_millimes : null;

  return (
    <div className="fiche-achat">
      {variante && prixProVariante !== undefined ? (
        <div className="fiche-prix fiche-prix-pro" data-pro="">
          <span className="fiche-prix-pro-tete"><span className="pro-badge">{t.pro.badge}</span> {t.pro.prixPro}</span>
          <span className="fiche-prix">
            <Prix millimes={prixProVariante} fort />
            {technique ? <span className="ttc">{t.produit.ttc}</span> : null}
          </span>
          <span className="prix-public">
            {t.pro.prixPublic} <s>{formatePrix(variante.prix_millimes)}</s>
          </span>
        </div>
      ) : (
        <div className="fiche-prix">
          {variante ? <Prix millimes={variante.prix_millimes} fort /> : null}
          {technique && variante ? <span className="ttc">{t.produit.ttc}</span> : null}
          {prixBarre ? <s className="prix-barre">{formatePrix(prixBarre)}</s> : null}
        </div>
      )}

      {produit.options.map((axe) => {
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

      {variante && sousMinimum ? (
        <div className="fiche-indisponible">
          <p>{t.produit.sousMinimumTitre}</p>
          <p className="legende">{t.produit.sousMinimumTexte(stock, minimum)}</p>
        </div>
      ) : variante && !disponible ? (
        <div className="fiche-indisponible">
          <p>{t.produit.indisponibleTitre}</p>
          <p className="legende">{t.produit.indisponibleTexte}</p>
        </div>
      ) : null}

      <div className="fiche-stock">
        {variante ? <EtatStock etat={etatVariante(variante)} restant={stock} /> : <span className="etat etat-rupture">{t.stock.rupture}</span>}
      </div>

      {minimum > 1 && !sousMinimum ? (
        <p className="fiche-minimum" data-minimum={minimum}>
          <Lot />
          <span>
            {t.produit.minimum(minimum)}
            {variante ? <span className="fiche-minimum-prix"> · {formatePrix(prixApplique * minimum)}</span> : null}
          </span>
        </p>
      ) : null}

      <div className="achat" ref={blocAchat}>
        <div className="qte" role="group" aria-label={t.produit.quantite}>
          <button type="button" aria-label={t.produit.retirerUnArticle} disabled={quantite <= minimum} onClick={() => setQuantite((q) => Math.max(minimum, q - 1))}>
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
      {achatExpress ? (
        <div className="fiche-express">
          {lienExpress ? (
            <Link className="btn btn-second btn-express" href={lienExpress} prefetch={false}>
              {t.produit.commanderMaintenant}
            </Link>
          ) : (
            <button type="button" className="btn btn-second btn-express" disabled>
              {t.produit.commanderMaintenant}
            </button>
          )}
          <p className="legende">{t.produit.commanderMaintenantAide}</p>
        </div>
      ) : null}
      <p className="legende fiche-note">{t.produit.stockReel}</p>
      {disponible && delaiJours ? <LivraisonEstimee min={delaiJours.min} max={delaiJours.max} /> : null}

      {/* Barre collante mobile : prix, déclinaison choisie, action. Rien d'autre. */}
      {barreVisible ? (
        <div className="achat-mobile cache-desktop" role="region" aria-label={t.produit.ajouterAuPanier}>
          <div className="min-w-0 flex-1">
            <p className="legende truncate">{declinaison() || champ(produit, "nom")}</p>
            {variante ? <Prix millimes={prixApplique * quantite} /> : null}
          </div>
          {achatExpress && lienExpress ? (
            <>
              {/* Deux actions dans la barre : l'ajout au panier devient une icône. */}
              <button type="button" className="btn btn-second achat-mobile-icone" data-ajoute={ajoute ? "" : undefined} onClick={auPanier}
                aria-label={ajoute ? t.panier.ajoute : t.produit.ajouterAuPanier} title={t.produit.ajouterAuPanier}>
                {ajoute ? <Coche taille={18} /> : <Panier taille={18} />}
              </button>
              <Link className="btn btn-primaire" href={lienExpress} prefetch={false}>{t.produit.commanderMaintenant}</Link>
            </>
          ) : (
            <button type="button" className="btn btn-primaire" data-ajoute={ajoute ? "" : undefined} disabled={!disponible} onClick={auPanier}>
              {ajoute ? <Coche taille={16} /> : null}
              {ajoute ? t.panier.ajoute : t.produit.ajouterAuPanier}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
