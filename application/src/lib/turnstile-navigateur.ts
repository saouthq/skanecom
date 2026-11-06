"use client";

import { useCallback, useEffect, useRef } from "react";

/* ============================================================================
   TURNSTILE (dans le navigateur) — le widget de Cloudflare, chargé une fois,
   seulement si la page porte sa clé (<meta name="skanecom-turnstile">, posée
   par le layout de la boutique quand la vérification est active). Il reste
   invisible pour un visiteur ordinaire (« interaction-only ») ; s'il doute,
   il montre sa case dans la zone prévue. Chaque jeton ne sert qu'une fois :
   le formulaire le demande au moment d'envoyer, puis le widget repart.
   ========================================================================== */

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: Turnstile }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let chargement: Promise<Turnstile> | null = null;

function charger(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  chargement ??= new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? ok(window.turnstile) : ko(new Error("Turnstile absent")));
    s.onerror = () => { chargement = null; ko(new Error("Turnstile injoignable")); };
    document.head.appendChild(s);
  });
  return chargement;
}

/** La clé publique de la page, ou null : pas de vérification. */
export function cleSiteDeLaPage(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLMetaElement>('meta[name="skanecom-turnstile"]')?.content || null;
}

/** Le contrôle anti-robots d'un formulaire : sa zone (là où paraît la case
 *  s'il faut en montrer une) et `jeton()`, à appeler au moment d'envoyer.
 *  `actif` : faux quand la zone n'est pas à l'écran (le formulaire remplacé
 *  par son remerciement) ; une autre valeur (l'étape d'un formulaire en deux
 *  temps, dont la zone change de place) : le widget est reposé. */
export function useControleRobot(actif: boolean | string = true) {
  const zone = useRef<HTMLDivElement>(null);
  const etat = useRef<{ id: string | null; jeton: string | null; attentes: ((j: string | null) => void)[]; api: Turnstile | null }>({ id: null, jeton: null, attentes: [], api: null });

  useEffect(() => {
    const cle = cleSiteDeLaPage();
    const el = zone.current;
    if (!actif || !cle || !el) return;
    let fini = false;
    const e = etat.current;
    const livrer = (j: string | null) => { e.jeton = j; const a = e.attentes.splice(0); a.forEach((f) => f(j)); };
    charger().then((api) => {
      if (fini) return;
      e.api = api;
      e.id = api.render(el, {
        sitekey: cle, appearance: "interaction-only", language: "fr", theme: "light",
        callback: (j: string) => livrer(j),
        "expired-callback": () => { e.jeton = null; },
        "error-callback": () => { livrer(null); return true; },
      });
    }).catch(() => livrer(null));
    return () => {
      fini = true;
      if (e.api && e.id) e.api.remove(e.id);
      e.id = null; e.jeton = null;
    };
  }, [actif]);

  /** Le jeton du visiteur (attendu au plus huit secondes) ; null sans vérification ou en échec. */
  const jeton = useCallback(async (): Promise<string | null> => {
    if (!cleSiteDeLaPage()) return null;
    const e = etat.current;
    const pret = e.jeton ?? await new Promise<string | null>((ok) => {
      e.attentes.push(ok);
      window.setTimeout(() => ok(e.jeton), 8000);
    });
    // Servi une fois : le widget en prépare un autre pour l'envoi suivant.
    e.jeton = null;
    if (e.api && e.id) e.api.reset(e.id);
    return pret;
  }, []);

  return { zone, jeton };
}
