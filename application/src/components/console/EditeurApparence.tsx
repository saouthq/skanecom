"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icone } from "./Icone";
import { BoutonCopier } from "./BoutonCopier";
import { PanneauAccueil, type InfosAccueil } from "./PanneauAccueil";
import { PanneauCadre } from "./PanneauCadre";
import { PanneauPages, type ContenuPage, type ModelePage, type PageEditeur, type PageOffice, type Refus } from "./PanneauPages";
import {
  MESSAGE_ACCUEIL, MESSAGE_APPARENCE, MESSAGE_MONTRER, MESSAGE_PRET, MESSAGE_RECHARGER, MESSAGE_SECTION, MESSAGE_TEXTE,
} from "@/components/ApercuApparence";
import {
  ACCENTS, AMBIANCES, FONDS, avecAccent, encrePour, memeContenu, paletteDerivee, photosDe, problemesReglages, rapportLisible, sectionsDeStructure, verdicts, versBase,
  type Ambiance, type CleReglageEditeur, type ContenuApparence, type Mode, type ReglagesVitrine,
} from "@/lib/apparence";
import { MAX_SECTIONS, entreeDe, nouvelleSection, type SectionBrute } from "@/lib/gestion/accueil";
import { estHex } from "@/lib/couleur";
import {
  JETONS_COULEUR, POLICES_INFO, pilePolice, REGLAGES_STYLE, STRUCTURES, styleConseille,
  type CleStyle, type JetonCouleur, type Police, type Structure, type Style,
} from "@/lib/theme";

/* ============================================================================
   L'ÉDITEUR DE LA VITRINE — à gauche les réglages, en deux panneaux (le
   style, l'accueil), à droite la VRAIE vitrine (dans un cadre), qui change à
   chaque geste :

   · couleurs, polices et style partent au cadre par message (la vitrine les
     applique sans recharger : components/ApercuApparence.tsx) ;
   · chaque geste s'enregistre, une seconde plus tard, dans le BROUILLON (que
     les visiteurs ne voient pas) ; changer de structure recharge le cadre sur
     l'aperçu du brouillon (la façade le rend : src/proxy.ts), changer
     l'accueil le rafraîchit sur place ;
   · sur l'accueil, cliquer une section de l'aperçu ouvre ses réglages ;
   · « Publier » met le tout en ligne ; « Revenir à la version publiée »
     abandonne le brouillon ; ⌘Z / ⇧⌘Z défont et refont.

   Les réglages sont de vrais boutons radio (flèches du clavier dans chaque
   groupe, lecteurs d'écran) ; sans script, le formulaire s'envoie tel quel
   (un champ par réglage) et la route enregistre ou publie.
   ========================================================================== */

type Brouillon = { version: number; jeton: string };
type Message = { ok: boolean; texte: string };

const NOMS_STRUCTURES: Record<Structure, { nom: string; aide: string }> = {
  editorial: { nom: "Éditoriale", aide: "Grandes photos, peu de mots, typographie de magazine. Mode, beauté, maison." },
  bento: { nom: "Bento", aide: "Une mosaïque de tuiles, coins ronds, en-tête flottant. Maison, beauté, marques jeunes." },
  immersif: { nom: "Immersif", aide: "La photo plein écran, l'en-tête posé dessus, les pièces qui glissent, le lookbook. Mode, luxe, maison haut de gamme." },
  technique: { nom: "Technique", aide: "Grille dense, fiches techniques, recherche par référence. Outillage, matériel pro." },
  commerce: { nom: "Commerce", aide: "La recherche d'abord, le grand menu des rayons, la comparaison, une barre d'onglets au téléphone. High-tech, électroménager, outillage." },
  monoproduit: { nom: "Monoproduit", aide: "Une page de vente pour un produit : ses photos, ses offres par quantité, la commande sur la page. Les boutiques qui vendent par la publicité." },
};

const LIBELLES: { [K in CleStyle]: { titre: string; choix: Record<Style[K], string> } } = {
  coins: { titre: "Coins", choix: { droits: "Droits", doux: "Adoucis", arrondis: "Arrondis", ronds: "Ronds" } },
  boutons: { titre: "Forme des boutons", choix: { pleins: "Pleins", contour: "Contour", pilule: "Pilule" } },
  teinte: { titre: "Couleur des boutons", choix: { encre: "Celle du texte", accent: "L'accent" } },
  cartes: { titre: "Cartes des produits", choix: { nues: "Sans cadre", cadre: "Cadre fin", ombre: "Ombre portée" } },
  photos: { titre: "Photos des produits", choix: { "4-5": "Portrait 4:5", "1-1": "Carré 1:1", "3-4": "Allongé 3:4" } },
  titres: { titre: "Taille des titres", choix: { sobre: "Sobres", ample: "Amples", immense: "Immenses" } },
  casse: { titre: "Écriture des titres", choix: { normale: "Bas de casse", majuscules: "Capitales" } },
  densite: { titre: "Espace entre les sections", choix: { serree: "Serré", normale: "Normal", aeree: "Aéré" } },
  mode: { titre: "Mode", choix: { clair: "Clair", sombre: "Sombre" } },
  animations: { titre: "Animations", choix: { oui: "Au défilement", non: "Aucune" } },
  allure: { titre: "Allure de l'interface", choix: { classique: "Classique", contemporaine: "Contemporaine" } },
};

const PAGES_FIXES: { chemin: string; nom: string }[] = [
  { chemin: "/", nom: "Accueil" },
  { chemin: "/catalogue", nom: "Catalogue" },
  { chemin: "/commande", nom: "Commande" },
];

const NOMS_JETONS: Record<JetonCouleur, string> = {
  fond: "Fond de page", surface: "Cartes et champs", surface_2: "Fond secondaire", filet: "Filets", filet_fort: "Filets marqués",
  contour_champ: "Contour des champs", encre: "Texte", encre_doux: "Texte secondaire", accent: "Accent", accent_clair: "Accent sur fond foncé",
  succes: "En stock", erreur: "Erreur", alerte: "Stock faible",
};

const LARGEUR_ORDINATEUR = 1280;
const TELEPHONE = { l: 390, h: 844 };

function abonneEcran(signal: () => void) {
  const m = matchMedia("(max-width: 959px)");
  m.addEventListener("change", signal);
  return () => m.removeEventListener("change", signal);
}

/** Amène un réglage sous les yeux, sous la barre des panneaux (collée en
 *  haut) : dans la colonne des réglages quand c'est elle qui défile (grand
 *  écran), sinon dans la page (téléphone) — jamais la page autour de la
 *  colonne, qui sortirait les onglets de l'écran. */
function amener(el: Element | null, colonne: HTMLElement | null) {
  if (!el) return;
  const doux = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  const onglets = colonne?.querySelector<HTMLElement>(".ap-panneaux")?.offsetHeight ?? 0;
  if (colonne && colonne.scrollHeight > colonne.clientHeight && getComputedStyle(colonne).overflowY !== "visible") {
    const haut = el.getBoundingClientRect().top - colonne.getBoundingClientRect().top + colonne.scrollTop - onglets - 12;
    colonne.scrollTo({ top: Math.max(0, haut), behavior: doux });
    return;
  }
  const barre = document.querySelector<HTMLElement>(".ap-barre")?.offsetHeight ?? 0;
  window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - barre - onglets - 12), behavior: doux });
}

type Panneau = "style" | "accueil" | "cadre" | "pages";
const PANNEAUX: { id: Panneau; nom: string; icone: "marque" | "boutique" | "menu" | "note" }[] = [
  { id: "style", nom: "Style", icone: "marque" },
  { id: "accueil", nom: "Accueil", icone: "boutique" },
  { id: "cadre", nom: "En-tête et pied", icone: "menu" },
  { id: "pages", nom: "Pages", icone: "note" },
];

/** Ce que rend un geste sur une page (route apparence/action, migration 68). */
type RepPage =
  | { ok: true; id?: string; slug?: string; version?: number; jeton?: string | null; brouillon_version?: number | null; brouillon?: Brouillon | null; message?: string }
  | { ok: false; message: string; champ?: "titre" | "slug" | "corps" | null };

const heureTunis = () => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" }).format(new Date());

/** Ce qui ne se voit qu'une fois la page rendue de nouveau : l'accueil, les
 *  réglages de l'en-tête et du pied (dans la forme envoyée à la base). */
const empreinteRendu = (b: { sections?: unknown; reglages?: unknown }) => JSON.stringify({ sections: b.sections ?? null, reglages: b.reglages ?? null });

