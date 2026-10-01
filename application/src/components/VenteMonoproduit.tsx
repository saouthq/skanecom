"use client";

import { useEffect, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { Prix } from "./Prix";
import { EtatStock } from "./EtatStock";
import { AlerteRetour } from "./AlerteRetour";
import { AxesDeclinaison } from "./AxesDeclinaison";
import { OffresQuantite } from "./OffresQuantite";
import { Tunnel } from "./Tunnel";
import { Coche } from "./Icones";
import { ContactProduit, type ContactVente } from "./ContactProduit";
import { useSelection } from "./SelectionVariante";
import { ajouteAuPanier, annonceAjout } from "@/lib/panier";
import { photoVisible } from "@/lib/envol";
import { evenementPub } from "@/lib/pixels";
import { signaleEtape } from "@/lib/etapes-visite";
import { usePrixPro } from "@/lib/prix-pro";
import { paliersDe, totalAvecPaliers } from "@/lib/paliers";
import { formatePrix } from "@/lib/prix";
import { etatVariante, minimumVariante, type Produit } from "@/lib/catalogue";
import { champ, t } from "@/lib/i18n";

/* ============================================================================
   LA PAGE DE VENTE (structure Monoproduit) — ce qui vit dans le navigateur :
   l'offre choisie (1, 2 ou 3 pièces, chaque fois moins chères à l'unité :
   les paliers de la base, migration 71), la déclinaison, et le formulaire de
   commande posé sous les offres, qui suit l'une et l'autre (le tunnel de
   l'achat express : cet article seul, le panier n'est pas touché).

   « Commander · 147,000 TND » mène au formulaire et met le focus sur son
   premier champ. Au téléphone, une fois ce bouton passé et tant que le
   formulaire n'est pas à l'écran, la barre du bas le redit (l'offre, son
   total, « Commander »).

   L'entonnoir des visites : le produit regardé (deux secondes sur la page),
   puis la commande commencée (le premier champ touché) — la page les
   signale elle-même (lib/etapes-visite.ts).
   ========================================================================== */

type ProprietesTunnel = Omit<ComponentProps<typeof Tunnel>, "express" | "integre">;

export function VenteMonoproduit({
  produit, galerie, tete, assurances, tunnel, prixBarres, prevenirRetour, rappel, contact = null,
}: {
  produit: Produit;
  /** Les photos (rendues par le serveur). */
  galerie: ReactNode;
  /** Le surtitre, le titre, la note, la promesse (rendus par le serveur). */
  tete: ReactNode;
  /** Ce qui rassure, sous le bouton. */
  assurances: ReactNode;
  tunnel: ProprietesTunnel;
  prixBarres: boolean;
  prevenirRetour: boolean;
  /** La boutique rappelle pour confirmer (le chapô du formulaire le dit). */
  rappel: boolean;
  /** Un site vitrine (sans commande en ligne) : ni offres ni formulaire, les moyens de joindre la boutique. */
  contact?: ContactVente | null;
}) {
  const { choix, setChoix, variante } = useSelection();
  const minimum = minimumVariante(variante);
  const [quantite, setQuantite] = useState(minimum);
  const [ajoute, setAjoute] = useState(false);

  const prixPros = usePrixPro([produit.id]);
  const prixProVariante = variante ? prixPros[variante.id] : undefined;
  const prixApplique = prixProVariante ?? variante?.prix_millimes ?? 0;
  const paliers = paliersDe(produit.paliers);
  const stock = variante?.stock ?? 0;
  const sousMinimum = Boolean(variante) && stock > 0 && stock < minimum;
  const disponible = Boolean(variante) && stock > 0 && !sousMinimum;
  const total = totalAvecPaliers(prixApplique, quantite, paliers);
  const prixBarre = variante && prixBarres && variante.prix_barre_millimes ? variante.prix_barre_millimes : null;

  // Une autre déclinaison : la quantité reste dans son stock et au-dessus de
  // son minimum (ajusté pendant le rendu, comme sur la fiche).
  const cleDeclinaison = `${variante?.id ?? ""}:${stock}:${minimum}`;
  const [declinaisonVue, setDeclinaisonVue] = useState(cleDeclinaison);
  if (declinaisonVue !== cleDeclinaison) {
    setDeclinaisonVue(cleDeclinaison);
    setQuantite((q) => Math.max(minimum, Math.min(q, Math.max(minimum, stock))));
    setAjoute(false);
  }

  // Le produit regardé : le pixel (une fois), et l'étape de l'entonnoir après deux secondes sur la page.
  const vue = useRef(false);
  useEffect(() => {
    const v = variante ?? produit.variantes[0];
    if (!v || vue.current) return;
    vue.current = true;
    evenementPub("ViewContent", [{ sku: v.sku, nom: champ(produit, "nom"), quantite: 1, prixMillimes: v.prix_millimes }]);
  }, [produit, variante]);
  useEffect(() => {
    const minuterie = window.setTimeout(() => signaleEtape("fiche"), 2000);
    return () => window.clearTimeout(minuterie);
  }, []);

  // La barre du téléphone : le bouton passé, le formulaire pas encore là.
  const bouton = useRef<HTMLAnchorElement>(null);
  const commande = useRef<HTMLElement>(null);
  const [boutonPasse, setBoutonPasse] = useState(false);
  const [commandeVisible, setCommandeVisible] = useState(false);
  useEffect(() => {
    const b = bouton.current;
    const c = commande.current;
    if (!b || !c) return;
    // Le bouton n'est « passé » que par le haut (la marge du bas va très loin).
    const ob = new IntersectionObserver(([e]) => setBoutonPasse(!e.isIntersecting), { rootMargin: "0px 0px 100000px 0px" });
    const oc = new IntersectionObserver(([e]) => setCommandeVisible(e.isIntersecting));
    ob.observe(b);
    oc.observe(c);
    return () => {
      ob.disconnect();
      oc.disconnect();
    };
  }, []);

  /** Au formulaire : la section à l'écran, le focus sur son premier champ. */
  const versCommande = (e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    e.preventDefault();
    const section = commande.current;
    if (!section) return;
    const doux = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: doux ? "smooth" : "auto", block: "start" });
    const premier = section.querySelector<HTMLElement>("form input:not([type=radio]):not([type=checkbox]):not([type=hidden]), form select");
    premier?.focus({ preventScroll: true });
  };

  const libelle = () => {
    const declinaison = produit.options.map((o) => choix[o.cle]).filter(Boolean).join(", ");
    const nom = champ(produit, "nom");
    return declinaison ? `${nom} · ${declinaison}` : nom;
  };

  const auPanier = (e: MouseEvent<HTMLButtonElement>) => {
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
        ...(paliers.length ? { paliers } : {}),
      },
      stock,
    );
    setAjoute(true);
    const declencheur = e.currentTarget;
    annonceAjout({
      libelle: libelle(),
      quantite,
      prixMillimes: prixApplique,
      ...(image ? { image } : {}),
      depuis: photoVisible(document.querySelector(`[data-fiche="${CSS.escape(produit.slug)}"]`)) ?? declencheur,
      bouton: declencheur,
      auClavier: e.detail === 0,
    });
  };

  const offre = paliers.length ? t.produit.offrePieces(quantite) : null;
  const libelleCommander = disponible ? t.vente.commanderTotal(formatePrix(total.total)) : t.vente.commander;

  return (
    <>
      <div className="enveloppe pv-grille" data-fiche={produit.slug}>
        <div className="pv-galerie">{galerie}</div>
        <div className="pv-achat">
          {tete}
          <div className="fiche-achat">
            {/* Avec des offres, chacune dit son prix : le prix seul ne se répète au-dessus que barré. */}
            {!paliers.length || prixBarre ? (
              <div className="fiche-prix">
                {variante ? <Prix millimes={prixApplique} fort /> : null}
                {prixBarre ? <s className="prix-barre">{formatePrix(prixBarre)}</s> : null}
              </div>
            ) : null}

            {variante && paliers.length && !contact ? (
              <OffresQuantite forme="cartes" prixUnitaire={prixApplique} paliers={paliers} quantite={quantite} stock={stock} minimum={minimum}
                onChoisir={(q) => setQuantite(q)} />
            ) : null}

            <AxesDeclinaison produit={produit} choix={choix} setChoix={setChoix} prixPros={prixPros} prevenirRetour={prevenirRetour} />

            {variante && !disponible ? (
              <div className="fiche-indisponible">
                <p>{sousMinimum ? t.produit.sousMinimumTitre : t.produit.indisponibleTitre}</p>
                <p className="legende">{sousMinimum ? t.produit.sousMinimumTexte(stock, minimum) : prevenirRetour ? t.alerte.indisponibleTexte : t.produit.indisponibleTexte}</p>
                {prevenirRetour ? <AlerteRetour key={variante.id} varianteId={variante.id} /> : null}
              </div>
            ) : (
              <div className="fiche-stock">
                {variante ? <EtatStock etat={etatVariante(variante)} restant={stock} /> : <span className="etat etat-rupture">{t.stock.rupture}</span>}
              </div>
            )}

            {/* Sans prix par quantité, la quantité se règle à la main. */}
            {!paliers.length && disponible && !contact ? (
              <div className="qte pv-qte" role="group" aria-label={t.produit.quantite}>
                <button type="button" aria-label={t.produit.retirerUnArticle} disabled={quantite <= minimum} onClick={() => setQuantite((q) => Math.max(minimum, q - 1))}>
                  −
                </button>
                <span aria-live="polite">{quantite}</span>
                <button type="button" aria-label={t.produit.ajouterUnArticle} disabled={quantite >= stock} onClick={() => setQuantite((q) => Math.min(stock, q + 1))}>
                  +
                </button>
              </div>
            ) : null}

            {contact ? (
              <ContactProduit contact={contact} piece={libelle()} reference={variante?.sku ?? null} />
            ) : (
            <div className="pv-action">
              {disponible ? (
                <a ref={bouton} className="btn btn-primaire pv-commander" href="#commande" onClick={versCommande}>
                  {libelleCommander}
                </a>
              ) : (
                <a ref={bouton} className="btn btn-primaire pv-commander" aria-disabled="true" href="#commande" onClick={(e) => e.preventDefault()}>
                  {t.vente.commander}
                </a>
              )}
              <p className="legende">{t.vente.commanderAide}</p>
              <button type="button" className="btn-lien pv-panier" data-ajoute={ajoute ? "" : undefined} disabled={!disponible} onClick={auPanier}>
                {ajoute ? <Coche taille={14} /> : null}
                {ajoute ? t.vente.ajoute : t.vente.ouPanier}
              </button>
            </div>
            )}
          </div>
          {assurances}
        </div>
      </div>

      {contact ? null : (
      <section ref={commande} id="commande" className="pv-commande" aria-labelledby="pv-commande-titre" tabIndex={-1}>
        <div className="enveloppe">
          <header className="pv-commande-tete">
            <h2 id="pv-commande-titre">{t.vente.commandeTitre}</h2>
            <p className="legende">
              {offre ? <b>{t.vente.offreChoisie(offre)}</b> : null} {rappel ? t.vente.commandeChapoRappel : t.vente.commandeChapo}
            </p>
          </header>
          {variante && disponible ? (
            <Tunnel {...tunnel} express={{ varianteId: variante.id, quantite }} integre />
          ) : (
            <div className="listing-vide tunnel-vide">
              <p>{t.vente.indisponible}</p>
              <a className="btn btn-second" href="/catalogue">{t.vente.autresProduits}</a>
            </div>
          )}
        </div>
      </section>
      )}

      {boutonPasse && !commandeVisible && disponible && !contact ? (
        <div className="achat-mobile pv-barre cache-desktop" role="region" aria-label={t.vente.barre}>
          <div className="min-w-0 flex-1">
            <p className="legende truncate">{offre ?? champ(produit, "nom")}</p>
            <Prix millimes={total.total} />
          </div>
          <button type="button" className="btn btn-primaire" onClick={versCommande}>{t.vente.commander}</button>
        </div>
      ) : null}
    </>
  );
}
