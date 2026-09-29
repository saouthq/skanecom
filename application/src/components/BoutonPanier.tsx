"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Panier as IconePanier } from "./Icones";
import { Prix } from "./Prix";
import { Tiroir } from "./Tiroir";
import { changeQuantitePanier, retireDuPanier, usePanier } from "@/lib/panier";
import { nombreArticles, PANIER_OUVRIR, totalMillimes } from "@/lib/panier-contrat";
import { urlFichier } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";
import { t } from "@/lib/i18n";
import type { CodeTheme } from "@/lib/theme";

/* ============================================================================
   LE PANIER DANS L'EN-TÊTE — compteur + tiroir.

   Périmètre assumé : la vitrine POSE un panier local pour que le site vende,
   mais ne commande pas encore. Le bouton « Commander » appartient au tunnel :
   il se branchera ICI, sur le contrat `panier-contrat.ts`. Aucun bouton mort :
   on n'affiche jamais une action qui ne se passe pas.

   Le tiroir s'ouvre aussi tout seul après un ajout (événement PANIER_OUVRIR) :
   on voit ce qu'on vient de mettre de côté, et le chemin du retour.

   Le compteur est rendu à 0 par le serveur puis corrigé au montage — le
   panier vit dans le navigateur, l'HTML servi ne peut pas le connaître.
   ========================================================================== */

export function BoutonPanier({
  gabarit,
  seuilGratuite,
}: {
  gabarit: CodeTheme;
  /** Livraison offerte dès ce montant (réglage de la boutique), ou jamais. */
  seuilGratuite: number | null;
}) {
  const panier = usePanier();
  const [ouvert, setOuvert] = useState(false);
  const n = nombreArticles(panier);
  const total = totalMillimes(panier);

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
        <span className="bouton-panier-compte" data-compte={n} aria-hidden="true">
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
              </>
            ) : null}
            <button type="button" className="btn btn-second btn-bloc" onClick={() => setOuvert(false)}>
              {t.panier.continuer}
            </button>
          </>
        }
      >
        {panier.lignes.length > 0 && reste !== null && seuilGratuite !== null ? (
          <div className="jauge-livraison">
            <p>{reste > 0 ? t.panier.resteAvantGratuite(formatePrix(reste)) : t.panier.gratuiteAtteinte}</p>
            <span className="jauge" aria-hidden="true">
              <span style={{ inlineSize: `${Math.min(100, Math.round((total / seuilGratuite) * 100))}%` }} />
            </span>
          </div>
        ) : null}

        {panier.lignes.length === 0 ? (
          <div className="panier-vide">
            <p>{t.panier.vide}</p>
            <p className="legende">{t.panier.videTexte}</p>
          </div>
        ) : (
          <ul className="panier-lignes">
            {panier.lignes.map((ligne) => (
              <li key={ligne.varianteId} className="panier-ligne">
                <Link href={`/produit/${ligne.produitSlug}`} className="panier-vignette" tabIndex={-1} aria-hidden="true" onClick={() => setOuvert(false)}>
                  {ligne.image ? <Image src={urlFichier(ligne.image)} alt="" fill sizes="96px" /> : null}
                </Link>
                <div className="panier-ligne-corps">
                  <div className="panier-ligne-tete">
                    <Link href={`/produit/${ligne.produitSlug}`} className="panier-libelle" onClick={() => setOuvert(false)}>
                      {ligne.libelle}
                    </Link>
                    <Prix millimes={ligne.prixMillimesAjout * ligne.quantite} />
                  </div>
                  <p className="legende tabular-nums">{ligne.sku}</p>
                  <div className="panier-ligne-actions">
                    <div className="qte qte-petite" role="group" aria-label={t.produit.quantite}>
                      <button type="button" aria-label={t.produit.retirerUnArticle} onClick={() => changeQuantitePanier(ligne.varianteId, ligne.quantite - 1)}>
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
            ))}
          </ul>
        )}
      </Tiroir>
    </>
  );
}
