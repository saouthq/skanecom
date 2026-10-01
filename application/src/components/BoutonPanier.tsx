"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Billets, Bouclier, Camion, Coche, Fleche, Magasin, Panier as IconePanier } from "./Icones";
import { Prix } from "./Prix";
import { Tiroir } from "./Tiroir";
import { ConfirmationAjout } from "./ConfirmationAjout";
import { EnsembleDuPanier } from "./EnsembleDuPanier";
import { changeQuantitePanier, retireDuPanier, usePanier, usePanierLu } from "@/lib/panier";
import { minimumLigne, nombreArticles, PANIER_AJOUT, PANIER_OUVRIR, totalLigne, totalMillimes, type AjoutAnnonce } from "@/lib/panier-contrat";
import { envole } from "@/lib/envol";
import { urlFichier } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";
import { t } from "@/lib/i18n";
import type { Assurance } from "@/lib/faits";
import type { CodeTheme } from "@/lib/theme";

const ICONES_ASSURANCE = { billets: Billets, camion: Camion, bouclier: Bouclier, magasin: Magasin } as const;

/* ============================================================================
   LE PANIER DANS L'EN-TÊTE — compteur + tiroir.

   Le panier vit dans le navigateur (contrat `panier-contrat.ts`) ; le bouton
   « Commander » mène au tunnel (/commande), qui relit tout en base avant de
   laisser commander. Aucun bouton mort : il n'apparaît qu'avec des articles.

   Après un ajout (événement PANIER_AJOUT), la photo de l'article s'envole
   jusqu'ici (lib/envol.ts), le compteur rebondit à son arrivée, puis la
   confirmation se pose (ConfirmationAjout) : « Commander » ou « Voir le
   panier ». Le tiroir ne s'ouvre plus de lui-même — seulement à la demande
   (ce bouton, la confirmation, le tunnel : PANIER_OUVRIR).

   Le compteur est rendu à 0 par le serveur puis corrigé au montage — le
   panier vit dans le navigateur, l'HTML servi ne peut pas le connaître.
   Il rebondit quand un article arrive (pas à cette correction du montage).
   ========================================================================== */