export function EditeurApparence({
  action, photoAction, retour: lienRetour, vitrine, ecrit, nom, fiche, panneau: panneauInitial, infos, reglages: reglagesInitiaux, whatsapp,
  pages: pagesInitiales, pageOuverte, modeles, office, affichee,
  version: versionInitiale, publie: publieInitial, brouillon: brouillonInitial, message,
}: {
  action: string;
  /** Où téléverser une photo de l'accueil. */
  photoAction: string;
  /** Le backoffice, d'où l'on vient (l'éditeur prend tout l'écran). */
  retour: string;
  vitrine: string | null;
  ecrit: boolean;
  nom: string;
  /** Une fiche produit de la boutique, à regarder dans l'aperçu. */
  fiche: { chemin: string; nom: string } | null;
  /** Le panneau ouvert d'abord (l'ancienne adresse « Page d'accueil » ouvre l'accueil). */
  panneau: Panneau;
  /** Ce que l'accueil peut montrer : rayons, pages, avis, marques, produits. */
  infos: InfosAccueil;
  /** Les réglages de l'en-tête et du pied de page en vigueur. */
  reglages: ReglagesVitrine;
  /** La boutique a un numéro WhatsApp (le bouton flottant peut s'allumer). */
  whatsapp: boolean;
  /** Les pages de la boutique : ce qui est en ligne, et leur brouillon. */
  pages: PageEditeur[];
  /** La page ouverte d'abord dans le panneau Pages (son id, « nouvelle »). */
  pageOuverte: string | null;
  /** Les modèles de pages, composés des réglages de la boutique. */
  modeles: ModelePage[];
  /** Les pages que la boutique a d'office (conditions, contact…). */
  office: PageOffice[];
  /** Le domaine de la boutique, devant l'adresse d'une page (« dar-alia.tn »). */
  affichee: string | null;
  version: number | null;
  publie: ContenuApparence;
  brouillon: { contenu: ContenuApparence; version: number; jeton: string; auteur: string | null; quand: string } | null;
  message: Message | null;
}) {
  const depart = brouillonInitial?.contenu ?? publieInitial;
  const [publie, setPublie] = useState(publieInitial);
  const [version, setVersion] = useState(versionInitiale);
  const [contenu, setContenu] = useState<ContenuApparence>(depart);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(brouillonInitial ? { version: brouillonInitial.version, jeton: brouillonInitial.jeton } : null);
  // Le contenu tel que la base l'a (brouillon ou publié) : l'écran sait s'il reste à enregistrer.
  const [envoye, setEnvoye] = useState(() => JSON.stringify(versBase(depart)));
  const [etat, setEtat] = useState<{ genre: "repos" | "envoi" | "erreur"; texte?: string }>({ genre: "repos" });
  const [relance, setRelance] = useState(0);
  const [retour, setRetour] = useState<Message | null>(message);
  const [annonce, setAnnonce] = useState("");
  const [sauveA, setSauveA] = useState<string | null>(brouillonInitial ? `${brouillonInitial.auteur ? `par ${brouillonInitial.auteur}, ` : ""}${brouillonInitial.quand}` : null);
  const petitEcran = useSyncExternalStore(abonneEcran, () => matchMedia("(max-width: 959px)").matches, () => false);
  const [choixAppareil, setChoixAppareil] = useState<"ordinateur" | "telephone" | null>(null);
  const appareil = choixAppareil ?? (petitEcran ? "telephone" : "ordinateur");
  const [onglet, setOnglet] = useState<"reglages" | "apercu">("reglages");
  const [historique, setHistorique] = useState<{ passe: ContenuApparence[]; futur: ContenuApparence[] }>({ passe: [], futur: [] });
  const dernierGeste = useRef<string | null>(null);
  const enVol = useRef(false);
  const [panneau, setPanneau] = useState<Panneau>(panneauInitial);
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Les pages de la boutique : ce qui est en ligne, et leur brouillon.
  const [pagesEtat, setPagesEtat] = useState<PageEditeur[]>(pagesInitiales);
  const [pageCourante, setPageCourante] = useState<string | null>(pageOuverte);
  const pagesEnBrouillon = pagesEtat.some((p) => p.brouillon !== null);
  const videurPages = useRef<(() => Promise<void>) | null>(null);
  const [generationPages, setGenerationPages] = useState(0);
  // Les réglages de l'en-tête et du pied : ceux en vigueur, sous ce que le brouillon change.
  const [reglagesPublies, setReglagesPublies] = useState<ReglagesVitrine>(reglagesInitiaux);
  const reglages: ReglagesVitrine = { ...reglagesPublies, ...contenu.reglages };
  const problemesCadre = problemesReglages(reglages);
  const cadreARevoir = Object.keys(problemesCadre).length > 0;
  const PAGES_APERCU = fiche ? [PAGES_FIXES[0], PAGES_FIXES[1], { chemin: fiche.chemin, nom: `Fiche : ${fiche.nom}` }, PAGES_FIXES[2]] : PAGES_FIXES;

  /* --- L'accueil : celui du brouillon, ou celui de la structure. */
  const parStructure = contenu.sections == null;
  const sections = useMemo(() => contenu.sections ?? sectionsDeStructure(contenu.code), [contenu.sections, contenu.code]);
  const nomsSections = useMemo(() => sections.map((s) => entreeDe(s.type, contenu.code).nom), [sections, contenu.code]);
  const indexDe = (cle: string | null) => (cle === null ? null : sections.findIndex((s) => s.cle === cle));

  /* --- Le cadre d'aperçu. */
  const origine = useMemo(() => (vitrine ? new URL(vitrine).origin : null), [vitrine]);
  // Une page ouverte d'emblée (l'ancienne adresse de l'écran « Pages ») : l'aperçu y va.
  const pageDepart = pagesInitiales.find((p) => p.id === pageOuverte) ?? null;
  const [src, setSrc] = useState<string | null>(() =>
    vitrine ? `${vitrine}/${pageDepart?.slug ?? ""}?apercu=${brouillonInitial ? `${brouillonInitial.jeton}.${brouillonInitial.version}` : "fin"}` : null);
  const [recharge, setRecharge] = useState(0);
  const [chemin, setChemin] = useState("/");
  const [gabaritCadre, setGabaritCadre] = useState<Structure | null>(null);
  const cadre = useRef<HTMLIFrameElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const colonne = useRef<HTMLDivElement>(null);

  // Ouvert depuis une page du backoffice défilée (le menu du téléphone) :
  // l'éditeur commence en haut.
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const [taille, setTaille] = useState({ l: 900, h: 640 });

  useEffect(() => {
    const el = scene.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setTaille({ l: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const envoieAuCadre = useEffectEvent((c: ContenuApparence) => {
    if (!origine) return;
    cadre.current?.contentWindow?.postMessage({ type: MESSAGE_APPARENCE, contenu: versBase(c) }, origine);
  });

  // « Avant / après » : le cadre montre un instant la version publiée — sur
  // place quand seul le style diffère, en rechargeant la version publiée
  // quand la structure ou l'accueil ont changé.
  const [comparer, setComparer] = useState(false);
  const comparable = !memeContenu(publie, contenu) || pagesEnBrouillon;
  const parRechargement = pagesEnBrouillon || publie.code !== contenu.code || empreinteRendu(versBase(publie)) !== empreinteRendu(versBase(contenu));
  const montre = comparer && comparable ? publie : contenu;

  // L'accueil en cours de réglage : la vitrine du cadre signale ses sections.
  const envoieAccueil = useEffectEvent(() => {
    if (!origine) return;
    const i = indexDe(ouverte);
    const reglage = !(comparer && comparable);
    cadre.current?.contentWindow?.postMessage({
      type: MESSAGE_ACCUEIL, actif: panneau === "accueil" && reglage, zones: (panneau === "accueil" || panneau === "cadre") && reglage,
      noms: nomsSections, choisie: i !== null && i >= 0 ? i : null,
    }, origine);
  });
  useEffect(() => { envoieAccueil(); }, [panneau, nomsSections, ouverte, comparer]);

  // Montrer une section dans l'aperçu (survolée, ouverte, déplacée).
  const montrer = (cle: string | null, defiler = false) => {
    if (!origine) return;
    const i = indexDe(cle);
    cadre.current?.contentWindow?.postMessage({ type: MESSAGE_MONTRER, section: i !== null && i >= 0 ? i : null, defiler }, origine);
  };


  // Chaque geste : la vitrine du cadre le prend aussitôt.
  useEffect(() => { envoieAuCadre(montre); }, [montre]);

  // La vitrine du cadre dit qu'elle est prête (à chaque page) : on lui renvoie l'apparence.
  const surMessage = useEffectEvent((e: MessageEvent) => {
    if (!origine || e.origin !== origine || e.source !== cadre.current?.contentWindow) return;
    const m = e.data as { type?: string; chemin?: string; gabarit?: Structure } | null;
    if (m?.type !== MESSAGE_PRET) return;
    if (typeof m.chemin === "string") {
      const ch = m.chemin.replace(/[?&]apercu=[^&]*/, "").replace(/\?$/, "") || "/";
      setChemin(ch);
      // Le panneau Pages ouvert, une page de la vitrine du cadre (un lien du
      // pied de page cliqué) : son écriture s'ouvre.
      const p = panneau === "pages" ? pagesEtat.find((x) => `/${x.slug}` === ch.replace(/[?#].*$/, "")) : undefined;
      if (p && pageCourante !== p.id && !/^(nouvelle|modele:)/.test(pageCourante ?? "")) setPageCourante(p.id);
    }
    if (m.gabarit && (STRUCTURES as string[]).includes(m.gabarit)) setGabaritCadre(m.gabarit);
    envoieAuCadre(montre);
    envoieAccueil();
    // Rendue de nouveau (une section ajoutée, déplacée) : la section ouverte vient sous les yeux.
    if (panneau === "accueil" && ouverte) montrer(ouverte, true);
  });
  // Une section cliquée sur l'aperçu : ses réglages s'ouvrent.
  const surSection = useEffectEvent((e: MessageEvent) => {
    if (!origine || e.origin !== origine || e.source !== cadre.current?.contentWindow) return;
    const m = e.data as { type?: string; section?: unknown; zone?: unknown } | null;
    if (m?.type !== MESSAGE_SECTION) return;
    // L'en-tête ou le pied de page cliqué : leur panneau.
    if (m.zone === "entete" || m.zone === "pied") {
      setPanneau("cadre");
      setOnglet("reglages");
      setAnnonce(m.zone === "entete" ? "En-tête ouvert pour le régler" : "Pied de page ouvert pour le régler");
      window.setTimeout(() => {
        const bloc = document.querySelector<HTMLElement>(`[data-zone-editeur="${m.zone}"]`);
        amener(bloc, colonne.current);
        bloc?.querySelector<HTMLElement>("input:not(:disabled)")?.focus({ preventScroll: true });
      }, 60);
      return;
    }
    if (!Number.isInteger(m.section)) return;
    const s = sections[m.section as number];
    if (!s?.cle) return;
    setPanneau("accueil");
    setOnglet("reglages");
    setOuverte(s.cle);
    setAnnonce(`« ${entreeDe(s.type, contenu.code).nom} » ouverte pour la régler`);
    window.setTimeout(() => {
      const li = document.querySelector<HTMLElement>(`.pa-liste [data-cle="${s.cle}"]`);
      amener(li, colonne.current);
      li?.querySelector<HTMLElement>("[data-geste='ouvrir']")?.focus({ preventScroll: true });
    }, 60);
  });


  // L'accueil a changé dans le brouillon : la vitrine du cadre se rend de nouveau, sur place.
  const rafraichir = (jeton: string) => {
    if (!origine) return;
    cadre.current?.contentWindow?.postMessage({ type: MESSAGE_RECHARGER, apercu: jeton }, origine);
  };

  const recharger = (jeton: string | null, pageVoulue?: string) => {
    if (!vitrine) return;
    const page = pageVoulue ?? chemin;
    const sep = page.includes("?") ? "&" : "?";
    setSrc(`${vitrine}${page}${sep}apercu=${jeton ?? "fin"}`);
    setRecharge((n) => n + 1);
  };

  /* --- L'enregistrement du brouillon (une seconde après le dernier geste). */
  const poste = async (champs: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(champs)) d.set(k, v);
    const r = await fetch(action, { method: "POST", body: d, headers: { accept: "application/json" }, credentials: "same-origin" });
    const rep = (await r.json().catch(() => null)) as
      | { ok: true; message: string; brouillon?: Brouillon | null; version?: number; orphelins?: string[] }
      | { ok: false; message: string; indice?: string | null }
      | null;
    if (!rep) throw new Error("réponse illisible");
    return rep;
  };

  /* --- Les pages : chaque écriture attend son tour (le brouillon de la
     vitrine avance d'une version à chacune : deux à la fois se marcheraient
     dessus), puis la vitrine du cadre se rend de nouveau, sur place. */
  const tour = async <T,>(f: () => Promise<T>): Promise<T> => {
    for (let i = 0; enVol.current && i < 100; i++) await new Promise((r) => window.setTimeout(r, 100));
    enVol.current = true;
    try {
      return await f();
    } finally {
      enVol.current = false;
      setRelance((n) => n + 1);
    }
  };
  const postePage = async (champs: Record<string, string>): Promise<RepPage> => {
    const d = new FormData();
    for (const [k, v] of Object.entries(champs)) d.set(k, v);
    const r = await fetch(action, { method: "POST", body: d, headers: { accept: "application/json" }, credentials: "same-origin" });
    return ((await r.json().catch(() => null)) as RepPage | null) ?? { ok: false, message: "Réponse illisible : rechargez la page." };
  };
  const coupure = "L'enregistrement n'a pas abouti (réseau coupé ?) : votre texte est toujours là, réessayez.";
  const noterBrouillon = (b: Brouillon | null) => {
    setBrouillon(b);
    setSauveA(b ? `à ${heureTunis()}` : null);
  };

  const ecrirePage = (p: PageEditeur, c: ContenuPage | null): Promise<Refus> => tour(async () => {
    try {
      const rep = await postePage({ geste: "page", id: p.id, version: String(p.version), contenu: c ? JSON.stringify(c) : "" });
      if (!rep.ok) return { champ: rep.champ ?? null, texte: rep.message };
      setPagesEtat((v) => v.map((x) => (x.id === p.id ? { ...x, brouillon: c } : x)));
      if (rep.jeton && rep.brouillon_version != null) {
        noterBrouillon({ jeton: rep.jeton, version: rep.brouillon_version });
        rafraichir(`${rep.jeton}.${rep.brouillon_version}`);
      }
      return null;
    } catch {
      return { champ: null, texte: coupure };
    }
  });

  const creerPage = (slug: string, c: ContenuPage): Promise<{ id: string } | Refus> => tour(async () => {
    try {
      const rep = await postePage({ geste: "page", slug, contenu: JSON.stringify(c) });
      if (!rep.ok) return { champ: rep.champ ?? null, texte: rep.message };
      if (!rep.id || !rep.slug) return { champ: null, texte: "Réponse illisible : rechargez la page." };
      const neuve: PageEditeur = { id: rep.id, slug: rep.slug, version: rep.version ?? 1, en_ligne: { ...c, corps_fr: "", publie: false }, brouillon: c };
      setPagesEtat((v) => [...v, neuve]);
      const b = rep.jeton && rep.brouillon_version != null ? { jeton: rep.jeton, version: rep.brouillon_version } : null;
      if (b) noterBrouillon(b);
      // La page neuve, encore hors ligne, à côté : l'aperçu du brouillon la sert.
      recharger(b ? `${b.jeton}.${b.version}` : null, `/${rep.slug}`);
      setAnnonce(`Page « ${c.titre_fr} » créée, hors ligne jusqu'à « Publier ».`);
      return { id: rep.id };
    } catch {
      return { champ: null, texte: coupure };
    }
  });

  const rangerPages = (ids: string[]): Promise<string | null> => tour(async () => {
    try {
      const rep = await postePage({ geste: "page-ordre", ids: JSON.stringify(ids) });
      if (!rep.ok) return rep.message;
      setPagesEtat((v) => ids.map((id) => v.find((x) => x.id === id)).filter((x): x is PageEditeur => Boolean(x)));
      const b = rep.brouillon ?? null;
      if (b) setBrouillon(b);
      rafraichir(b ? `${b.jeton}.${b.version}` : "fin");
      return null;
    } catch {
      return coupure;
    }
  });

  const retirerPage = (p: PageEditeur): Promise<string | null> => tour(async () => {
    try {
      const rep = await postePage({ geste: "page-retirer", id: p.id });
      if (!rep.ok) return rep.message;
      setPagesEtat((v) => v.filter((x) => x.id !== p.id));
      const b = rep.brouillon ?? null;
      if (b) setBrouillon(b);
      const j = b ? `${b.jeton}.${b.version}` : null;
      // La vitrine du cadre était sur la page : elle revient à l'accueil.
      if (chemin === `/${p.slug}`) recharger(j, "/");
      else rafraichir(j ?? "fin");
      return null;
    } catch {
      return coupure;
    }
  });

  // Une page hors ligne ne se montre qu'à l'aperçu d'un brouillon : on en ouvre un (tel quel).
  const ouvrirBrouillon = (): Promise<Brouillon | null> => tour(async () => {
    try {
      const corps = JSON.stringify(versBase(contenu));
      const rep = await poste({ geste: "brouillon", contenu: corps, version_brouillon: brouillon ? String(brouillon.version) : "" });
      if (!rep.ok || !("brouillon" in rep) || !rep.brouillon) return null;
      noterBrouillon(rep.brouillon);
      setEnvoye(corps);
      return rep.brouillon;
    } catch {
      return null;
    }
  });

  // Ouvrir une page (ou la liste, « nouvelle », un modèle) : l'aperçu va sur la page.
  const ouvrirPage = async (id: string | null) => {
    setPageCourante(id);
    const p = id ? pagesEtat.find((x) => x.id === id) : undefined;
    if (!p || !vitrine) return;
    let b = brouillon;
    if (!b && !p.en_ligne.publie) b = await ouvrirBrouillon();
    if (chemin !== `/${p.slug}`) recharger(b ? `${b.jeton}.${b.version}` : null, `/${p.slug}`);
  };
  // Ouvert d'emblée sur une page hors ligne, sans brouillon : l'aperçu en ouvre un.
  const ouvrirPageDepart = useEffectEvent(() => {
    if (!pageDepart || brouillonInitial || pageDepart.en_ligne.publie || !vitrine) return;
    void ouvrirBrouillon().then((b) => { if (b) recharger(`${b.jeton}.${b.version}`, `/${pageDepart.slug}`); });
  });
  useEffect(() => { ouvrirPageDepart(); }, []);

  const enregistre = useEffectEvent(async () => {
    if (enVol.current) return;
    // Une valeur que la base refuserait ne part pas : elle est dite sous son champ (et dans l'état).
    if (cadreARevoir) return;
    const c = contenu;
    const json = JSON.stringify(versBase(c));
    if (json === envoye) return;
    // Revenu exactement à la version publiée : le brouillon n'a plus lieu
    // d'être — sauf s'il garde une photo que lui seul emploie (l'abandonner
    // la retirerait du dépôt, et Ctrl+Maj+Z ne la retrouverait plus).
    const identique = memeContenu(c, publie);
    if (identique && !brouillon) { setEnvoye(json); return; }
    const seules = photosDe(JSON.parse(envoye) as ContenuApparence).filter((x) => !photosDe(publie).includes(x));
    // Des pages écrites dans le brouillon le gardent, même revenu à la version publiée.
    const abandon = identique && seules.length === 0 && !pagesEnBrouillon;
    enVol.current = true;
    setEtat({ genre: "envoi" });
    try {
      const rep = await poste({
        geste: abandon ? "abandonner" : "brouillon",
        contenu: json,
        version_brouillon: brouillon ? String(brouillon.version) : "",
      });
      if (!rep.ok) { setEtat({ genre: "erreur", texte: rep.message }); return; }
      const nouveau = "brouillon" in rep ? (rep.brouillon ?? null) : null;
      setBrouillon(nouveau);
      setSauveA(nouveau ? `à ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" }).format(new Date())}` : null);
      const accueilChange = empreinteRendu(JSON.parse(envoye)) !== empreinteRendu(JSON.parse(json));
      setEnvoye(json);
      setEtat({ genre: "repos" });
      // Une autre structure (d'autres composants), un autre accueil : la
      // vitrine du cadre se rend de nouveau, sur place.
      const structureChange = gabaritCadre !== null && gabaritCadre !== c.code;
      if ((structureChange || accueilChange) && !(comparer && parRechargement)) rafraichir(nouveau ? `${nouveau.jeton}.${nouveau.version}` : "fin");
    } catch {
      setEtat({ genre: "erreur", texte: "L'enregistrement n'a pas abouti (réseau coupé ?). Vos réglages sont toujours là." });
    } finally {
      enVol.current = false;
    }
  });

  const json = JSON.stringify(versBase(contenu));
  const enAttente = ecrit && json !== envoye;
  useEffect(() => {
    if (!enAttente || etat.genre === "envoi") return;
    // La structure se voit seulement une fois le brouillon enregistré : sans attendre.
    const delai = gabaritCadre !== null && gabaritCadre !== contenu.code ? 0 : 900;
    const minuterie = window.setTimeout(() => { void enregistre(); }, delai);
    return () => window.clearTimeout(minuterie);
  }, [json, enAttente, etat.genre, gabaritCadre, contenu.code, relance]);

  // Quitter la page avant que le brouillon soit parti : le navigateur prévient.
  useEffect(() => {
    if (!enAttente) return;
    const avant = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avant);
    return () => window.removeEventListener("beforeunload", avant);
  }, [enAttente]);

  /* --- Les gestes : changer, défaire, refaire. */
  const change = (suivant: ContenuApparence, cle: string, dit?: string) => {
    // Comparé tel quel : une espace tapée en fin de champ est un geste (la
    // forme envoyée à la base, elle, l'ôte).
    if (JSON.stringify(contenu) === JSON.stringify(suivant)) return;
    sortirDeComparer();
    // Le nuancier qu'on promène envoie un geste par teinte, la frappe un geste
    // par lettre : de suite sur la même couleur, dans le même champ, un seul
    // pas à défaire.
    const continu = cle === "accent" || cle === "fond" || cle.startsWith("jeton.") || cle.startsWith("texte.");
    const groupe = continu && dernierGeste.current === cle;
    dernierGeste.current = cle;
    if (!groupe) setHistorique({ passe: [...historique.passe.slice(-49), contenu], futur: [] });
    setContenu(suivant);
    if (dit) setAnnonce(`Aperçu : ${dit}`);
  };

  // Quitter « Avant / après » : la vitrine rechargée sur la version publiée revient sur l'essai.
  const sortirDeComparer = () => {
    if (!comparer) return;
    setComparer(false);
    if (parRechargement) rafraichir(brouillon ? `${brouillon.jeton}.${brouillon.version}` : "fin");
  };

  const basculerComparer = () => {
    const vers = !comparer;
    setComparer(vers);
    setAnnonce(vers ? "Aperçu : la version publiée" : "Aperçu : votre essai");
    if (parRechargement) rafraichir(vers || !brouillon ? "fin" : `${brouillon.jeton}.${brouillon.version}`);
  };

  // Un autre panneau s'ouvre en haut (pas là où le précédent était défilé) ;
  // celui de l'accueil met l'aperçu sur l'accueil.
  const ouvrirPanneau = (p: Panneau) => {
    if (p !== panneau) {
      const c = colonne.current;
      if (c && c.scrollHeight > c.clientHeight && getComputedStyle(c).overflowY !== "visible") c.scrollTop = 0;
      else {
        const onglets = c?.querySelector(".ap-panneaux");
        if (onglets && onglets.getBoundingClientRect().top < 0) amener(onglets, null);
      }
    }
    setPanneau(p);
    if (p === "accueil" && chemin !== "/" && !(comparer && parRechargement)) recharger(brouillon ? `${brouillon.jeton}.${brouillon.version}` : null, "/");
  };

  // Les gestes qui menaient à des photos retirées du dépôt sont oubliés.
  const oublier = (orphelins: string[] | undefined) => {
    if (!orphelins?.length) return false;
    const mene = (c: ContenuApparence) => photosDe(c).some((x) => orphelins.includes(x));
    setHistorique((h) => ({ passe: h.passe.filter((c) => !mene(c)), futur: h.futur.filter((c) => !mene(c)) }));
    return true;
  };

  // Un réglage de l'en-tête ou du pied : le brouillon ne garde que ce qui diffère de la vitrine en ligne.
  const reglerReglage = <K extends CleReglageEditeur>(cle: K, valeur: ReglagesVitrine[K]) => {
    const suivants: Partial<ReglagesVitrine> = { ...contenu.reglages, [cle]: valeur };
    if (valeur === reglagesPublies[cle]) delete suivants[cle];
    change({ ...contenu, reglages: Object.keys(suivants).length ? suivants : undefined }, typeof valeur === "string" ? `texte.reglage.${cle}` : `reglage.${cle}`);
  };

  const modifierAccueil = (suivantes: SectionBrute[] | null, cle: string, dit?: string) =>
    change({ ...contenu, sections: suivantes }, cle, dit ? `accueil — ${dit}` : undefined);

  // On écrit sur place, dans l'aperçu : un texte d'une section, ou l'annonce.
  // Chaque frappe est un geste comme une frappe dans le panneau (le même
  // brouillon, un seul pas à défaire) ; le champ du panneau suit, sous les
  // yeux, sans prendre le focus (on écrit dans l'aperçu). Échap : tout revient
  // à l'avant (le contenu et les pas à défaire).
  const ecritureDebut = useRef<{ contenu: ContenuApparence; historique: typeof historique; geste: string | null; tape: boolean } | null>(null);
  const surTexte = useEffectEvent((e: MessageEvent) => {
    if (!origine || e.origin !== origine || e.source !== cadre.current?.contentWindow) return;
    const m = e.data as { type?: string; etat?: unknown; section?: unknown; champ?: unknown; reglage?: unknown; valeur?: unknown } | null;
    if (m?.type !== MESSAGE_TEXTE || (comparer && comparable)) return;
    const valeur = typeof m.valeur === "string" ? m.valeur.slice(0, 2000) : null;
    let ecrire: ((v: string) => void) | null = null;
    let champ: string | null = null;
    if (m.reglage === "vitrine.annonce") {
      ecrire = (v) => reglerReglage("vitrine.annonce", v);
      champ = "#pc-annonce";
    } else if (Number.isInteger(m.section) && typeof m.champ === "string") {
      const s = sections[m.section as number];
      const cle = m.champ;
      if (!s?.cle || !entreeDe(s.type, contenu.code).textes.some((c) => c.cle === cle)) return;
      ecrire = (v) => modifierAccueil(sections.map((x) => (x.cle === s.cle ? { ...x, textes: { ...(x.textes ?? {}), [`${cle}_fr`]: v } } : x)), `texte.${s.cle}.${cle}`);
      champ = `#ac-${s.cle}-${cle}`;
      if (m.etat === "debut") { setPanneau("accueil"); setOuverte(s.cle); }
    }
    if (!ecrire || !champ) return;
    if (m.etat === "debut") {
      ecritureDebut.current = { contenu, historique, geste: dernierGeste.current, tape: false };
      if (m.reglage) setPanneau("cadre");
      setAnnonce("Écriture dans l'aperçu : Entrée pour finir, Échap pour annuler");
      // Le champ du panneau, sous les yeux et marqué, le temps de l'écriture.
      const cible = champ;
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(cible);
        for (const x of document.querySelectorAll("[data-lie]")) x.removeAttribute("data-lie");
        el?.closest(".champ")?.setAttribute("data-lie", "");
        // Au téléphone, l'onglet Aperçu ouvert : le panneau est masqué, la page ne bouge pas.
        if (el && el.getClientRects().length > 0) amener(el.closest(".champ") ?? el, colonne.current);
      }, 80);
      return;
    }
    if (m.etat === "annule") {
      const avant = ecritureDebut.current;
      ecritureDebut.current = null;
      for (const x of document.querySelectorAll("[data-lie]")) x.removeAttribute("data-lie");
      if (avant) { setContenu(avant.contenu); setHistorique(avant.historique); dernierGeste.current = avant.geste; }
      return;
    }
    if (valeur === null) return;
    // Un clic sans frappe n'écrit rien (pas même le titre par défaut affiché).
    if (m.etat === "frappe" && ecritureDebut.current) ecritureDebut.current.tape = true;
    if (m.etat === "frappe" || ecritureDebut.current?.tape) ecrire(valeur);
    if (m.etat === "fin") {
      ecritureDebut.current = null;
      for (const x of document.querySelectorAll("[data-lie]")) x.removeAttribute("data-lie");
      // La prochaine frappe, ici ou dans le panneau, est un autre pas.
      dernierGeste.current = null;
    }
  });

  useEffect(() => {
    const ecoute = (e: MessageEvent) => { surMessage(e); surSection(e); surTexte(e); };
    window.addEventListener("message", ecoute);
    return () => window.removeEventListener("message", ecoute);
  }, []);

  const defaire = () => {
    const precedent = historique.passe.at(-1);
    if (!precedent) return;
    setHistorique({ passe: historique.passe.slice(0, -1), futur: [contenu, ...historique.futur] });
    dernierGeste.current = null;
    setContenu(precedent);
    setAnnonce("Geste défait");
  };

  const refaire = () => {
    const suivant = historique.futur[0];
    if (!suivant) return;
    setHistorique({ passe: [...historique.passe, contenu], futur: historique.futur.slice(1) });
    dernierGeste.current = null;
    setContenu(suivant);
    setAnnonce("Geste refait");
  };

  const surTouche = useEffectEvent((e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const cible = e.target as HTMLElement | null;
    if (cible && (cible.tagName === "TEXTAREA" || (cible.tagName === "INPUT" && (cible as HTMLInputElement).type === "text"))) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); defaire(); }
    else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); refaire(); }
  });
  useEffect(() => {
    const touche = (e: KeyboardEvent) => surTouche(e);
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, []);

  /* --- Les réglages. */
  const reglerStyle = <K extends CleStyle>(cle: K, valeur: Style[K]) =>
    change({ ...contenu, style: { ...contenu.style, [cle]: valeur } }, `style.${cle}`, `${LIBELLES[cle].titre.toLowerCase()} — ${LIBELLES[cle].choix[valeur].toLowerCase()}`);

  const reglerMode = (mode: Mode) => {
    const fondActuel = contenu.couleurs.fond;
    const fondVa = FONDS[mode].some((f) => f.hex === fondActuel) ? fondActuel : FONDS[mode][0].hex;
    const encre = encrePour(mode, contenu.couleurs.encre);
    change({ ...contenu, couleurs: paletteDerivee(fondVa, encre, contenu.couleurs.accent, mode), style: { ...contenu.style, mode } }, "mode", `mode ${mode}`);
  };

  const prendreAmbiance = (a: Ambiance) =>
    change({ ...contenu, couleurs: paletteDerivee(a.fond, a.encre, a.accent, a.mode), style: { ...contenu.style, mode: a.mode } }, `ambiance.${a.id}`, `ambiance ${a.nom}`);

  const reglerFond = (hex: string) => {
    if (!estHex(hex)) return;
    const mode = contenu.style.mode;
    change({ ...contenu, couleurs: paletteDerivee(hex.toUpperCase(), encrePour(mode, contenu.couleurs.encre), contenu.couleurs.accent, mode) }, "fond", "fond de page");
  };

  const reglerAccent = (hex: string) => {
    if (!estHex(hex)) return;
    change({ ...contenu, couleurs: avecAccent(contenu.couleurs, hex.toUpperCase()) }, "accent", "couleur d'accent");
  };

  const reglerJeton = (j: JetonCouleur, hex: string) => {
    if (!estHex(hex)) return;
    change({ ...contenu, couleurs: { ...contenu.couleurs, [j]: hex.toUpperCase() } }, `jeton.${j}`, NOMS_JETONS[j].toLowerCase());
  };

  const reglerPolice = (role: "titres" | "texte", p: Police) =>
    change({ ...contenu, polices: { ...contenu.polices, [role]: p } }, `police.${role}`, `police des ${role === "titres" ? "titres" : "textes"}`);

  // Une autre structure : ses coins et ses boutons conseillés viennent avec (Ctrl+Z pour garder les vôtres).
  const reglerStructure = (code: Structure) => {
    const conseil = styleConseille(code);
    // Le Monoproduit vend la pièce d'une section « produit en vente » : un accueil
    // qui n'en a pas la reçoit en tête (à régler ensuite dans le panneau Accueil).
    const propres = contenu.sections;
    const sansVente = code === "monoproduit" && propres && propres.length < MAX_SECTIONS && !propres.some((x) => x.type === "piece");
    const sectionsApres = sansVente
      ? [nouvelleSection("piece", `n${1 + Math.max(0, ...propres.map((x) => Number(/^n(\d+)$/.exec(x.cle ?? "")?.[1] ?? 0)))}`), ...propres]
      : propres;
    change({ ...contenu, code, sections: sectionsApres, style: { ...contenu.style, coins: conseil.coins, boutons: conseil.boutons, cartes: conseil.cartes, photos: conseil.photos, casse: conseil.casse } },
      "code", `structure ${NOMS_STRUCTURES[code].nom.toLowerCase()}, avec ses coins et ses boutons`);
  };

  /* --- Publier, abandonner. */
  const publier = async () => {
    if (!ecrit) return;
    // La page en cours d'écriture envoie d'abord ce qui attend encore, puis on attend son tour.
    await videurPages.current?.();
    for (let i = 0; enVol.current && i < 50; i++) await new Promise((r) => window.setTimeout(r, 100));
    if (enVol.current) return;
    if (cadreARevoir) {
      setPanneau("cadre");
      setRetour({ ok: false, texte: "Un réglage de l'en-tête ou du pied de page est à revoir (dit sous son champ) avant de publier." });
      return;
    }
    enVol.current = true;
    setEtat({ genre: "envoi" });
    try {
      const rep = await poste({ geste: "publier", contenu: json, version: String(version ?? "") });
      if (!rep.ok) { setEtat({ genre: "erreur", texte: rep.message }); return; }
      setVersion(rep.version ?? version);
      // Les pages écrites dans le brouillon sont en ligne.
      setPagesEtat((v) => v.map((x) => (x.brouillon ? { ...x, version: x.version + 1, en_ligne: x.brouillon, brouillon: null } : x)));
      // Publiés, les réglages changés deviennent ceux en vigueur.
      const apres: ContenuApparence = { ...contenu, reglages: undefined };
      setReglagesPublies(reglages);
      setContenu(apres);
      setPublie(apres);
      setBrouillon(null);
      setSauveA(null);
      setEnvoye(JSON.stringify(versBase(apres)));
      setEtat({ genre: "repos" });
      setComparer(false);
      if ("orphelins" in rep) oublier(rep.orphelins);
      setRetour({ ok: true, texte: rep.message });
      // Ce que montre le cadre est ce qui est publié : il quitte l'aperçu, sur place.
      rafraichir("fin");
    } catch {
      setEtat({ genre: "erreur", texte: "La publication n'a pas abouti (réseau coupé ?). Vos réglages sont toujours là : réessayez." });
    } finally {
      enVol.current = false;
    }
  };

  const abandonner = async () => {
    if (!ecrit || enVol.current) return;
    enVol.current = true;
    setEtat({ genre: "envoi" });
    try {
      let orphelins: string[] | undefined;
      if (brouillon) {
        const rep = await poste({ geste: "abandonner", version_brouillon: String(brouillon.version) });
        if (!rep.ok) { setEtat({ genre: "erreur", texte: rep.message }); return; }
        if ("orphelins" in rep) orphelins = rep.orphelins;
      }
      setHistorique({ passe: [...historique.passe, contenu], futur: [] });
      // Les photos que seul l'essai employait ont quitté le dépôt : il ne se reprend plus.
      const oublie = oublier(orphelins);
      setContenu(publie);
      setEnvoye(JSON.stringify(versBase(publie)));
      setBrouillon(null);
      setSauveA(null);
      setOuverte(null);
      // Les brouillons des pages s'en vont avec (une page créée ici reste,
      // hors ligne) ; la page ouverte repart de ce qui est en ligne.
      setPagesEtat((v) => v.map((x) => ({ ...x, brouillon: null })));
      setGenerationPages((n) => n + 1);
      setComparer(false);
      setEtat({ genre: "repos" });
      setRetour({ ok: true, texte: oublie ? "Retour à la version publiée." : "Retour à la version publiée (⌘Z pour reprendre l'essai)." });
      rafraichir("fin");
    } catch {
      setEtat({ genre: "erreur", texte: "L'abandon du brouillon n'a pas abouti (réseau coupé ?) : réessayez." });
    } finally {
      enVol.current = false;
    }
  };

  // Un message de réussite s'efface de lui-même ; une erreur reste.
  useEffect(() => {
    if (!retour?.ok) return;
    const minuterie = window.setTimeout(() => setRetour(null), 6000);
    return () => window.clearTimeout(minuterie);
  }, [retour]);

  /* --- Ce que l'écran dit. */
  const identique = memeContenu(contenu, publie);
  const statut =
    cadreARevoir ? "Un réglage de l'en-tête ou du pied de page est à revoir (dit sous son champ) : il n'est pas encore enregistré."
    : etat.genre === "envoi" ? "Enregistrement…"
      : etat.genre === "erreur" ? etat.texte ?? "Erreur"
        : enAttente ? "Modifications…"
          : brouillon ? `Brouillon enregistré ${sauveA ?? ""}`.trim()
            : identique ? "C'est la version publiée" : "Essai non enregistré";
  const lienTelephone = vitrine && brouillon ? `${vitrine}/?apercu=${brouillon.jeton}.${brouillon.version}` : null;

  // Au téléphone, l'aperçu « téléphone » est la vitrine elle-même, à la
  // largeur de l'écran : pas un téléphone dessiné dans le téléphone, réduit
  // de moitié pour tenir en hauteur.
  const nu = petitEcran && appareil === "telephone";
  const echelle = appareil === "ordinateur"
    ? Math.min(1, taille.l / LARGEUR_ORDINATEUR)
    : nu ? Math.min(1, taille.l / TELEPHONE.l)
      : Math.min(1, (taille.h - 32) / (TELEPHONE.h + 28), (taille.l - 16) / (TELEPHONE.l + 28));
  const dimensions = appareil === "ordinateur"
    ? { inlineSize: LARGEUR_ORDINATEUR, blockSize: Math.max(480, taille.h / Math.max(echelle, 0.1)) }
    : { inlineSize: TELEPHONE.l, blockSize: TELEPHONE.h };

  const c = contenu.couleurs;
  const v = verdicts(c);

  return (
    <form
      className="ap-editeur"
      data-onglet={onglet}
      action={action}
      method="post"
      // Entrée dans un champ ne publie jamais la vitrine (l'envoi implicite
      // d'un formulaire) : seul le bouton « Publier » le fait.
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const geste = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
        if (geste === "abandonner") void abandonner();
        else void publier();
      }}
    >
      <input type="hidden" name="version" value={version ?? ""} />
      <input type="hidden" name="version_brouillon" value={brouillon?.version ?? ""} />
      <p className="sr-only" aria-live="polite">{annonce}</p>

      {/* La barre : d'où l'on vient, où en est l'essai, défaire, publier. */}
      <div className="ap-barre">
        <a className="ap-quitter" href={lienRetour} title="Revenir au backoffice">
          <Icone nom="gauche" /><span className="ap-quitter-texte">Backoffice</span>
        </a>
        <div className="ap-barre-titre">
          <h1>Éditeur de la vitrine</h1>
          <span className="ap-barre-boutique">{nom}</span>
        </div>
        <p className="ap-statut" data-etat={cadreARevoir ? "erreur" : etat.genre === "repos" && enAttente ? "attente" : etat.genre} role={cadreARevoir || etat.genre === "erreur" ? "alert" : "status"}>
          <span className="ap-pastille" aria-hidden="true" />
          {statut}
          {etat.genre === "erreur" && !cadreARevoir ? <button type="button" className="btn-lien" onClick={() => { setEtat({ genre: "repos" }); setRelance((n) => n + 1); }}>Réessayer</button> : null}
        </p>
        <div className="ap-barre-gestes">
          <button type="button" className="btn-icone" onClick={defaire} disabled={!historique.passe.length} aria-label="Défaire" title="Défaire (⌘Z)">
            <Icone nom="defaire" />
          </button>
          <button type="button" className="btn-icone" onClick={refaire} disabled={!historique.futur.length} aria-label="Refaire" title="Refaire (⇧⌘Z)">
            <Icone nom="refaire" />
          </button>
          {ecrit && (brouillon || !identique) ? (
            <button type="submit" name="geste" value="abandonner" className="btn btn-second btn-petit ap-abandon" disabled={etat.genre === "envoi"}
              aria-label="Revenir à la version publiée" title="Revenir à la version publiée">
              <Icone nom="retour" /><span className="ap-abandon-texte">Revenir à la version publiée</span>
            </button>
          ) : null}
          {ecrit ? (
            <button type="submit" name="geste" value="publier" className="btn btn-primaire" disabled={etat.genre === "envoi" || (identique && !brouillon)}>
              <Icone nom="succes" /> Publier
            </button>
          ) : null}
        </div>
      </div>

      {retour ? (
        <p className={retour.ok ? "message message-succes ap-retour" : "message message-erreur ap-retour"} role={retour.ok ? "status" : "alert"}>
          {retour.texte}
          <button type="button" className="btn-icone" aria-label="Fermer ce message" onClick={() => setRetour(null)}><Icone nom="croix" /></button>
        </p>
      ) : null}

      {/* Au téléphone : les réglages ou l'aperçu. */}
      <div className="ap-onglets" role="group" aria-label="Afficher">
        <button type="button" aria-pressed={onglet === "reglages"} onClick={() => setOnglet("reglages")}><Icone nom="reglages" /> Réglages</button>
        <button type="button" aria-pressed={onglet === "apercu"} onClick={() => setOnglet("apercu")}><Icone nom="oeil" /> Aperçu</button>
      </div>

      <div className="ap-corps">
        <div className="ap-reglages" ref={colonne}>
          <div className="ap-panneaux" role="tablist" aria-label="Ce que vous réglez">
            {PANNEAUX.map((x, i) => (
              <button key={x.id} type="button" role="tab" id={`ap-onglet-${x.id}`} aria-selected={panneau === x.id} aria-controls={`ap-panneau-${x.id}`}
                tabIndex={panneau === x.id ? 0 : -1} onClick={() => ouvrirPanneau(x.id)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const suivant = PANNEAUX[(i + (e.key === "ArrowRight" ? 1 : PANNEAUX.length - 1)) % PANNEAUX.length];
                  ouvrirPanneau(suivant.id);
                  document.getElementById(`ap-onglet-${suivant.id}`)?.focus();
                }}>
                <Icone nom={x.icone} taille={16} /> {x.nom}
              </button>
            ))}
          </div>
          <p className="ap-chapo">
            {ecrit
              ? "Chaque réglage se voit aussitôt sur la vraie vitrine, et s'enregistre dans un brouillon que vos visiteurs ne voient pas. Rien n'est en ligne avant « Publier »."
              : "Essayez librement : seuls le propriétaire et l'administrateur enregistrent et publient la vitrine."}
          </p>

          <div className="ap-panneau" role="tabpanel" id="ap-panneau-accueil" aria-labelledby="ap-onglet-accueil" hidden={panneau !== "accueil"}>
            <PanneauAccueil
              sections={sections}
              parStructure={parStructure}
              structure={contenu.code}
              nomStructure={NOMS_STRUCTURES[contenu.code].nom}
              infos={infos}
              ecrit={ecrit}
              photoAction={photoAction}
              ouverte={ouverte}
              ouvrir={setOuverte}
              modifier={modifierAccueil}
              montrer={montrer}
            />
          </div>

          <div className="ap-panneau" role="tabpanel" id="ap-panneau-cadre" aria-labelledby="ap-onglet-cadre" hidden={panneau !== "cadre"}>
            <PanneauCadre reglages={reglages} ecrit={ecrit} whatsapp={whatsapp} lienReglages={lienRetour + "/reglages/contact"} regler={reglerReglage} />
          </div>

          <div className="ap-panneau" role="tabpanel" id="ap-panneau-pages" aria-labelledby="ap-onglet-pages" hidden={panneau !== "pages"}>
            <PanneauPages
              pages={pagesEtat}
              modeles={modeles}
              office={office}
              ecrit={ecrit}
              affichee={affichee}
              courante={pageCourante}
              ouvrir={(id) => void ouvrirPage(id)}
              ecrire={ecrirePage}
              creer={creerPage}
              ranger={rangerPages}
              retirer={retirerPage}
              videurRef={videurPages}
              generation={generationPages}
            />
          </div>

          <div className="ap-panneau" role="tabpanel" id="ap-panneau-style" aria-labelledby="ap-onglet-style" hidden={panneau !== "style"}>
          {/* 1. La structure */}
          <section className="carte ap-groupe" aria-labelledby="ap-t-structure">
            <h2 id="ap-t-structure">Structure</h2>
            <fieldset className="ap-choix ap-choix-1">
              <legend className="sr-only">La structure de la vitrine</legend>
              {STRUCTURES.map((g) => (
                <label key={g} className="ap-option ap-option-large">
                  <input type="radio" name="code" value={g} checked={contenu.code === g} onChange={() => reglerStructure(g)} />
                  <span className="ap-vignette ap-v-structure" data-structure={g} aria-hidden="true"><i /><i /><i /><i /></span>
                  <span className="ap-option-texte"><b>{NOMS_STRUCTURES[g].nom}</b><span className="aide">{NOMS_STRUCTURES[g].aide}</span></span>
                </label>
              ))}
            </fieldset>
          </section>

          {/* 2. Les couleurs */}
          <section className="carte ap-groupe" aria-labelledby="ap-t-couleurs">
            <h2 id="ap-t-couleurs">Couleurs</h2>

            <fieldset className="ap-champ">
              <legend className="ap-legende">Mode</legend>
              <div className="ap-choix-segment">
                {(["clair", "sombre"] as const).map((m) => (
                  <label key={m} className="ap-segment">
                    <input type="radio" name="style.mode" value={m} checked={contenu.style.mode === m} onChange={() => reglerMode(m)} />
                    <span>{LIBELLES.mode.choix[m]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="ap-champ">
              <p className="ap-legende" id="ap-l-ambiances">Ambiances</p>
              <div className="ap-ambiances" role="group" aria-labelledby="ap-l-ambiances">
                {AMBIANCES.map((a) => {
                  const actif = c.fond === a.fond && c.accent === a.accent && c.encre === a.encre;
                  return (
                    <button key={a.id} type="button" className="ap-ambiance" aria-pressed={actif} onClick={() => prendreAmbiance(a)}
                      style={{ ["--a-fond" as string]: a.fond, ["--a-encre" as string]: a.encre, ["--a-accent" as string]: a.accent }}>
                      <span className="ap-ambiance-motif" aria-hidden="true"><i /><i /><i /></span>
                      <span className="ap-ambiance-nom">{a.nom}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <fieldset className="ap-champ">
              <legend className="ap-legende">Fond de page</legend>
              <div className="ap-nuancier">
                {FONDS[contenu.style.mode].map((f) => (
                  <label key={f.hex} className="ap-pastille-choix" title={f.nom}>
                    <input type="radio" name="ap-fond" value={f.hex} checked={c.fond === f.hex} onChange={() => reglerFond(f.hex)} />
                    <i style={{ background: f.hex }} aria-hidden="true" />
                    <span className="sr-only">{f.nom}</span>
                  </label>
                ))}
                <label className="ap-pastille-libre" title="Une autre couleur">
                  <input type="color" value={c.fond.toLowerCase()} onChange={(e) => reglerFond(e.currentTarget.value)} aria-label="Une autre couleur de fond" />
                </label>
              </div>
            </fieldset>

            <fieldset className="ap-champ">
              <legend className="ap-legende">Accent</legend>
              <div className="ap-nuancier">
                {ACCENTS.map((a) => (
                  <label key={a.hex} className="ap-pastille-choix" title={a.nom}>
                    <input type="radio" name="ap-accent" value={a.hex} checked={c.accent === a.hex} onChange={() => reglerAccent(a.hex)} />
                    <i style={{ background: a.hex }} aria-hidden="true" />
                    <span className="sr-only">{a.nom}</span>
                  </label>
                ))}
                <label className="ap-pastille-libre" title="Une autre couleur">
                  <input type="color" value={c.accent.toLowerCase()} onChange={(e) => reglerAccent(e.currentTarget.value)} aria-label="Une autre couleur d'accent" />
                </label>
              </div>
            </fieldset>

            <ul className="ap-contrastes" aria-label="Lisibilité">
              {v.map((x) => (
                <li key={x.cle} data-ok={x.rapport >= x.seuil ? "" : undefined}>
                  <Icone nom={x.rapport >= x.seuil ? "coche" : "alerte"} taille={14} />
                  <span>{x.libelle}</span>
                  <b>{rapportLisible(x.rapport)}</b>
                </li>
              ))}
            </ul>
            {v[2].rapport < v[2].seuil ? (
              <p className="aide">L&apos;accent se lit mal sur ce fond : il convient aux boutons et aux aplats, pas aux textes.</p>
            ) : null}

            <details className="ap-details">
              <summary>Les treize couleurs, une à une</summary>
              <div className="ap-jetons">
                {JETONS_COULEUR.map((j) => (
                  <label key={j} className="ap-jeton">
                    <input type="color" name={`couleurs.${j}`} value={c[j].toLowerCase()} onChange={(e) => reglerJeton(j, e.currentTarget.value)} />
                    <span>{NOMS_JETONS[j]}</span>
                    <code>{c[j]}</code>
                  </label>
                ))}
              </div>
            </details>
          </section>

          {/* 3. La typographie */}
          <section className="carte ap-groupe" aria-labelledby="ap-t-typo">
            <h2 id="ap-t-typo">Typographie</h2>
            <fieldset className="ap-champ">
              <legend className="ap-legende">Police des titres</legend>
              <div className="ap-polices">
                {POLICES_INFO.map((p) => (
                  <label key={p.valeur} className="ap-option ap-police">
                    <input type="radio" name="polices.titres" value={p.valeur} checked={contenu.polices.titres === p.valeur} onChange={() => reglerPolice("titres", p.valeur)} />
                    <span className="ap-police-echantillon" style={{ fontFamily: pilePolice(p.valeur) }} aria-hidden="true">Aa</span>
                    <span className="ap-option-texte"><b>{p.nom}</b><span className="aide">{p.caractere}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="ap-champ">
              <legend className="ap-legende">Police du texte</legend>
              <div className="ap-polices ap-polices-texte">
                {POLICES_INFO.filter((p) => p.texte).map((p) => (
                  <label key={p.valeur} className="ap-option ap-police">
                    <input type="radio" name="polices.texte" value={p.valeur} checked={contenu.polices.texte === p.valeur} onChange={() => reglerPolice("texte", p.valeur)} />
                    <span className="ap-police-phrase" style={{ fontFamily: pilePolice(p.valeur) }} aria-hidden="true">Livré chez vous, payé à la livraison.</span>
                    <span className="ap-option-texte"><b>{p.nom}</b></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Groupe cle="titres" valeur={contenu.style.titres} regler={reglerStyle} />
            <Groupe cle="casse" valeur={contenu.style.casse} regler={reglerStyle} police={contenu.polices.titres} />
          </section>

          {/* 4. Les formes */}
          <section className="carte ap-groupe" aria-labelledby="ap-t-formes">
            <h2 id="ap-t-formes">Formes</h2>
            <Groupe cle="allure" valeur={contenu.style.allure} regler={reglerStyle} />
            <Groupe cle="coins" valeur={contenu.style.coins} regler={reglerStyle} />
            <Groupe cle="boutons" valeur={contenu.style.boutons} regler={reglerStyle} />
            <Groupe cle="teinte" valeur={contenu.style.teinte} regler={reglerStyle} couleurs={c} />
            <Groupe cle="cartes" valeur={contenu.style.cartes} regler={reglerStyle} />
            <Groupe cle="photos" valeur={contenu.style.photos} regler={reglerStyle} />
          </section>

          {/* 5. Le rythme */}
          <section className="carte ap-groupe" aria-labelledby="ap-t-rythme">
            <h2 id="ap-t-rythme">Rythme</h2>
            <Groupe cle="densite" valeur={contenu.style.densite} regler={reglerStyle} />
            <Groupe cle="animations" valeur={contenu.style.animations} regler={reglerStyle} />
          </section>
          </div>

          {lienTelephone ? (
            <section className="carte ap-groupe ap-telephone" aria-labelledby="ap-t-tel">
              <h2 id="ap-t-tel"><Icone nom="mobile" /> Sur votre téléphone</h2>
              <p className="aide">Ce lien ouvre le brouillon sur n&apos;importe quel appareil, pendant deux heures. Les visiteurs, eux, voient la version publiée.</p>
              <div className="ap-lien">
                <code>{lienTelephone}</code>
                <BoutonCopier texte={lienTelephone} classe="btn btn-second btn-petit" />
              </div>
            </section>
          ) : null}

          {/* Sans script : enregistrer tel quel. */}
          <noscript>
            <p className="aide">Sans JavaScript, l&apos;aperçu ne suit pas vos gestes : publiez, puis ouvrez la vitrine.</p>
          </noscript>
        </div>

        {/* L'aperçu : la vraie vitrine. */}
        <div className="ap-apercu">
          <div className="ap-apercu-tete">
            <div className="ap-appareils" role="group" aria-label="Appareil de l'aperçu">
              <button type="button" aria-pressed={appareil === "ordinateur"} onClick={() => setChoixAppareil("ordinateur")}><Icone nom="ecran" /> Ordinateur</button>
              <button type="button" aria-pressed={appareil === "telephone"} onClick={() => setChoixAppareil("telephone")}><Icone nom="mobile" /> Téléphone</button>
            </div>
            {vitrine ? (
              <button type="button" className="ap-comparer" aria-pressed={comparer && comparable} disabled={!comparable} aria-label={comparer && comparable ? "Version publiée" : "Avant / après"}
                title={parRechargement ? "La structure ou l'accueil ont changé : la version publiée se recharge dans l'aperçu" : undefined}
                onClick={basculerComparer}>
                <Icone nom="apercu" /> <span className="ap-comparer-texte">{comparer && comparable ? "Version publiée" : "Avant / après"}</span>
              </button>
            ) : null}
            {vitrine ? (
              <label className="ap-page">
                <span className="sr-only">Page de l&apos;aperçu</span>
                <select value={PAGES_APERCU.some((p) => p.chemin === chemin) ? chemin : ""} onChange={(e) => { if (e.currentTarget.value) { setChemin(e.currentTarget.value); recharger(brouillon ? `${brouillon.jeton}.${brouillon.version}` : null, e.currentTarget.value); } }}>
                  {PAGES_APERCU.some((p) => p.chemin === chemin) ? null : <option value="">{chemin}</option>}
                  {PAGES_APERCU.map((p) => <option key={p.chemin} value={p.chemin}>{p.nom}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          <div className="ap-scene" ref={scene} data-appareil={appareil} data-nu={nu ? "" : undefined} data-compare={comparer && comparable ? "" : undefined}
            style={nu ? { blockSize: Math.round(TELEPHONE.h * echelle) } : undefined}>
            {comparer && comparable ? <span className="ap-badge-compare" aria-hidden="true">Version publiée</span> : null}
            {src ? (
              <div className="ap-ecran" data-appareil={appareil}
                style={{ inlineSize: dimensions.inlineSize, blockSize: dimensions.blockSize, transform: `scale(${echelle})` }}>
                <iframe
                  key={recharge}
                  ref={cadre}
                  src={src}
                  title={`Aperçu de la vitrine ${nom}`}
                  referrerPolicy="origin"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              </div>
            ) : (
              <div className="ap-sans-vitrine">
                <Icone nom="boutique" taille={28} />
                <p><b>La vitrine n&apos;est pas encore ouverte.</b></p>
                <p className="aide">L&apos;aperçu en direct apparaîtra dès son ouverture. Vos réglages, eux, s&apos;enregistrent et se publient dès maintenant.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

/** Un groupe de réglage du style : des boutons radio, chacun avec sa vignette. */
function Groupe<K extends CleStyle>({ cle, valeur, regler, couleurs, police }: {
  cle: K;
  valeur: Style[K];
  regler: (cle: K, v: Style[K]) => void;
  couleurs?: Record<JetonCouleur, string>;
  police?: Police;
}) {
  const libelles = LIBELLES[cle];
  const valeurs = REGLAGES_STYLE[cle] as unknown as readonly Style[K][];
  return (
    <fieldset className="ap-champ">
      <legend className="ap-legende">{libelles.titre}</legend>
      <div className={`ap-choix ap-choix-${valeurs.length}`}>
        {valeurs.map((x) => (
          <label key={x} className="ap-option">
            <input type="radio" name={`style.${cle}`} value={x} checked={valeur === x} onChange={() => regler(cle, x)} />
            <Vignette cle={cle} valeur={x} couleurs={couleurs} police={police} />
            <span className="ap-option-nom">{libelles.choix[x]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Le dessin d'un choix : ce qu'il fait, en petit. */
function Vignette({ cle, valeur, couleurs, police }: { cle: CleStyle; valeur: string; couleurs?: Record<JetonCouleur, string>; police?: Police }) {
  const s: Record<string, string> = {};
  if (cle === "teinte" && couleurs) s["--v-bouton"] = valeur === "accent" ? couleurs.accent : couleurs.encre;
  if (cle === "casse" && police) s.fontFamily = pilePolice(police);
  return (
    <span className="ap-vignette" data-cle={cle} data-valeur={valeur} style={s} aria-hidden="true">
      {cle === "titres" || cle === "casse" ? <span className="ap-v-titre">{cle === "casse" && valeur === "majuscules" ? "AA" : "Aa"}</span> : <i />}
      {cle === "densite" ? <><i /><i /></> : null}
    </span>
  );
}
