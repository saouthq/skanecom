"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { Coche, Croix, Fleche } from "./Icones";
import { Prix } from "./Prix";
import { urlFichier } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";
import { t } from "@/lib/i18n";
import type { AjoutAnnonce } from "@/lib/panier-contrat";

/* ============================================================================
   LA CONFIRMATION D'AJOUT — ce qui suit « Ajouter au panier », une fois la
   photo arrivée dans le panier (lib/envol.ts) : l'article, son prix, et les
   deux suites possibles, « Commander » et « Voir le panier ».

   Légère, et c'est voulu : le tiroir plein écran après chaque ajout sortait
   le client de la fiche qu'il regardait (une autre taille à prendre, une
   photo à revoir). Elle se pose sous l'en-tête sur grand écran, en bas sur
   téléphone, et s'efface d'elle-même au bout de six secondes — pas tant que
   la souris ou le focus y sont.

   Au clavier, elle prend le focus (sur « Commander ») : sans cela, le client
   n'aurait aucun chemin court vers la suite. Échap la ferme et rend le focus
   au bouton qui a ajouté. À la souris, le focus ne bouge pas.
   ========================================================================== */

const DUREE_VIE = 6000;
const DUREE_SORTIE = 200;

export function ConfirmationAjout({
  ajout,
  n,
  reste,
  onFermer,
  onVoir,
}: {
  ajout: AjoutAnnonce & { id: number };
  /** Le nombre d'articles du panier, cet ajout compris. */
  n: number;
  /** Ce qui manque pour la livraison offerte (millimes), ou `null` sans seuil. */
  reste: number | null;
  onFermer: () => void;
  onVoir: () => void;
}) {
  const panneau = useRef<HTMLDivElement>(null);
  const [sortie, setSortie] = useState(false);
  const [retenue, setRetenue] = useState(false);
  /** Le focus revient au bouton qui a ajouté s'il était dans la confirmation. */
  const fermer = (rendreFocus: boolean) => {
    if (rendreFocus && panneau.current?.contains(document.activeElement)) ajout.bouton?.focus({ preventScroll: true });
    setSortie(true);
  };
  const fermerSeule = useEffectEvent(() => fermer(false));
  const fermerAuClavier = useEffectEvent(() => fermer(true));
  const partie = useEffectEvent(() => onFermer());

  // Sous l'en-tête tel qu'il est à l'écran (le bandeau d'annonce le décale
  // tant qu'on n'a pas défilé) ; sur téléphone, la feuille est en bas.
  useLayoutEffect(() => {
    const bas = document.querySelector(".ed-entete, .te-entete")?.getBoundingClientRect().bottom;
    if (bas !== undefined && bas > 0) panneau.current?.style.setProperty("--confirmation-haut", `${Math.round(bas + 10)}px`);
  }, []);

  // Elle s'efface d'elle-même, sauf tant qu'on s'en sert.
  useEffect(() => {
    if (retenue || sortie) return;
    const minuterie = window.setTimeout(() => fermerSeule(), DUREE_VIE);
    return () => window.clearTimeout(minuterie);
  }, [retenue, sortie, ajout.id]);

  useEffect(() => {
    if (!sortie) return;
    const minuterie = window.setTimeout(() => partie(), DUREE_SORTIE);
    return () => window.clearTimeout(minuterie);
  }, [sortie]);

  useEffect(() => {
    if (ajout.auClavier) panneau.current?.querySelector<HTMLElement>("[data-premier]")?.focus({ preventScroll: true });
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermerAuClavier();
    };
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [ajout.id, ajout.auClavier]);

  return createPortal(
    <div
      ref={panneau}
      className="confirmation-ajout"
      role="dialog"
      aria-modal="false"
      aria-labelledby={`confirmation-${ajout.id}`}
      data-sortie={sortie ? "" : undefined}
      onPointerEnter={() => setRetenue(true)}
      onPointerLeave={() => setRetenue(false)}
      onFocus={() => setRetenue(true)}
      onBlur={(e) => {
        if (!panneau.current?.contains(e.relatedTarget as Node | null)) setRetenue(false);
      }}
    >
      <div className="confirmation-tete">
        <p id={`confirmation-${ajout.id}`} className="confirmation-titre">
          <Coche taille={16} />
          {t.panier.ajoute}
        </p>
        <button type="button" className="confirmation-fermer" aria-label={t.panier.fermerConfirmation} onClick={() => fermer(true)}>
          <Croix taille={16} />
        </button>
      </div>

      <div className="confirmation-article">
        <span className="confirmation-vignette" aria-hidden="true">
          {ajout.image ? <Image src={urlFichier(ajout.image)} alt="" fill sizes="64px" /> : <span>{ajout.libelle.trim().charAt(0)}</span>}
        </span>
        <span className="confirmation-texte">
          <span className="confirmation-libelle">{ajout.libelle}</span>
          <span className="confirmation-prix">
            <Prix millimes={ajout.prixMillimes * ajout.quantite} />
            {ajout.quantite > 1 ? <span className="legende">{t.panier.quantiteFois(ajout.quantite)}</span> : null}
          </span>
        </span>
      </div>

      {reste !== null ? (
        <p className="confirmation-livraison legende" data-atteinte={reste === 0 ? "" : undefined}>
          {reste > 0 ? t.panier.resteAvantGratuite(formatePrix(reste)) : t.panier.gratuiteAtteinte}
        </p>
      ) : null}

      <div className="confirmation-actions">
        <Link href="/commande" className="btn btn-primaire" data-premier="" onClick={() => setSortie(true)}>
          {t.panier.commander}
          <Fleche taille={16} className="icone-fleche rtl:-scale-x-100" />
        </Link>
        <button type="button" className="btn btn-second" onClick={onVoir}>
          {t.panier.voir(n)}
        </button>
      </div>
    </div>,
    document.body,
  );
}
