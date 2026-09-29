"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Croix, Panier as IconePanier } from "./Icones";
import { Prix } from "./Prix";
import { changeQuantitePanier, retireDuPanier, usePanier } from "@/lib/panier";
import { nombreArticles, totalMillimes } from "@/lib/panier-contrat";
import { t } from "@/lib/i18n";

/* ============================================================================
   LE PANIER DANS L'EN-TÊTE — compteur + tiroir de consultation.

   Périmètre assumé (décision Luna, question alex-1786406877) : la vitrine
   POSE un panier local pour que le site vende, mais ne commande pas. Ce
   tiroir montre ce qu'on a mis de côté et laisse le retirer — deux gestes
   réels. Le bouton « Commander » et la page de panier appartiennent au tunnel
   de Max : ils se brancheront ICI, sur le contrat `panier-contrat.ts`.

   Aucun bouton mort : on n'affiche jamais une action qui ne se passe pas.

   Le compteur est rendu à 0 par le serveur puis corrigé au montage — le
   panier vit dans le navigateur (localStorage), l'HTML servi ne peut pas le
   connaître, et un rendu serveur qui le devinerait casserait l'hydratation.
   ========================================================================== */

const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function BoutonPanier() {
  const panier = usePanier();
  const [ouvert, setOuvert] = useState(false);
  const fermeture = useRef<HTMLButtonElement>(null);
  const declencheur = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const n = nombreArticles(panier);

  /* Un tiroir modal se comporte comme tel : le focus y entre à l'ouverture,
     Tab y tourne en rond au lieu de filer vers la page grisée derrière, la
     page ne défile plus sous lui, et à la fermeture le focus revient sur le
     bouton du panier — là où l'utilisateur au clavier l'avait laissé. */
  useEffect(() => {
    if (!ouvert) return;
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOuvert(false);
        return;
      }
      if (e.key !== "Tab" || !panneau.current) return;
      const cibles = [...panneau.current.querySelectorAll<HTMLElement>(FOCUSABLES)];
      if (cibles.length === 0) return;
      const premier = cibles[0];
      const dernier = cibles[cibles.length - 1];
      const dedans = panneau.current.contains(document.activeElement);
      if (e.shiftKey && (!dedans || document.activeElement === premier)) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && (!dedans || document.activeElement === dernier)) {
        e.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener("keydown", auClavier);
    fermeture.current?.focus();
    const racine = document.documentElement;
    const defilement = racine.style.overflow;
    racine.style.overflow = "hidden";
    const bouton = declencheur.current;
    return () => {
      document.removeEventListener("keydown", auClavier);
      racine.style.overflow = defilement;
      bouton?.focus();
    };
  }, [ouvert]);

  return (
    <>
      <button
        ref={declencheur}
        type="button"
        className="icone-btn relative"
        aria-label={t.panier.ouvrir(n)}
        aria-expanded={ouvert}
        onClick={() => setOuvert(true)}
      >
        <IconePanier />
        {n > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 end-0 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-accent text-sur-accent text-legende tabular-nums"
          >
            {n}
          </span>
        ) : null}
      </button>

      {ouvert ? (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={t.panier.titre}
        >
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 bg-encre/35"
            onClick={() => setOuvert(false)}
          />
          <div ref={panneau} className="relative flex flex-col w-full max-w-[26rem] bg-surface shadow-releve border-s border-filet">
            <div className="flex items-center justify-between gap-4 px-marge py-4 border-b border-filet">
              <h2 className="text-t4">{t.panier.titre}</h2>
              <button
                ref={fermeture}
                type="button"
                className="icone-btn"
                aria-label={t.panier.fermer}
                onClick={() => setOuvert(false)}
              >
                <Croix taille={18} />
              </button>
            </div>

            {panier.lignes.length === 0 ? (
              <div className="px-marge py-8">
                <p className="text-encre">{t.panier.vide}</p>
                <p className="text-petit text-encre-doux mt-2">{t.panier.videTexte}</p>
              </div>
            ) : (
              <ul className="flex-1 overflow-y-auto px-marge divide-y divide-filet">
                {panier.lignes.map((ligne) => (
                  <li key={ligne.varianteId} className="py-4 flex gap-3 items-start">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/produit/${ligne.produitSlug}`}
                        className="text-petit font-medium hover:underline"
                        onClick={() => setOuvert(false)}
                      >
                        {ligne.libelle}
                      </Link>
                      <p className="text-legende text-encre-doux mt-1 tabular-nums">{ligne.sku}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="qte" role="group" aria-label={t.produit.quantite}>
                          <button
                            type="button"
                            aria-label={t.produit.retirerUnArticle}
                            onClick={() => changeQuantitePanier(ligne.varianteId, ligne.quantite - 1)}
                          >
                            −
                          </button>
                          <span>{ligne.quantite}</span>
                          <button
                            type="button"
                            aria-label={t.produit.ajouterUnArticle}
                            onClick={() => changeQuantitePanier(ligne.varianteId, ligne.quantite + 1)}
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className="btn-lien text-petit"
                          aria-label={t.panier.retirer(ligne.libelle)}
                          onClick={() => retireDuPanier(ligne.varianteId)}
                        >
                          {t.panier.retirerCourt}
                        </button>
                      </div>
                    </div>
                    <Prix millimes={ligne.prixMillimesAjout * ligne.quantite} />
                  </li>
                ))}
              </ul>
            )}

            <div className="px-marge py-4 border-t border-filet">
              {panier.lignes.length > 0 ? (
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-petit text-encre-doux">{t.panier.total}</span>
                  <Prix millimes={totalMillimes(panier)} fort />
                </div>
              ) : null}
              {panier.lignes.length > 0 ? (
                <p className="text-legende text-encre-doux mt-1">{t.panier.horsLivraison}</p>
              ) : null}
              <button type="button" className="btn btn-second btn-bloc mt-4" onClick={() => setOuvert(false)}>
                {t.panier.continuer}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