export function BoutonPanier({
  gabarit,
  seuilGratuite,
  assurances = [],
  devis = false,
  ensemble = false,
}: {
  gabarit: CodeTheme;
  /** Livraison offerte dès ce montant (réglage de la boutique), ou jamais. */
  seuilGratuite: number | null;
  /** Rappelées sous les articles (lib/faits.ts). */
  assurances?: Assurance[];
  /** La demande de devis (module devis) : un lien sous « Commander ». */
  devis?: boolean;
  /** « Souvent achetés avec votre panier » (réglage catalogue.achetes_ensemble). */
  ensemble?: boolean;
}) {
  const panier = usePanier();
  const [ouvert, setOuvert] = useState(false);
  const n = nombreArticles(panier);
  const total = totalMillimes(panier);

  // Le rebond : un compteur de bonds, qui sert de clé à la pastille (une clé
  // neuve rejoue l'animation). Compté sur le panier LU (`null` avant
  // l'hydratation) : le premier chiffre lu n'en fait pas.
  const lu = usePanierLu();
  const nLu = lu ? nombreArticles(lu) : null;
  const [bonds, setBonds] = useState(0);
  const nVu = useRef<number | null>(null);
  // Un article en vol : le rebond attend son arrivée.
  const enVol = useRef(0);
  useEffect(() => {
    if (nLu === null) return;
    if (nVu.current !== null && nLu > nVu.current && enVol.current === 0) setBonds((b) => b + 1);
    nVu.current = nLu;
  }, [nLu]);

  const bouton = useRef<HTMLButtonElement>(null);
  const retour = useRef<HTMLElement | null>(null);
  const [confirmation, setConfirmation] = useState<(AjoutAnnonce & { id: number }) | null>(null);
  const [annonce, setAnnonce] = useState("");

  useEffect(() => {
    const ouvre = () => {
      retour.current = null;
      setConfirmation(null);
      setOuvert(true);
    };
    let dernier = 0;
    const auAjout = (e: Event) => {
      const ajout = (e as CustomEvent<AjoutAnnonce>).detail;
      if (!ajout) return;
      const id = ++dernier;
      enVol.current += 1;
      setConfirmation(null);
      // Lu par les lecteurs d'écran tout de suite ; l'espace final change le
      // texte d'un ajout à l'autre, pour qu'un second ajout soit lu aussi.
      setAnnonce(`${t.panier.ajoute} : ${ajout.libelle}${id % 2 ? "" : " "}`);
      void envole(ajout.depuis, bouton.current, {
        image: ajout.image ? urlFichier(ajout.image) : null,
        initiale: ajout.libelle.trim().charAt(0),
      }).then(() => {
        enVol.current = Math.max(0, enVol.current - 1);
        setBonds((b) => b + 1);
        // Deux ajouts rapprochés : une seule confirmation, la dernière.
        if (id === dernier) setConfirmation({ ...ajout, id });
      });
    };
    window.addEventListener(PANIER_OUVRIR, ouvre);
    window.addEventListener(PANIER_AJOUT, auAjout);
    return () => {
      window.removeEventListener(PANIER_OUVRIR, ouvre);
      window.removeEventListener(PANIER_AJOUT, auAjout);
    };
  }, []);

  const reste = seuilGratuite !== null ? Math.max(0, seuilGratuite - total) : null;

  return (
    <>
      <p className="sr-only" aria-live="polite">{annonce}</p>
      {confirmation && !ouvert ? (
        <ConfirmationAjout
          key={confirmation.id}
          ajout={confirmation}
          n={n}
          reste={panier.lignes.length > 0 ? reste : null}
          onFermer={() => setConfirmation(null)}
          onVoir={() => {
            retour.current = confirmation.bouton ?? null;
            setConfirmation(null);
            setOuvert(true);
          }}
        />
      ) : null}
      <button
        ref={bouton}
        type="button"
        className="bouton-panier"
        data-gabarit-panier={gabarit}
        aria-label={t.panier.ouvrir(n)}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => {
          retour.current = null;
          setConfirmation(null);
          setOuvert(true);
        }}
      >
        <IconePanier taille={gabarit === "technique" ? 24 : 20} />
        <span className="bouton-panier-texte" aria-hidden="true">{t.commun.panier}</span>
        <span key={bonds} className="bouton-panier-compte" data-compte={n} data-bond={bonds > 0 ? "" : undefined} aria-hidden="true">
          {n}
        </span>
      </button>

      <Tiroir
        ouvert={ouvert}
        onFermer={() => setOuvert(false)}
        retour={retour}
        titre={t.panier.titre}
        entete={<h2 className="tiroir-titre">{t.panier.titreCompte(n)}</h2>}
        etiquetteFermer={t.panier.fermer}
        className="tiroir-panier"
        pied={
          <>
            {panier.lignes.length > 0 ? (
              <>
                <div className="panier-total">
                  <span>{t.panier.total}</span>
                  <Prix millimes={total} fort />
                </div>
                <p className="legende">{reste === 0 ? t.panier.livraisonComprise : t.panier.horsLivraison}</p>
                <Link href="/commande" className="btn btn-primaire btn-bloc panier-commander" onClick={() => setOuvert(false)}>
                  {t.panier.commander}
                  <Fleche taille={16} className="icone-fleche rtl:-scale-x-100" />
                </Link>
                {devis ? (
                  <Link href="/devis" className="panier-devis" onClick={() => setOuvert(false)}>
                    <b>{t.devis.demander}</b>
                    <span className="legende">{t.devis.demanderAide}</span>
                  </Link>
                ) : null}
              </>
            ) : null}
            <button type="button" className="btn btn-second btn-bloc" onClick={() => setOuvert(false)}>
              {t.panier.continuer}
            </button>
          </>
        }
      >
        {panier.lignes.length > 0 && reste !== null && seuilGratuite !== null ? (
          <div className="jauge-livraison" data-atteinte={reste === 0 ? "" : undefined}>
            <p>
              {reste === 0 ? <Coche taille={14} /> : null}
              {reste > 0 ? t.panier.resteAvantGratuite(formatePrix(reste)) : t.panier.gratuiteAtteinte}
            </p>
            <span className="jauge" aria-hidden="true">
              <span style={{ inlineSize: `${Math.min(100, Math.round((total / seuilGratuite) * 100))}%` }} />
            </span>
          </div>
        ) : null}

        {panier.lignes.length === 0 ? (
          <div className="panier-vide">
            <span className="panier-vide-icone" aria-hidden="true">
              <IconePanier taille={26} />
            </span>
            <p>{t.panier.vide}</p>
            <p className="legende">{t.panier.videTexte}</p>
          </div>
        ) : (
          <ul className="panier-lignes">
            {panier.lignes.map((ligne) => {
              // Au minimum de la déclinaison, « − » ne descend plus (« Retirer » reste là).
              const minimum = minimumLigne(ligne);
              return (
              <li key={ligne.varianteId} className="panier-ligne">
                <Link href={`/produit/${ligne.produitSlug}`} className="panier-vignette" tabIndex={-1} aria-hidden="true" onClick={() => setOuvert(false)}>
                  {ligne.image ? (
                    <Image src={urlFichier(ligne.image)} alt="" fill sizes="96px" />
                  ) : (
                    <span className="panier-vignette-attente">{ligne.libelle.trim().charAt(0)}</span>
                  )}
                </Link>
                <div className="panier-ligne-corps">
                  <div className="panier-ligne-tete">
                    <Link href={`/produit/${ligne.produitSlug}`} className="panier-libelle" onClick={() => setOuvert(false)}>
                      {ligne.libelle}
                    </Link>
                    <span className="panier-ligne-prix">
                      {totalLigne(ligne).palier ? <s className="prix-barre"><Prix millimes={totalLigne(ligne).sansPalier} /></s> : null}
                      <Prix millimes={totalLigne(ligne).total} />
                    </span>
                  </div>
                  <p className="legende tabular-nums">
                    {ligne.sku}
                    {minimum > 1 ? <span className="panier-minimum"> · {t.panier.parMinimum(minimum)}</span> : null}
                    {totalLigne(ligne).palier ? <span className="panier-palier"> · {t.panier.palierApplique(totalLigne(ligne).palier!.quantite, formatePrix(totalLigne(ligne).palier!.prixMillimes))}</span> : null}
                  </p>
                  <div className="panier-ligne-actions">
                    <div className="qte qte-petite" role="group" aria-label={t.produit.quantite}>
                      <button type="button" aria-label={t.produit.retirerUnArticle} disabled={minimum > 1 && ligne.quantite <= minimum}
                              onClick={() => changeQuantitePanier(ligne.varianteId, ligne.quantite - 1)}>
                        −
                      </button>
                      <span>{ligne.quantite}</span>
                      <button type="button" aria-label={t.produit.ajouterUnArticle} onClick={() => changeQuantitePanier(ligne.varianteId, ligne.quantite + 1)}>
                        +
                      </button>
                    </div>
                    <button type="button" className="btn-lien legende" aria-label={t.panier.retirer(ligne.libelle)} onClick={() => retireDuPanier(ligne.varianteId)}>
                      {t.panier.retirerCourt}
                    </button>
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}

        {ensemble && panier.lignes.length > 0 ? (
          <EnsembleDuPanier slugs={panier.lignes.map((l) => l.produitSlug)} onChoix={() => setOuvert(false)} />
        ) : null}

        {panier.lignes.length > 0 && assurances.length > 0 ? (
          <ul className="panier-assurances">
            {assurances.map((a) => {
              const Icone = ICONES_ASSURANCE[a.icone];
              return (
                <li key={a.texte}>
                  <Icone taille={18} />
                  {a.texte}
                </li>
              );
            })}
          </ul>
        ) : null}
      </Tiroir>
    </>
  );
}
