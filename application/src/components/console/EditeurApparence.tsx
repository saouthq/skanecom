"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icone } from "./Icone";
import { BoutonCopier } from "./BoutonCopier";
import { MESSAGE_APPARENCE, MESSAGE_PRET } from "@/components/ApercuApparence";
import {
  ACCENTS, AMBIANCES, FONDS, avecAccent, encrePour, memeContenu, paletteDerivee, rapportLisible, verdicts, versBase,
  type Ambiance, type ContenuApparence, type Mode,
} from "@/lib/apparence";
import { estHex } from "@/lib/couleur";
import {
  GABARITS, JETONS_COULEUR, POLICES_INFO, pilePolice, REGLAGES_STYLE,
  type CleStyle, type CodeTheme, type JetonCouleur, type Police, type Style,
} from "@/lib/theme";

/* ============================================================================
   L'ÉDITEUR D'APPARENCE — à gauche les réglages, à droite la VRAIE vitrine
   (dans un cadre), qui change à chaque geste :

   · couleurs, polices et style partent au cadre par message (la vitrine les
     applique sans recharger : components/ApercuApparence.tsx) ;
   · chaque geste s'enregistre, une seconde plus tard, dans le BROUILLON (que
     les visiteurs ne voient pas) ; changer de structure recharge le cadre sur
     l'aperçu du brouillon (la façade le rend : src/proxy.ts) ;
   · « Publier » met l'apparence en ligne ; « Revenir à la version publiée »
     abandonne le brouillon ; ⌘Z / ⇧⌘Z défont et refont.

   Les réglages sont de vrais boutons radio (flèches du clavier dans chaque
   groupe, lecteurs d'écran) ; sans script, le formulaire s'envoie tel quel
   (un champ par réglage) et la route enregistre ou publie.
   ========================================================================== */

type Brouillon = { version: number; jeton: string };
type Message = { ok: boolean; texte: string };

