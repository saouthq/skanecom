"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { attributsDuStyle, feuilleDuTheme, themeDeLaBoutique, type CodeTheme, type Structure } from "@/lib/theme";
import { rafraichiALInstant, rafraichissementAnnonce } from "@/lib/apercu-cadre";

/* ============================================================================
   L'APERÇU EN DIRECT — dans le cadre de l'éditeur de la vitrine (backoffice),
   la vitrine prend à chaque geste ce qu'on essaie. Rien n'est enregistré
   ici ; hors d'un cadre, ce composant ne fait rien.

   Le dialogue :
   · la vitrine dit au cadre parent qu'elle est prête, et sur quelle page
     (« skanecom:apercu-pret ») — à chaque page, pour que l'éditeur sache où
     l'on est et renvoie l'apparence ;
   · l'éditeur envoie l'apparence (« skanecom:apparence ») : couleurs,
     polices et style, appliqués sans recharger. Chaque valeur repasse par
     themeDeLaBoutique : couleurs #RRGGBB, polices et style des listes
     fermées — la feuille produite ne contient rien de libre ;
   · l'accueil, lui, se rend au serveur : une fois le brouillon enregistré,
     l'éditeur donne le jeton de sa nouvelle version (« skanecom:recharger »)
     et la page se rafraîchit sur place, sans clignement ni perte du
     défilement ;
   · sur l'accueil, quand l'éditeur règle les sections (« skanecom:accueil »),
     chaque section se signale au survol, et un clic la désigne à l'éditeur
     (« skanecom:section ») au lieu de suivre ses liens ; l'éditeur peut en
     montrer une (« skanecom:montrer »).

   Seule la console peut parler (l'origine est vérifiée) ; les noms des
   sections ne s'écrivent qu'en texte. La structure change les composants :
   elle ne s'essaie pas ici, l'éditeur recharge le cadre sur l'aperçu du
   brouillon (src/proxy.ts).
   ========================================================================== */

export const MESSAGE_PRET = "skanecom:apercu-pret";
export const MESSAGE_APPARENCE = "skanecom:apparence";
export const MESSAGE_RECHARGER = "skanecom:recharger";
export const MESSAGE_ACCUEIL = "skanecom:accueil";
export const MESSAGE_MONTRER = "skanecom:montrer";
export const MESSAGE_SECTION = "skanecom:section";

const HOTE_CONSOLE = (process.env.NEXT_PUBLIC_CONSOLE_HOTE ?? "").toLowerCase();
const JETON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9]{1,9}$/;

function deLaConsole(origine: string): boolean {
  try {
    return HOTE_CONSOLE !== "" && new URL(origine).hostname === HOTE_CONSOLE.replace(/:\d+$/, "");
  } catch {
    return false;
  }
}

/* La marque des sections : un contour, et le nom posé en haut. */
const FEUILLE_SECTIONS = `
html[data-ap-accueil] [data-section] { cursor: pointer; }
html[data-ap-accueil] [data-section]:hover, [data-section][data-ap-vise] { outline: 2px solid #2F6FEB; outline-offset: -2px; }
html[data-ap-accueil] [data-section] a, html[data-ap-accueil] [data-section] button { cursor: pointer; }
.ap-nom-section { position: absolute; z-index: 2147483000; pointer-events: none; margin: 0; padding: 5px 9px; border-radius: 0 0 6px 0;
  font: 600 12px/1.2 system-ui, sans-serif; letter-spacing: .01em; color: #FFFFFF; background: #2F6FEB; box-shadow: 0 2px 8px rgb(0 0 0 / .18); }
.ap-nom-section[hidden] { display: none; }
`;

