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
   · quand l'éditeur règle l'accueil ou l'en-tête et le pied de page
     (« skanecom:accueil »), chaque section de l'accueil, l'en-tête et le pied
     se signalent au survol, et un clic les désigne à l'éditeur
     (« skanecom:section ») au lieu de suivre leurs liens ; l'éditeur peut
     montrer une section (« skanecom:montrer »).

   · on écrit sur place : un texte d'une section (data-texte : surtitre,
     titre, chapô, texte, bouton) ou l'annonce de l'en-tête (data-reglage)
     se change au clic, dans la page même ; chaque frappe part à l'éditeur
     (« skanecom:texte »), qui la prend comme une frappe dans son panneau.
     Entrée ou un clic ailleurs : c'est écrit ; Échap : rien n'a changé.
     Le temps de l'écriture, la page ne se rend pas de nouveau (la frappe
     serait reprise) : le rafraîchissement attend la fin.

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
export const MESSAGE_TEXTE = "skanecom:texte";

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
html[data-ap-accueil] [data-section], html[data-ap-zones] [data-zone] { cursor: pointer; }
html[data-ap-accueil] [data-section]:hover, [data-section][data-ap-vise], html[data-ap-zones] [data-zone]:hover { outline: 2px solid #2F6FEB; outline-offset: -2px; }
html[data-ap-accueil] [data-section] :is(a, button), html[data-ap-zones] [data-zone] :is(a, button) { cursor: pointer; }
.ap-nom-section { position: absolute; z-index: 2147483000; pointer-events: none; margin: 0; padding: 5px 9px; border-radius: 0 0 6px 0;
  font: 600 12px/1.2 system-ui, sans-serif; letter-spacing: .01em; color: #FFFFFF; background: #2F6FEB; box-shadow: 0 2px 8px rgb(0 0 0 / .18); }
.ap-nom-section[hidden] { display: none; }
html[data-ap-accueil] [data-section] [data-texte], html[data-ap-zones] [data-zone] [data-reglage] { cursor: text; }
html[data-ap-accueil] [data-section] [data-texte]:hover, html[data-ap-zones] [data-zone] [data-reglage]:hover { outline: 1px dashed #2F6FEB; outline-offset: 3px; }
[data-ap-ecrit] { outline: 2px solid #2F6FEB !important; outline-offset: 3px; border-radius: 2px; caret-color: #2F6FEB; cursor: text; }
`;

/* ---- Écrire sur place ----
   L'élément écrit garde le relevé de ses nœuds d'origine (ceux que React
   connaît) : une écriture annulée, ou revenue au même texte, les lui rend. Un texte changé
   reste tel qu'on l'a tapé jusqu'au rendu suivant : l'élément porte une clé
   égale à son texte, React le remplace alors en entier. */
type Ecriture = { el: HTMLElement; releve: Releve; avant: string; lignes: boolean; insecables: boolean; section: number | null; champ: string | null; reglage: string | null };

/* Le navigateur écrit dans les nœuds mêmes (un texte allongé, une ligne
   ajoutée) : on relève chaque élément avec ses enfants, chaque texte avec
   sa valeur, pour tout rendre tel quel. */
type Releve = { elements: [Node, Node[]][]; textes: [Node, string | null][] };
function relever(el: HTMLElement): Releve {
  const r: Releve = { elements: [], textes: [] };
  const visite = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) { r.textes.push([n, n.nodeValue]); return; }
    r.elements.push([n, [...n.childNodes]]);
    n.childNodes.forEach(visite);
  };
  visite(el);
  return r;
}
function rendre(r: Releve) {
  for (const [n, enfants] of r.elements) (n as Element).replaceChildren(...enfants);
  for (const [n, valeur] of r.textes) n.nodeValue = valeur;
}

/** Le texte tel qu'écrit (pas tel qu'affiché : sans les majuscules du style),
 *  une ligne par bloc ou par saut de ligne. */
function texteDe(el: HTMLElement): string {
  let sortie = "";
  const visite = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) { sortie += n.nodeValue ?? ""; return; }
    if (!(n instanceof HTMLElement)) return;
    const style = getComputedStyle(n);
    if (n.nodeName === "BR") { if (style.display !== "none") sortie += "\n"; return; }
    const bloc = n !== el && /^(block|flex|grid|list-item)$/.test(style.display);
    if (bloc && sortie && !sortie.endsWith("\n")) sortie += "\n";
    n.childNodes.forEach(visite);
    if (bloc && !sortie.endsWith("\n")) sortie += "\n";
  };
  visite(el);
  return sortie;
}

function propre(brut: string, e: Pick<Ecriture, "lignes" | "insecables">): string {
  let v = brut.replace(/\r/g, "");
  // L'espace insécable que le navigateur pose en fin de frappe n'est pas voulue.
  if (!e.insecables) v = v.replace(/\u00a0/g, " ");
  v = e.lignes ? v.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{2,}/g, "\n") : v.replace(/\s*\n\s*/g, " ");
  return v.replace(/\n+$/, "");
}

/** Le curseur là où l'on a cliqué (ou en fin de texte). */
function curseur(el: HTMLElement, x: number, y: number) {
  const sel = getSelection();
  if (!sel) return;
  let r: Range | null = null;
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  if (typeof doc.caretPositionFromPoint === "function") {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); }
  } else if (typeof document.caretRangeFromPoint === "function") {
    r = document.caretRangeFromPoint(x, y);
  }
  if (!r || !el.contains(r.startContainer)) { r = document.createRange(); r.selectNodeContents(el); r.collapse(false); }
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

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

const NOMS_ZONES: Record<string, string> = { entete: "En-tête", pied: "Pied de page" };

function poser(section: Element | null, noms: string[]) {
  const el = etiquette();
  const zone = section?.getAttribute("data-zone");
  const n = section && !zone ? Number(section.getAttribute("data-section")) : NaN;
  const nom = zone ? NOMS_ZONES[zone] : Number.isInteger(n) ? noms[n] : undefined;
  if (!section || !nom) { el.hidden = true; return; }
  const r = section.getBoundingClientRect();
  el.textContent = nom;
  el.hidden = false;
  // Posée au-dessus de la section (sans couvrir son surtitre), ou dans son
  // coin quand la place manque (le haut de la page, l'en-tête collé).
  const entete = document.querySelector(".ed-entete, .te-entete")?.getBoundingClientRect().bottom ?? 0;
  const dessus = r.top - el.offsetHeight >= Math.max(0, entete);
  el.style.borderRadius = dessus ? "6px 6px 0 0" : "0 0 6px 0";
  el.style.insetInlineStart = `${Math.max(0, r.left + scrollX)}px`;
  el.style.insetBlockStart = `${Math.max(0, (dessus ? r.top - el.offsetHeight : r.top) + scrollY)}px`;
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
  const accueil = useRef<{ actif: boolean; zones: boolean; noms: string[]; choisie: number | null }>({ actif: false, zones: false, noms: [], choisie: null });
  const ecriture = useRef<Ecriture | null>(null);
  // Un rafraîchissement arrivé pendant l'écriture : il attend la fin.
  const differe = useRef<string | null>(null);
  const minuterieDifferee = useRef<number | null>(null);

  const rafraichirSurPlace = (apercu: string) => {
    const recherche = new URLSearchParams(location.search);
    recherche.set("apercu", apercu);
    rafraichissementAnnonce();
    document.documentElement.setAttribute("data-ap-rafraichi", "");
    routeur.replace(`${location.pathname}?${recherche.toString()}`, { scroll: false });
  };

  const dire = (e: Ecriture, etat: "debut" | "frappe" | "fin" | "annule", valeur?: string) => {
    window.parent.postMessage({ type: MESSAGE_TEXTE, etat, section: e.section, champ: e.champ, reglage: e.reglage, valeur }, "*");
  };

  /** Fin de l'écriture : `garder` (Entrée, un clic ailleurs) ou non (Échap). */
  const finir = (garder: boolean) => {
    const e = ecriture.current;
    if (!e) return;
    ecriture.current = null;
    const valeur = propre(texteDe(e.el), e).trim();
    e.el.removeAttribute("contenteditable");
    e.el.removeAttribute("data-ap-ecrit");
    e.el.closest("a")?.removeAttribute("draggable");
    if (!garder || valeur === e.avant) rendre(e.releve);
    if (garder) dire(e, "fin", valeur);
    else dire(e, "annule");
    if (document.activeElement === e.el) e.el.blur();
    if (differe.current) {
      const apercu = differe.current;
      differe.current = null;
      // Annulée : la version attendue porte encore la frappe annulée ; celle
      // que l'éditeur enregistre aussitôt la remplace. On ne la montre que si
      // rien ne vient.
      if (garder) rafraichirSurPlace(apercu);
      else minuterieDifferee.current = window.setTimeout(() => { minuterieDifferee.current = null; rafraichirSurPlace(apercu); }, 2500);
    }
  };

  const commencer = (el: HTMLElement, x: number, y: number) => {
    if (ecriture.current?.el === el) return;
    finir(true);
    const section = el.closest("[data-section]");
    const n = section ? Number(section.getAttribute("data-section")) : NaN;
    const e: Ecriture = {
      el, releve: relever(el), avant: "", lignes: el.hasAttribute("data-lignes"), insecables: false,
      section: Number.isInteger(n) ? n : null, champ: el.getAttribute("data-texte"), reglage: el.getAttribute("data-reglage"),
    };
    const brut = texteDe(el);
    e.insecables = brut.includes("\u00a0");
    e.avant = propre(brut, e).trim();
    if (!e.reglage && (e.section === null || !e.champ)) return;
    ecriture.current = e;
    try { el.contentEditable = "plaintext-only"; } catch { el.contentEditable = "true"; }
    if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
    el.setAttribute("data-ap-ecrit", "");
    el.spellcheck = true;
    // Un lien ne s'emporte pas à la souris pendant qu'on écrit dedans.
    el.closest("a")?.setAttribute("draggable", "false");
    el.focus({ preventScroll: true });
    curseur(el, x, y);
    dire(e, "debut");
  };

  const surMessage = useEffectEvent((e: MessageEvent) => {
    if (e.source !== window.parent || !deLaConsole(e.origin)) return;
    const m = e.data as { type?: unknown; contenu?: unknown; apercu?: unknown; actif?: unknown; zones?: unknown; noms?: unknown; choisie?: unknown; section?: unknown; defiler?: unknown } | null;
    if (!m || typeof m !== "object") return;

    if (m.type === MESSAGE_APPARENCE && m.contenu && typeof m.contenu === "object") {
      const contenu = m.contenu as Record<string, unknown>;
      const theme = themeDeLaBoutique({ code, couleurs: contenu.couleurs, polices: contenu.polices, style: contenu.style });
      let feuille = document.getElementById("apercu-apparence");
      if (!feuille) {
        feuille = document.createElement("style");
        feuille.id = "apercu-apparence";
      }
      feuille.textContent = feuilleDuTheme(theme, () => "");
      // Toujours la dernière feuille : rendue de nouveau, la page réinsère
      // celle du thème, qui l'emporterait sinon sur l'essai en cours.
      document.head.appendChild(feuille);
      for (const [nom, valeur] of Object.entries(attributsDuStyle(theme.style))) document.documentElement.setAttribute(nom, valeur);
      return;
    }

    // Le brouillon a changé l'accueil : la page se rend à nouveau, sur place.
    // La nouvelle page remplace l'ancienne d'un coup : ni fondu des photos
    // ni montée des sections le temps du rafraîchissement (app/vitrine-mouvement.css).
    // « fin » : la version publiée (le brouillon publié ou abandonné).
    if (m.type === MESSAGE_RECHARGER && typeof m.apercu === "string" && (JETON.test(m.apercu) || m.apercu === "fin")) {
      if (minuterieDifferee.current !== null) { window.clearTimeout(minuterieDifferee.current); minuterieDifferee.current = null; }
      if (ecriture.current) { differe.current = m.apercu; return; }
      rafraichirSurPlace(m.apercu);
      return;
    }

    if (m.type === MESSAGE_ACCUEIL) {
      const noms = Array.isArray(m.noms) ? m.noms.map((x) => (typeof x === "string" ? x.slice(0, 80) : "")) : [];
      const choisie = Number.isInteger(m.choisie) ? (m.choisie as number) : null;
      accueil.current = { actif: m.actif === true, zones: m.zones === true, noms, choisie };
      document.documentElement.toggleAttribute("data-ap-accueil", accueil.current.actif && location.pathname === "/");
      document.documentElement.toggleAttribute("data-ap-zones", accueil.current.zones);
      // Un autre panneau : l'écriture en cours est gardée, et finie.
      const e = ecriture.current;
      if (e && (e.reglage ? !accueil.current.zones : !accueil.current.actif)) finir(true);
      viser(accueil.current.actif ? choisie : null, false, noms);
      return;
    }

    if (m.type === MESSAGE_MONTRER) {
      const n = Number.isInteger(m.section) ? (m.section as number) : null;
      viser(n ?? accueil.current.choisie, m.defiler === true && n !== null, accueil.current.noms);
    }
  });

  // Les gestes de l'écriture sur place (clavier, frappe, sortie, collage).
  const surEcriture = useEffectEvent((ev: Event) => {
    const e = ecriture.current;
    if (!e || !(ev.target instanceof Node) || !e.el.contains(ev.target)) return;
    if (ev.type === "keydown") {
      const k = ev as KeyboardEvent;
      if (k.isComposing) return;
      // Entrée : c'est écrit (Maj+Entrée coupe la ligne d'un titre qui le permet).
      if (k.key === "Enter" && !(k.shiftKey && e.lignes)) { k.preventDefault(); finir(true); }
      else if (k.key === "Escape") { k.preventDefault(); finir(false); }
    } else if (ev.type === "input") {
      dire(e, "frappe", propre(texteDe(e.el), e));
    } else if (ev.type === "focusout" && ev.target === e.el) {
      finir(true);
    } else if (ev.type === "paste" && e.el.contentEditable === "true") {
      // Sans « plaintext-only » : du texte seul, jamais la mise en forme collée.
      const c = ev as ClipboardEvent;
      c.preventDefault();
      const brut = c.clipboardData?.getData("text/plain") ?? "";
      document.execCommand("insertText", false, e.lignes ? brut : brut.replace(/\s*\n\s*/g, " "));
    }
  });
  const surClicEcriture = useEffectEvent((el: HTMLElement, x: number, y: number) => commencer(el, x, y));

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
    // En cours de réglage : un clic désigne la section de l'accueil, l'en-tête
    // ou le pied de page, il ne suit pas leurs liens.
    const visee = (cible: EventTarget | null) => {
      const el = cible as Element | null;
      const racine = document.documentElement;
      const section = racine.hasAttribute("data-ap-accueil") ? el?.closest?.("[data-section]") : null;
      return section ?? (racine.hasAttribute("data-ap-zones") ? el?.closest?.("[data-zone]") ?? null : null);
    };
    // Un texte qu'on peut écrire sur place (l'accueil, ou l'annonce de l'en-tête).
    const ecrivable = (cible: EventTarget | null): HTMLElement | null => {
      const el = cible as Element | null;
      const racine = document.documentElement;
      const texte = racine.hasAttribute("data-ap-accueil") ? el?.closest?.("[data-section] [data-texte]") : null;
      const reglage = !texte && racine.hasAttribute("data-ap-zones") ? el?.closest?.("[data-zone] [data-reglage]") : null;
      return (texte ?? reglage ?? null) as HTMLElement | null;
    };
    const clic = (e: MouseEvent) => {
      const texte = ecrivable(e.target);
      if (texte) {
        // Ni son lien suivi, ni le panneau qui prend le focus : on écrit ici.
        e.preventDefault();
        e.stopPropagation();
        surClicEcriture(texte, e.clientX, e.clientY);
        return;
      }
      const cible = visee(e.target);
      if (!cible) return;
      e.preventDefault();
      e.stopPropagation();
      const zone = cible.getAttribute("data-zone");
      const n = Number(cible.getAttribute("data-section"));
      if (zone) window.parent.postMessage({ type: MESSAGE_SECTION, zone }, "*");
      else if (Number.isInteger(n)) window.parent.postMessage({ type: MESSAGE_SECTION, section: n }, "*");
    };
    const survol = (e: MouseEvent) => {
      const racine = document.documentElement;
      if (!racine.hasAttribute("data-ap-accueil") && !racine.hasAttribute("data-ap-zones")) return;
      poser(visee(e.target) ?? document.querySelector("[data-ap-vise]"), accueil.current.noms);
    };
    const geste = (e: Event) => surEcriture(e);
    const GESTES = ["keydown", "input", "focusout", "paste"] as const;
    window.addEventListener("message", ecoute);
    window.addEventListener("click", clic, true);
    document.addEventListener("mouseover", survol);
    for (const g of GESTES) document.addEventListener(g, geste, true);
    return () => {
      window.removeEventListener("message", ecoute);
      window.removeEventListener("click", clic, true);
      document.removeEventListener("mouseover", survol);
      for (const g of GESTES) document.removeEventListener(g, geste, true);
      feuille.remove();
    };
  }, []);

  // À chaque page : « prête », et où — le chemin de la page, sans le jeton
  // de l'aperçu (rien de privé ne part, même vers le cadre parent). Ailleurs
  // que sur l'accueil, les sections ne se désignent pas.
  useEffect(() => {
    if (window.self === window.top) return;
    document.documentElement.toggleAttribute("data-ap-accueil", accueil.current.actif && location.pathname === "/");
    document.documentElement.toggleAttribute("data-ap-zones", accueil.current.zones);
    const recherche = new URLSearchParams(location.search);
    recherche.delete("apercu");
    const reste = recherche.toString();
    window.parent.postMessage({ type: MESSAGE_PRET, chemin: location.pathname + (reste ? `?${reste}` : ""), gabarit: structure }, "*");
  }, [chemin, structure]);

  return null;
}