const STRUCTURES: Record<CodeTheme, { nom: string; aide: string }> = {
  editorial: { nom: "Éditoriale", aide: "Grandes photos, peu de mots, typographie de magazine. Mode, beauté, maison." },
  technique: { nom: "Technique", aide: "Grille dense, fiches techniques, recherche par référence. Outillage, high-tech." },
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

export function EditeurApparence({
  action, retour: lienRetour, vitrine, ecrit, nom, fiche, version: versionInitiale, publie: publieInitial, brouillon: brouillonInitial, message,
}: {
  action: string;
  /** Le backoffice, d'où l'on vient (l'éditeur prend tout l'écran). */
  retour: string;
  vitrine: string | null;
  ecrit: boolean;
  nom: string;
  /** Une fiche produit de la boutique, à regarder dans l'aperçu. */
  fiche: { chemin: string; nom: string } | null;
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
  const PAGES_APERCU = fiche ? [PAGES_FIXES[0], PAGES_FIXES[1], { chemin: fiche.chemin, nom: `Fiche : ${fiche.nom}` }, PAGES_FIXES[2]] : PAGES_FIXES;

  /* --- Le cadre d'aperçu. */
  const origine = useMemo(() => (vitrine ? new URL(vitrine).origin : null), [vitrine]);
  const [src, setSrc] = useState<string | null>(() =>
    vitrine ? `${vitrine}/?apercu=${brouillonInitial ? `${brouillonInitial.jeton}.${brouillonInitial.version}` : "fin"}` : null);
  const [recharge, setRecharge] = useState(0);
  const [chemin, setChemin] = useState("/");
  const [gabaritCadre, setGabaritCadre] = useState<CodeTheme | null>(null);
  const cadre = useRef<HTMLIFrameElement>(null);
  const scene = useRef<HTMLDivElement>(null);
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

  // « Avant / après » : le cadre montre un instant la version publiée (même structure seulement).
  const [comparer, setComparer] = useState(false);
  const comparable = publie.code === contenu.code && !memeContenu(publie, contenu);
  const montre = comparer && comparable ? publie : contenu;

  // Chaque geste : la vitrine du cadre le prend aussitôt.
  useEffect(() => { envoieAuCadre(montre); }, [montre]);

  // La vitrine du cadre dit qu'elle est prête (à chaque page) : on lui renvoie l'apparence.
  const surMessage = useEffectEvent((e: MessageEvent) => {
    if (!origine || e.origin !== origine || e.source !== cadre.current?.contentWindow) return;
    const m = e.data as { type?: string; chemin?: string; gabarit?: CodeTheme } | null;
    if (m?.type !== MESSAGE_PRET) return;
    if (typeof m.chemin === "string") setChemin(m.chemin.replace(/[?&]apercu=[^&]*/, "").replace(/\?$/, "") || "/");
    if (m.gabarit === "editorial" || m.gabarit === "technique") setGabaritCadre(m.gabarit);
    envoieAuCadre(montre);
  });
  useEffect(() => {
    const ecoute = (e: MessageEvent) => surMessage(e);
    window.addEventListener("message", ecoute);
    return () => window.removeEventListener("message", ecoute);
  }, []);

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
      | { ok: true; message: string; brouillon?: Brouillon | null; version?: number }
      | { ok: false; message: string; indice?: string | null }
      | null;
    if (!rep) throw new Error("réponse illisible");
    return rep;
  };

  const enregistre = useEffectEvent(async () => {
    if (enVol.current) return;
    const c = contenu;
    const json = JSON.stringify(versBase(c));
    if (json === envoye) return;
    // Revenu exactement à la version publiée : le brouillon n'a plus lieu d'être.
    const identique = memeContenu(c, publie);
    if (identique && !brouillon) { setEnvoye(json); return; }
    enVol.current = true;
    setEtat({ genre: "envoi" });
    try {
      const rep = await poste({
        geste: identique ? "abandonner" : "brouillon",
        contenu: json,
        version_brouillon: brouillon ? String(brouillon.version) : "",
      });
      if (!rep.ok) { setEtat({ genre: "erreur", texte: rep.message }); return; }
      const nouveau = "brouillon" in rep ? (rep.brouillon ?? null) : null;
      setBrouillon(nouveau);
      setSauveA(nouveau ? `à ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" }).format(new Date())}` : null);
      setEnvoye(json);
      setEtat({ genre: "repos" });
      // Une autre structure : la vitrine du cadre doit rendre d'autres composants.
      if (gabaritCadre !== null && gabaritCadre !== c.code) recharger(nouveau ? `${nouveau.jeton}.${nouveau.version}` : null);
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
    if (memeContenu(contenu, suivant)) return;
    setComparer(false);
    // Le nuancier qu'on promène envoie un geste par teinte : de suite sur la même couleur, un seul pas à défaire.
    const continu = cle === "accent" || cle === "fond" || cle.startsWith("jeton.");
    const groupe = continu && dernierGeste.current === cle;
    dernierGeste.current = cle;
    if (!groupe) setHistorique({ passe: [...historique.passe.slice(-49), contenu], futur: [] });
    setContenu(suivant);
    if (dit) setAnnonce(`Aperçu : ${dit}`);
  };

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

  const reglerStructure = (code: CodeTheme) => change({ ...contenu, code }, "code", `structure ${STRUCTURES[code].nom.toLowerCase()}`);

  /* --- Publier, abandonner. */
  const publier = async () => {
    if (!ecrit || enVol.current) return;
    enVol.current = true;
    setEtat({ genre: "envoi" });
    try {
      const rep = await poste({ geste: "publier", contenu: json, version: String(version ?? "") });
      if (!rep.ok) { setEtat({ genre: "erreur", texte: rep.message }); return; }
      setVersion(rep.version ?? version);
      setPublie(contenu);
      setBrouillon(null);
      setSauveA(null);
      setEnvoye(json);
      setEtat({ genre: "repos" });
      setRetour({ ok: true, texte: rep.message });
      recharger(null);
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
      if (brouillon) {
        const rep = await poste({ geste: "abandonner", version_brouillon: String(brouillon.version) });
        if (!rep.ok) { setEtat({ genre: "erreur", texte: rep.message }); return; }
      }
      setHistorique({ passe: [...historique.passe, contenu], futur: [] });
      setContenu(publie);
      setEnvoye(JSON.stringify(versBase(publie)));
      setBrouillon(null);
      setSauveA(null);
      setEtat({ genre: "repos" });
      setRetour({ ok: true, texte: "Retour à la version publiée (⌘Z pour reprendre l'essai)." });
      recharger(null);
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
    etat.genre === "envoi" ? "Enregistrement…"
      : etat.genre === "erreur" ? etat.texte ?? "Erreur"
        : enAttente ? "Modifications…"
          : brouillon ? `Brouillon enregistré ${sauveA ?? ""}`.trim()
            : identique ? "C'est la version publiée" : "Essai non enregistré";
  const lienTelephone = vitrine && brouillon ? `${vitrine}/?apercu=${brouillon.jeton}.${brouillon.version}` : null;

  const echelle = appareil === "ordinateur"
    ? Math.min(1, taille.l / LARGEUR_ORDINATEUR)
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
          <h1>Apparence</h1>
          <span className="ap-barre-boutique">{nom}</span>
        </div>
        <p className="ap-statut" data-etat={etat.genre === "repos" && enAttente ? "attente" : etat.genre} role={etat.genre === "erreur" ? "alert" : "status"}>
          <span className="ap-pastille" aria-hidden="true" />
          {statut}
          {etat.genre === "erreur" ? <button type="button" className="btn-lien" onClick={() => { setEtat({ genre: "repos" }); setRelance((n) => n + 1); }}>Réessayer</button> : null}
        </p>
        <div className="ap-barre-gestes">
          <button type="button" className="btn-icone" onClick={defaire} disabled={!historique.passe.length} aria-label="Défaire" title="Défaire (⌘Z)">
            <Icone nom="defaire" />
          </button>
          <button type="button" className="btn-icone" onClick={refaire} disabled={!historique.futur.length} aria-label="Refaire" title="Refaire (⇧⌘Z)">
            <Icone nom="refaire" />
          </button>
          {ecrit && (brouillon || !identique) ? (
            <button type="submit" name="geste" value="abandonner" className="btn btn-second btn-petit ap-abandon" disabled={etat.genre === "envoi"}>
              Revenir à la version publiée
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
        <div className="ap-reglages">
          <p className="ap-chapo">
            {ecrit
              ? "Chaque réglage se voit aussitôt sur la vraie vitrine, et s'enregistre dans un brouillon que vos visiteurs ne voient pas. Rien n'est en ligne avant « Publier »."
              : "Essayez librement : seuls le propriétaire et l'administrateur enregistrent et publient l'apparence."}
          </p>
          {/* 1. La structure */}
          <section className="carte ap-groupe" aria-labelledby="ap-t-structure">
            <h2 id="ap-t-structure">Structure</h2>
            <fieldset className="ap-choix ap-choix-1">
              <legend className="sr-only">La structure de la vitrine</legend>
              {GABARITS.map((g) => (
                <label key={g} className="ap-option ap-option-large">
                  <input type="radio" name="code" value={g} checked={contenu.code === g} onChange={() => reglerStructure(g)} />
                  <span className="ap-vignette ap-v-structure" data-structure={g} aria-hidden="true"><i /><i /><i /><i /></span>
                  <span className="ap-option-texte"><b>{STRUCTURES[g].nom}</b><span className="aide">{STRUCTURES[g].aide}</span></span>
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
              <button type="button" className="ap-comparer" aria-pressed={comparer && comparable} disabled={!comparable}
                title={publie.code !== contenu.code ? "La structure a changé : la comparaison se fait à structure égale" : undefined}
                onClick={() => { setComparer(!comparer); setAnnonce(comparer ? "Aperçu : votre essai" : "Aperçu : la version publiée"); }}>
                <Icone nom="apercu" /> {comparer && comparable ? "Version publiée" : "Avant / après"}
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
          <div className="ap-scene" ref={scene} data-appareil={appareil} data-compare={comparer && comparable ? "" : undefined}>
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
