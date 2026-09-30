"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Billets, Bouclier, Camion, Coche, Fleche, Magasin, Panier as IconePanier } from "./Icones";
import { Prix } from "./Prix";
import { Tiroir } from "./Tiroir";
import { changeQuantitePanier, retireDuPanier, usePanier, usePanierLu } from "@/lib/panier";
import { minimumLigne, nombreArticles, PANIER_OUVRIR, totalMillimes } from "@/lib/panier-contrat";
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

   Le tiroir s'ouvre aussi tout seul après un ajout (événement PANIER_OUVRIR) :
   on voit ce qu'on vient de mettre de côté, et le chemin du retour.

   Le compteur est rendu à 0 par le serveur puis corrigé au montage — le
   panier vit dans le navigateur, l'HTML servi ne peut pas le connaître.
   Il rebondit quand un article arrive (pas à cette correction du montage).
   ========================================================================== */

export function BoutonPanier({
  gabarit,
  seuilGratuite,
  assurances = [],
  devis = false,
}: {
  gabarit: CodeTheme;
  /** Livraison offerte dès ce montant (réglage de la boutique), ou jamais. */
  seuilGratuite: number | null;
  /** Rappelées sous les articles (lib/faits.ts). */
  assurances?: Assurance[];
  /** La demande de devis (module devis) : un lien sous « Commander ». */
  devis?: boolean;
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
  useEffect(() => {
    if (nLu === null) return;
    if (nVu.current !== null && nLu > nVu.current) setBonds((b) => b + 1);
    nVu.current = nLu;
  }, [nLu]);

  useEffect(() => {
    const ouvre = () => setOuvert(true);
    window.addEventListener(PANIER_OUVRIR, ouvre);
    return () => window.removeEventListener(PANIER_OUVRIR, ouvre);
  }, []);

  const reste = seuilGratuite !== null ? Math.max(0, seuilGratuite - total) : null;

  return (
    <>
      <button
        type="button"
        className="bouton-panier"
        data-gabarit-panier={gabarit}
        aria-label={t.panier.ouvrir(n)}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => setOuvert(true)}
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
                <p className="legende">{t.panier.horsLivraison}</p>
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
                    <Prix millimes={ligne.prixMillimesAjout * ligne.quantite} />
                  </div>
                  <p className="legende tabular-nums">
                    {ligne.sku}
                    {minimum > 1 ? <span className="panier-minimum"> · {t.panier.parMinimum(minimum)}</span> : null}
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
