"use client";

import { BoutonFavori } from "./BoutonFavori";
import { PartagerFiche } from "./PartagerFiche";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Prix } from "./Prix";
import { EtatStock } from "./EtatStock";
import { Calendrier, Coche, Lot, Panier } from "./Icones";
import { LivraisonEstimee } from "./LivraisonEstimee";
import { formatePrix } from "@/lib/prix";
import { ajouteAuPanier, annonceAjout } from "@/lib/panier";
import { photoVisible } from "@/lib/envol";
import { evenementPub } from "@/lib/pixels";
import { usePrixPro } from "@/lib/prix-pro";
import { champ, t } from "@/lib/i18n";
import { useSelection } from "./SelectionVariante";
import { etatVariante, jourPrevu, minimumVariante, precommandeDe, type Produit } from "@/lib/catalogue";
import { AlerteRetour } from "./AlerteRetour";
import { AxesDeclinaison } from "./AxesDeclinaison";
import { ContactProduit, lienWhatsappPiece, type ContactVente } from "./ContactProduit";
import { OffresQuantite } from "./OffresQuantite";
import { paliersDe, totalAvecPaliers } from "@/lib/paliers";
import type { CodeTheme } from "@/lib/theme";

/* ============================================================================
   LE BLOC DE DÉCISION — prix, choix des déclinaisons, quantité, mise au
   panier, et la barre d'achat collante du mobile. Réglage de la boutique
   (commande.achat_express) : « Commander maintenant » mène droit au tunnel
   avec cette déclinaison et cette quantité seules, le panier n'est pas
   touché. Réglage catalogue.precommandes : une déclinaison épuisée qu'un
   arrivage annoncé apporte se précommande (sa date, ce qu'il en reste) ;
   la base n'y réserve rien, la commande part à l'arrivage.

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
  prevenirRetour = false,
  partage = null,
  contact = null,
}: {
  produit: Produit;
  gabarit: CodeTheme;
  /** Réglage `commande.achat_express` : le bouton « Commander maintenant ». */
  achatExpress?: boolean;
  /** Réglage `catalogue.prevenir_retour` : sur une déclinaison indisponible,
   *  « Prévenez-moi de son retour » ; une valeur épuisée reste alors choisissable. */
  prevenirRetour?: boolean;
  /** Réglage `vitrine.partage` : « Partager », avec le nom de la boutique pour le message. */
  partage?: { boutique: string } | null;
  /** Un site vitrine (réglage vitrine.site_vitrine) : ni quantité ni panier,
   *  « Cette pièce vous intéresse ? » et les moyens de joindre la boutique. */
  contact?: ContactVente | null;
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
  // Les prix par quantité du produit (« 2 pour 99 ») : la base les appliquera.
  const paliers = paliersDe(produit.paliers);
  // Épuisée, mais un arrivage l'apporte : elle se précommande, dans la limite de ce qui arrive.
  const precommande = precommandeDe(variante);
  const sousMinimum = Boolean(variante) && stock > 0 && stock < minimum && !precommande;
  const disponible = Boolean(variante) && stock > 0 && stock >= minimum;
  const achetable = disponible || Boolean(precommande);
  const plafond = precommande ? precommande.reste : stock;
  const technique = gabarit === "technique";

  // La quantité ne dépasse jamais le stock réel de la déclinaison choisie, ni
  // ne descend sous son minimum ; changer de déclinaison efface le « Ajouté ».
  // Ajusté pendant le rendu, pas dans un effet (un rendu de moins, pas d'état
  // faux affiché).
  const cleDeclinaison = `${variante?.id ?? ""}:${plafond}:${minimum}`;
  const [declinaisonVue, setDeclinaisonVue] = useState(cleDeclinaison);
  const [minimumVu, setMinimumVu] = useState(minimum);
  if (declinaisonVue !== cleDeclinaison) {
    setDeclinaisonVue(cleDeclinaison);
    setMinimumVu(minimum);
    // Un autre minimum (les vis au détail par 20, la boîte de 200 à l'unité) :
    // la quantité repart de lui — jamais 20 boîtes par surprise.
    setQuantite((q) => (minimumVu !== minimum ? minimum : Math.max(minimum, Math.min(q, Math.max(minimum, plafond)))));
    setAjoute(false);
  }

  /* Le champ observé descend très loin sous l'écran : le bloc n'en sort que
     par le haut. Un saut qui le passe d'un coup (la touche Fin, une ancre,
     « réduire les animations ») franchit donc la limite comme un défilement —
     observé à l'écran seul, il passait de « dessous » à « dessus » sans
     jamais le croiser, et la barre ne venait pas. */
  useEffect(() => {
    const cible = blocAchat.current;
    if (!cible) return;
    const observateur = new IntersectionObserver(
      ([entree]) => setBarreVisible(!entree.isIntersecting),
      { rootMargin: "0px 0px 100000px 0px", threshold: 0 },
    );
    observateur.observe(cible);
    return () => observateur.disconnect();
  }, []);

  // Les pixels publicitaires, s'ils sont chargés (lib/pixels.ts) : la fiche regardée, une fois par produit.
  const vue = useRef<string | null>(null);
  useEffect(() => {
    const v = variante ?? produit.variantes[0];
    if (!v || vue.current === produit.id) return;
    vue.current = produit.id;
    evenementPub("ViewContent", [{ sku: v.sku, nom: champ(produit, "nom"), quantite: 1, prixMillimes: v.prix_millimes }]);
  }, [produit, variante]);

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

  const auPanier = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!variante || !achetable) return;
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
        ...(paliers.length ? { paliers } : {}),
        ...(precommande ? { precommande: precommande.date_prevue } : {}),
      },
      plafond,
    );
    setAjoute(true);
    // La photo qu'on regarde part vers le panier ; sinon, une pastille part du bouton.
    const bouton = e.currentTarget;
    annonceAjout({
      libelle: libelle(),
      quantite,
      prixMillimes: prixApplique,
      ...(image ? { image } : {}),
      depuis: photoVisible(document.querySelector(`[data-fiche="${CSS.escape(produit.slug)}"]`)) ?? bouton,
      bouton,
      auClavier: e.detail === 0,
    });
  };

  // L'achat express : cette déclinaison, cette quantité, rien d'autre.
  const lienExpress = variante && achetable ? `/commande?article=${variante.id}&quantite=${quantite}` : null;

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

      {/* Les prix par quantité (« 2 pour 99 ») : un choix règle la quantité. */}
      {variante && paliers.length && !contact ? (
        <OffresQuantite prixUnitaire={prixApplique} paliers={paliers} quantite={quantite} stock={plafond} minimum={minimum}
          onChoisir={(q) => setQuantite(q)} />
      ) : null}

      <AxesDeclinaison produit={produit} choix={choix} setChoix={setChoix} prixPros={prixPros} prevenirRetour={prevenirRetour} />

      {variante && precommande ? (
        <div className="fiche-precommande" data-precommande={precommande.date_prevue}>
          <p className="fiche-precommande-titre">
            <Calendrier taille={16} />
            <span>{t.precommande.titre(jourPrevu(precommande.date_prevue))}</span>
          </p>
          <p className="legende">{t.precommande.texte}</p>
          {precommande.reste <= 5 ? <p className="legende fiche-precommande-reste">{t.precommande.reste(precommande.reste)}</p> : null}
        </div>
      ) : variante && sousMinimum ? (
        <div className="fiche-indisponible">
          <p>{t.produit.sousMinimumTitre}</p>
          <p className="legende">{t.produit.sousMinimumTexte(stock, minimum)}</p>
          {prevenirRetour ? <AlerteRetour key={variante.id} varianteId={variante.id} /> : null}
        </div>
      ) : variante && !disponible ? (
        <div className="fiche-indisponible">
          <p>{t.produit.indisponibleTitre}</p>
          <p className="legende">{prevenirRetour ? t.alerte.indisponibleTexte : t.produit.indisponibleTexte}</p>
          {prevenirRetour ? <AlerteRetour key={variante.id} varianteId={variante.id} /> : null}
        </div>
      ) : null}

      <div className="fiche-stock">
        {precommande ? (
          <span className="etat etat-precommande">{t.precommande.etat}</span>
        ) : variante ? <EtatStock etat={etatVariante(variante)} restant={stock} /> : <span className="etat etat-rupture">{t.stock.rupture}</span>}
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

      {contact ? (
        <div className="fiche-contact-bloc" ref={blocAchat}>
          <ContactProduit contact={contact} piece={libelle()} reference={variante?.sku ?? null} />
          <BoutonFavori slug={produit.slug} nom={champ(produit, "nom")} className="fiche-favori fiche-contact-favori" />
        </div>
      ) : (
      <>
      <div className="achat" ref={blocAchat}>
        <div className="qte" role="group" aria-label={t.produit.quantite}>
          <button type="button" aria-label={t.produit.retirerUnArticle} disabled={quantite <= minimum} onClick={() => setQuantite((q) => Math.max(minimum, q - 1))}>
            −
          </button>
          <span aria-live="polite">{quantite}</span>
          <button type="button" aria-label={t.produit.ajouterUnArticle} disabled={quantite >= plafond} onClick={() => setQuantite((q) => Math.min(plafond, q + 1))}>
            +
          </button>
        </div>
        <button type="button" className="btn btn-primaire btn-ajout" data-ajoute={ajoute ? "" : undefined} disabled={!achetable} onClick={auPanier}>
          {ajoute ? <Coche taille={16} /> : null}
          {ajoute ? t.panier.ajoute : precommande ? t.precommande.bouton : t.produit.ajouterAuPanier}
        </button>
        <BoutonFavori slug={produit.slug} nom={champ(produit, "nom")} className="fiche-favori" />
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
      </>
      )}
      <p className="legende fiche-note">{t.produit.stockReel}</p>
      {disponible && delaiJours && !contact ? <LivraisonEstimee min={delaiJours.min} max={delaiJours.max} /> : null}
      {partage ? <PartagerFiche nom={champ(produit, "nom")} boutique={partage.boutique} /> : null}

      {/* Barre collante mobile : prix, déclinaison choisie, action. Rien d'autre. */}
      {barreVisible && contact ? (
        <div className="achat-mobile cache-desktop" role="region" aria-label={t.siteVitrine.contact}>
          <div className="min-w-0 flex-1">
            <p className="legende truncate">{declinaison() || champ(produit, "nom")}</p>
            {variante ? <Prix millimes={prixApplique} /> : null}
          </div>
          <a className="btn btn-primaire" href={lienWhatsappPiece(contact, libelle(), variante?.sku ?? null) ?? (contact.telephone ? `tel:${contact.telephone.replace(/[^\d+]/g, "")}` : "/contact")}
            target={contact.whatsapp ? "_blank" : undefined} rel={contact.whatsapp ? "noopener noreferrer" : undefined}>
            {contact.whatsapp ? t.siteVitrine.whatsapp : contact.telephone ? t.contact.appeler : t.siteVitrine.contact}
          </a>
        </div>
      ) : barreVisible ? (
        <div className="achat-mobile cache-desktop" role="region" aria-label={t.produit.ajouterAuPanier}>
          <div className="min-w-0 flex-1">
            <p className="legende truncate">{declinaison() || champ(produit, "nom")}</p>
            {variante ? <Prix millimes={totalAvecPaliers(prixApplique, quantite, paliers).total} /> : null}
          </div>
          {achatExpress && lienExpress ? (
            <>
              {/* Deux actions dans la barre : l'ajout au panier devient une icône. */}
              <button type="button" className="btn btn-second achat-mobile-icone" data-ajoute={ajoute ? "" : undefined} onClick={auPanier}
                aria-label={ajoute ? t.panier.ajoute : precommande ? t.precommande.bouton : t.produit.ajouterAuPanier}
                title={precommande ? t.precommande.bouton : t.produit.ajouterAuPanier}>
                {ajoute ? <Coche taille={18} /> : <Panier taille={18} />}
              </button>
              <Link className="btn btn-primaire" href={lienExpress} prefetch={false}>{t.produit.commanderMaintenant}</Link>
            </>
          ) : (
            <button type="button" className="btn btn-primaire" data-ajoute={ajoute ? "" : undefined} disabled={!achetable} onClick={auPanier}>
              {ajoute ? <Coche taille={16} /> : null}
              {ajoute ? t.panier.ajoute : precommande ? t.precommande.bouton : t.produit.ajouterAuPanier}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
