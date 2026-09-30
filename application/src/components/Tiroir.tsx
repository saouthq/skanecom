"use client";

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Croix } from "./Icones";

/* ============================================================================
   LE TIROIR — panier, menu du téléphone, filtres. Un seul composant, donc un
   seul comportement de fenêtre modale, tenu partout :

   · le focus y entre à l'ouverture (sauf s'il y est déjà : une case de
     filtre reprise après navigation, lib/reprise.ts) ;
   · Tab y tourne en rond au lieu de filer vers la page grisée ;
   · Échap et le voile le ferment ;
   · la page ne défile plus dessous, sans sauter de la largeur de la barre de
     défilement ;
   · à la fermeture, le focus revient sur le bouton qui l'a ouvert.

   Il est posé dans <body> (portail) : l'en-tête collant ne doit pas devenir
   son cadre de référence. Fermé, il n'existe pas — rien ne se rend côté
   serveur, rien ne s'hydrate.

   Il repart comme il est venu : à la fermeture, il glisse hors de l'écran
   (260 ms) avant de disparaître. Pendant ce temps il n'est plus une fenêtre
   (ni rôle, ni focus, ni clic : `inert`) — la page est déjà rendue.
   ========================================================================== */

const DUREE_SORTIE = 260;

const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

export function Tiroir({
  ouvert,
  onFermer,
  titre,
  cote = "fin",
  etiquetteFermer,
  retour,
  instantane = false,
  feuille,
  className = "",
  entete,
  pied,
  children,
}: {
  ouvert: boolean;
  onFermer: () => void;
  /** Le nom de la fenêtre, lu par les lecteurs d'écran. */
  titre: string;
  /** `fin` : à droite en français (panier, filtres) ; `debut` : à gauche (menu). */
  cote?: "debut" | "fin";
  etiquetteFermer: string;
  /** Où rendre le focus à la fermeture (sinon : l'élément actif à l'ouverture). */
  retour?: RefObject<HTMLElement | null>;
  /** Rouvert après une navigation : pas d'animation d'entrée. */
  instantane?: boolean;
  /** Nom de feuille, pour que lib/reprise.ts la rouvre après une navigation. */
  feuille?: string;
  className?: string;
  /** Le titre visible ; `titre` par défaut. */
  entete?: React.ReactNode;
  pied?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panneau = useRef<HTMLDivElement>(null);
  const fermer = useEffectEvent(() => onFermer());

  // Rendu tant qu'il est ouvert, et le temps de sa sortie. Ajusté pendant le
  // rendu : le tiroir cesse d'être une fenêtre au rendu même qui le ferme.
  const [present, setPresent] = useState(ouvert);
  if (ouvert && !present) setPresent(true);
  const sortie = present && !ouvert;
  useEffect(() => {
    if (!sortie) return;
    const t = window.setTimeout(() => setPresent(false), DUREE_SORTIE);
    return () => window.clearTimeout(t);
  }, [sortie]);

  useEffect(() => {
    if (!ouvert) return;
    const precedent = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const cible = retour?.current ?? null;

    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fermer();
        return;
      }
      if (e.key !== "Tab" || !panneau.current) return;
      const cibles = [...panneau.current.querySelectorAll<HTMLElement>(FOCUSABLES)].filter((el) => el.offsetParent !== null);
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

    if (!panneau.current?.contains(document.activeElement)) {
      panneau.current?.querySelector<HTMLElement>("[data-fermer]")?.focus({ preventScroll: true });
    }

    const racine = document.documentElement;
    const largeurBarre = window.innerWidth - racine.clientWidth;
    const avant = { overflow: racine.style.overflow, marge: racine.style.paddingInlineEnd };
    racine.style.overflow = "hidden";
    if (largeurBarre > 0) racine.style.paddingInlineEnd = `${largeurBarre}px`;

    return () => {
      document.removeEventListener("keydown", auClavier);
      racine.style.overflow = avant.overflow;
      racine.style.paddingInlineEnd = avant.marge;
      const retourFocus = cible?.isConnected ? cible : precedent?.isConnected ? precedent : null;
      retourFocus?.focus({ preventScroll: true });
    };
  }, [ouvert, retour]);

  if (!present || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`tiroir ${className}`}
      data-cote={cote}
      data-instantane={instantane && !sortie ? "" : undefined}
      data-sortie={sortie ? "" : undefined}
      data-feuille={sortie ? undefined : feuille}
      role={sortie ? undefined : "dialog"}
      aria-modal={sortie ? undefined : "true"}
      aria-label={sortie ? undefined : titre}
      aria-hidden={sortie ? "true" : undefined}
      inert={sortie}
    >
      <button type="button" className="tiroir-voile" aria-hidden="true" tabIndex={-1} onClick={onFermer} />
      <div ref={panneau} className="tiroir-panneau">
        <div className="tiroir-tete">
          {entete ?? <h2 className="tiroir-titre">{titre}</h2>}
          <button type="button" className="icone-btn" data-fermer aria-label={etiquetteFermer} onClick={onFermer}>
            <Croix taille={18} />
          </button>
        </div>
        <div className="tiroir-corps">{children}</div>
        {pied ? <div className="tiroir-pied">{pied}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