/* L'étiquette du nom de la section : posée sur son coin. */
function etiquette(): HTMLElement {
  let el = document.getElementById("ap-nom-section");
  if (!el) {
    el = document.createElement("p");
    el.id = "ap-nom-section";
    el.className = "ap-nom-section";
    el.setAttribute("aria-hidden", "true");
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

function poser(section: Element | null, noms: string[]) {
  const el = etiquette();
  const n = section ? Number(section.getAttribute("data-section")) : NaN;
  const nom = Number.isInteger(n) ? noms[n] : undefined;
  if (!section || !nom) { el.hidden = true; return; }
  const r = section.getBoundingClientRect();
  el.textContent = nom;
  el.style.insetInlineStart = `${Math.max(0, r.left + scrollX)}px`;
  el.style.insetBlockStart = `${Math.max(0, r.top + scrollY)}px`;
  el.hidden = false;
}

/** Marquer une section (par son rang), la faire venir sous les yeux. */
function viser(n: number | null, defiler: boolean, noms: string[]) {
  for (const el of document.querySelectorAll("[data-ap-vise]")) el.removeAttribute("data-ap-vise");
  const section = n === null ? null : document.querySelector(`[data-section="${n}"]`);
  if (section) {
    section.setAttribute("data-ap-vise", "");
    // Seulement si elle n'est pas déjà sous les yeux ; le cadre défile seul
    // (scrollIntoView ferait aussi défiler la page de l'éditeur).
    const r = section.getBoundingClientRect();
    const entete = document.querySelector(".ed-entete, .te-entete")?.getBoundingClientRect().height ?? 0;
    if (defiler && (r.bottom < entete + 60 || r.top > innerHeight - 80)) {
      scrollTo({ top: r.top + scrollY - entete - 16, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }
  poser(section, noms);
}

export function ApercuApparence({ code, structure }: { code: CodeTheme; structure: Structure }) {
  const chemin = usePathname();
  const routeur = useRouter();
  const accueil = useRef<{ actif: boolean; noms: string[]; choisie: number | null }>({ actif: false, noms: [], choisie: null });

  const surMessage = useEffectEvent((e: MessageEvent) => {
    if (e.source !== window.parent || !deLaConsole(e.origin)) return;
    const m = e.data as { type?: unknown; contenu?: unknown; apercu?: unknown; actif?: unknown; noms?: unknown; choisie?: unknown; section?: unknown; defiler?: unknown } | null;
    if (!m || typeof m !== "object") return;

    if (m.type === MESSAGE_APPARENCE && m.contenu && typeof m.contenu === "object") {
      const contenu = m.contenu as Record<string, unknown>;
      const theme = themeDeLaBoutique({ code, couleurs: contenu.couleurs, polices: contenu.polices, style: contenu.style });
      let feuille = document.getElementById("apercu-apparence");
      if (!feuille) {
        feuille = document.createElement("style");
        feuille.id = "apercu-apparence";
        document.head.appendChild(feuille);
      }
      feuille.textContent = feuilleDuTheme(theme, () => "");
      for (const [nom, valeur] of Object.entries(attributsDuStyle(theme.style))) document.documentElement.setAttribute(nom, valeur);
      return;
    }

    // Le brouillon a changé l'accueil : la page se rend à nouveau, sur place.
    // La nouvelle page remplace l'ancienne d'un coup : ni fondu des photos
    // ni montée des sections le temps du rafraîchissement (app/vitrine-mouvement.css).
    if (m.type === MESSAGE_RECHARGER && typeof m.apercu === "string" && JETON.test(m.apercu)) {
      const recherche = new URLSearchParams(location.search);
      recherche.set("apercu", m.apercu);
      rafraichissementAnnonce();
      document.documentElement.setAttribute("data-ap-rafraichi", "");
      routeur.replace(`${location.pathname}?${recherche.toString()}`, { scroll: false });
      return;
    }

    if (m.type === MESSAGE_ACCUEIL) {
      const noms = Array.isArray(m.noms) ? m.noms.map((x) => (typeof x === "string" ? x.slice(0, 80) : "")) : [];
      const choisie = Number.isInteger(m.choisie) ? (m.choisie as number) : null;
      accueil.current = { actif: m.actif === true, noms, choisie };
      document.documentElement.toggleAttribute("data-ap-accueil", accueil.current.actif && location.pathname === "/");
      viser(accueil.current.actif ? choisie : null, false, noms);
      return;
    }

    if (m.type === MESSAGE_MONTRER) {
      const n = Number.isInteger(m.section) ? (m.section as number) : null;
      viser(n ?? accueil.current.choisie, m.defiler === true && n !== null, accueil.current.noms);
    }
  });

  // Rendue de nouveau après un rafraîchissement : avant de peindre, plus de
  // mouvement le temps que ses photos se posent, puis les mouvements reprennent.
  useLayoutEffect(() => {
    if (window.self === window.top || !rafraichiALInstant()) return;
    document.documentElement.setAttribute("data-ap-rafraichi", "");
    const minuterie = window.setTimeout(() => {
      document.documentElement.removeAttribute("data-ap-rafraichi");
      // Ce qui démarre à l'instant (une apparition, un titre qui monte) est
      // déjà en place : on le termine d'un coup (sauf ce qui tourne sans fin).
      for (const a of document.getAnimations()) {
        if (a.effect?.getTiming().iterations === Infinity) continue;
        try { a.finish(); } catch { /* une animation sans fin */ }
      }
    }, 1500);
    return () => window.clearTimeout(minuterie);
  }, []);

  useEffect(() => {
    if (window.self === window.top) return;
    document.documentElement.setAttribute("data-dans-cadre", "");
    const feuille = document.createElement("style");
    feuille.id = "apercu-sections";
    feuille.textContent = FEUILLE_SECTIONS;
    document.head.appendChild(feuille);

    const ecoute = (e: MessageEvent) => surMessage(e);
    // Sur l'accueil en cours de réglage : un clic désigne la section, il ne suit pas ses liens.
    const clic = (e: MouseEvent) => {
      if (!document.documentElement.hasAttribute("data-ap-accueil")) return;
      const section = (e.target as Element | null)?.closest?.("[data-section]");
      if (!section) return;
      e.preventDefault();
      e.stopPropagation();
      const n = Number(section.getAttribute("data-section"));
      if (Number.isInteger(n)) window.parent.postMessage({ type: MESSAGE_SECTION, section: n }, "*");
    };
    const survol = (e: MouseEvent) => {
      if (!document.documentElement.hasAttribute("data-ap-accueil")) return;
      const section = (e.target as Element | null)?.closest?.("[data-section]") ?? document.querySelector("[data-ap-vise]");
      poser(section, accueil.current.noms);
    };
    window.addEventListener("message", ecoute);
    window.addEventListener("click", clic, true);
    document.addEventListener("mouseover", survol);
    return () => {
      window.removeEventListener("message", ecoute);
      window.removeEventListener("click", clic, true);
      document.removeEventListener("mouseover", survol);
      feuille.remove();
    };
  }, []);

  // À chaque page : « prête », et où — le chemin de la page, sans le jeton
  // de l'aperçu (rien de privé ne part, même vers le cadre parent). Ailleurs
  // que sur l'accueil, les sections ne se désignent pas.
  useEffect(() => {
    if (window.self === window.top) return;
    document.documentElement.toggleAttribute("data-ap-accueil", accueil.current.actif && location.pathname === "/");
    const recherche = new URLSearchParams(location.search);
    recherche.delete("apercu");
    const reste = recherche.toString();
    window.parent.postMessage({ type: MESSAGE_PRET, chemin: location.pathname + (reste ? `?${reste}` : ""), gabarit: structure }, "*");
  }, [chemin, structure]);

  return null;
}
