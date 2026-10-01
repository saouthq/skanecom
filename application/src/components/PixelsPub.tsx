"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PANIER_LIGNE, type LigneAjoutee } from "@/lib/panier-contrat";
import {
  CONSENTEMENT_CHOISI,
  CONSENTEMENT_OUVRIR,
  chargePixels,
  ecrisConsentement,
  evenementPub,
  lisConsentement,
  pageVuePub,
  type ChoixPub,
  type Pixels,
} from "@/lib/pixels";
import { t } from "@/lib/i18n";

/* ============================================================================
   LE CONSENTEMENT AUX PIXELS PUBLICITAIRES, et ce qu'ils suivent de page en
   page (lib/pixels.ts). Posé par le layout quand la boutique a un pixel.

   Le bandeau paraît tant que le visiteur n'a pas choisi : en bas de l'écran,
   sans le bloquer ni prendre le focus ; « Refuser » et « Accepter » côte à
   côte, du même poids. Jamais pendant la commande (le tunnel n'est pas le
   moment) : le choix se fait ailleurs, ou pas du tout — sans choix, rien ne
   se charge. Le pied de page le rouvre (« Cookies publicitaires ») ; retirer
   son accord recharge la page, sans les scripts.

   Accord donné : chaque navigation compte une page vue, chaque ajout au
   panier un « AddToCart ». La fiche, le tunnel et la fin de commande
   émettent les leurs (evenementPub).
   ========================================================================== */

function abonne(rappel: () => void): () => void {
  window.addEventListener(CONSENTEMENT_CHOISI, rappel);
  window.addEventListener("storage", rappel);
  return () => {
    window.removeEventListener(CONSENTEMENT_CHOISI, rappel);
    window.removeEventListener("storage", rappel);
  };
}

export function PixelsPub({ boutique, nom, pixels }: { boutique: string; nom: string; pixels: Pixels }) {
  const chemin = usePathname();
  // undefined : pas encore lu (le serveur ne sait rien du choix : le bandeau n'est pas dans la page servie) ; null : pas de choix.
  const garde = useSyncExternalStore(abonne, () => lisConsentement(boutique), () => undefined);
  // Le choix de cette page, si le navigateur refuse de le garder (stockage fermé).
  const [dePage, setDePage] = useState<ChoixPub | null>(null);
  const choix = dePage ?? garde;
  const [rouvert, setRouvert] = useState(false);
  const premiere = useRef(true);
  const retour = useRef<HTMLElement | null>(null);
  const premierBouton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const ouvre = (e: Event) => {
      retour.current = (e.target instanceof HTMLElement ? e.target : null) ?? (document.activeElement as HTMLElement | null);
      setRouvert(true);
    };
    window.addEventListener(CONSENTEMENT_OUVRIR, ouvre);
    return () => window.removeEventListener(CONSENTEMENT_OUVRIR, ouvre);
  }, [boutique]);

  useEffect(() => {
    if (rouvert) premierBouton.current?.focus();
  }, [rouvert]);

  // Une page vue à chaque navigation (la première l'est au chargement des pixels).
  useEffect(() => {
    if (premiere.current) {
      premiere.current = false;
      return;
    }
    pageVuePub();
  }, [chemin]);

  useEffect(() => {
    const ajout = (e: Event) => {
      const l = (e as CustomEvent<LigneAjoutee>).detail;
      evenementPub("AddToCart", [{ sku: l.sku, nom: l.libelle, quantite: l.quantite, prixMillimes: l.prixMillimes }]);
    };
    window.addEventListener(PANIER_LIGNE, ajout);
    return () => window.removeEventListener(PANIER_LIGNE, ajout);
  }, []);

  function choisit(c: ChoixPub) {
    const avant = choix;
    ecrisConsentement(boutique, c);
    setDePage(c);
    setRouvert(false);
    if (c === "accepte") chargePixels(pixels);
    // Retirer un accord : les scripts déjà chargés ne se déchargent pas — la page repart sans eux.
    if (c === "refuse" && avant === "accepte") {
      location.reload();
      return;
    }
    retour.current?.focus();
    retour.current = null;
  }

  const visible = rouvert || (choix === null && !chemin.startsWith("/commande"));
  if (!visible) return null;

  const plateformes = t.pixels.plateformes(Boolean(pixels.meta), Boolean(pixels.tiktok));
  return (
    <section className="pub-consentement" aria-labelledby="pub-consentement-titre" data-rouvert={rouvert ? "" : undefined}>
      <h2 id="pub-consentement-titre">{t.pixels.titre}</h2>
      <p>
        {t.pixels.texte(nom, plateformes)}{" "}
        <a href="/confidentialite#publicite">{t.pixels.enSavoirPlus}</a>
      </p>
      <div className="pub-consentement-gestes">
        <button ref={premierBouton} type="button" className="btn btn-second" onClick={() => choisit("refuse")}>{t.pixels.refuser}</button>
        <button type="button" className="btn btn-primaire" onClick={() => choisit("accepte")}>{t.pixels.accepter}</button>
      </div>
      {choix ? <p className="pub-consentement-actuel">{choix === "accepte" ? t.pixels.actuelAccepte : t.pixels.actuelRefuse}</p> : null}
    </section>
  );
}

/** Au pied de page : rouvre le bandeau pour changer d'avis. */
export function OuvrirConsentementPub({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={(e) => e.currentTarget.dispatchEvent(new CustomEvent(CONSENTEMENT_OUVRIR, { bubbles: true }))}>
      {t.pixels.lienPied}
    </button>
  );
}
