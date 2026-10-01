"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icone } from "@/components/console/Icone";
import {
  BIBLIOTHEQUE, LONGUEUR_TEXTE, MAX_SECTIONS, TYPES,
  nouvelleSection, problemesAccueil, sectionMasquee, titreParDefaut, versBase,
  type AccueilGestion, type EmplacementAccueil, type SectionBrute,
} from "@/lib/gestion/accueil";
import { REGLES } from "@/lib/console/images-marque";
import { preparerPhoto } from "@/lib/console/photo-navigateur";
import { definitionDe, type CodeTheme, type TypeSection } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";

/* ============================================================================
   LE COMPOSEUR DE L'ACCUEIL — à gauche, l'accueil de haut en bas : chaque
   section, sa miniature, ce qu'elle dit, si la vitrine la montrera ; on la
   monte, la descend, l'ouvre pour la régler, la retire (et on la rétablit).
   À droite, la bibliothèque : une section s'ajoute en un geste, en bas de
   l'accueil, ouverte et prête à régler.

   Rien ne part avant « Enregistrer l'accueil » (⌘S) : l'envoi se fait en
   arrière-plan, la composition reste à l'écran ; quitter avec des
   changements demande confirmation. Au clavier : chaque geste garde le
   focus sur la section qu'il a déplacée, et l'annonce.
   ========================================================================== */

type Retour = { ok: boolean; texte: string; retablir?: { section: SectionBrute; position: number } } | null;

const rien = () => () => {};
const surMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
const ordinal = (n: number) => (n === 1 ? "1re" : `${n}e`);
const empreinte = (s: SectionBrute[]) => JSON.stringify(versBase(s));

export function ComposeurAccueil({
  action,
  photoAction,
  vitrine,
  ecrit,
  accueil,
  sections: initiales,
  parGabarit: parGabaritInitial,
  message,
}: {
  action: string;
  /** Où téléverser une photo de section (…/accueil/photo). */
  photoAction: string;
  vitrine: string | null;
  ecrit: boolean;
  accueil: AccueilGestion & { code: CodeTheme };
  sections: SectionBrute[];
  parGabarit: boolean;
  message: Retour;
}) {
  const [sections, setSections] = useState<SectionBrute[]>(initiales);
  const [sauve, setSauve] = useState(() => empreinte(initiales));
  const [version, setVersion] = useState(accueil.version);
  const [parGabarit, setParGabarit] = useState(parGabaritInitial);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [retour, setRetour] = useState<Retour>(message);
  const [annonce, setAnnonce] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const compteur = useRef(initiales.length);
  const mac = useSyncExternalStore(rien, surMac, () => false);
  const code = accueil.code;

  const modifie = empreinte(sections) !== sauve;
  const problemes = useMemo(() => problemesAccueil(sections), [sections]);
  const presents = new Set(sections.map((s) => s.type));
  const masquees = sections.filter((s) => sectionMasquee(s, accueil)).length;

  /* --- Le focus suit la section déplacée : après le rendu, on vise le
     bouton (ou le champ) demandé. */
  const viser = useRef<string[] | null>(null);
  useEffect(() => {
    if (!viser.current) return;
    // Le premier sélecteur qui trouve, dans l'ordre donné.
    const el = viser.current.map((q) => document.querySelector<HTMLElement>(q)).find(Boolean);
    viser.current = null;
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  });

  const nom = (s: SectionBrute) => BIBLIOTHEQUE[s.type].nom;
  const changer = (cle: string, x: Partial<SectionBrute>) =>
    setSections((v) => v.map((s) => (s.cle === cle ? { ...s, ...x } : s)));
  const texte = (cle: string, champ: string, valeur: string) =>
    setSections((v) => v.map((s) => (s.cle === cle ? { ...s, textes: { ...(s.textes ?? {}), [`${champ}_fr`]: valeur } } : s)));

  function deplacer(i: number, sens: -1 | 1, geste: "monter" | "descendre") {
    const j = i + sens;
    if (j < 0 || j >= sections.length) return;
    const s = sections[i];
    const v = [...sections];
    [v[i], v[j]] = [v[j], v[i]];
    setSections(v);
    setRetour(null);
    // Arrivée en haut (ou en bas), le bouton disparaît : on vise l'autre.
    const cible = (geste === "monter" && j === 0) ? "descendre" : (geste === "descendre" && j === v.length - 1) ? "monter" : geste;
    viser.current = [`[data-cle="${s.cle}"] [data-geste="${cible}"]`];
    setAnnonce(`« ${nom(s)} » ${geste === "monter" ? "montée" : "descendue"} en ${ordinal(j + 1)} position sur ${v.length}.`);
  }

  function retirer(i: number) {
    const s = sections[i];
    const v = sections.filter((_, k) => k !== i);
    setSections(v);
    if (ouverte === s.cle) setOuverte(null);
    setRetour({ ok: true, texte: `« ${nom(s)} » retirée de l'accueil.`, retablir: { section: s, position: i } });
    const suivante = v[Math.min(i, v.length - 1)];
    viser.current = suivante ? [`[data-cle="${suivante.cle}"] [data-geste="ouvrir"]`] : [".ac-modele:not(:disabled)"];
  }

  function retablir() {
    if (!retour?.retablir) return;
    const { section, position } = retour.retablir;
    setSections((v) => [...v.slice(0, position), section, ...v.slice(position)]);
    setRetour(null);
    viser.current = [`[data-cle="${section.cle}"] [data-geste="ouvrir"]`];
    setAnnonce(`« ${nom(section)} » rétablie en ${ordinal(position + 1)} position.`);
  }

  function ajouter(type: TypeSection) {
    if (sections.length >= MAX_SECTIONS) return;
    const cle = `n${compteur.current++}`;
    setSections((v) => [...v, nouvelleSection(type, cle)]);
    setOuverte(cle);
    setRetour(null);
    viser.current = [`[data-cle="${cle}"] .ac-reglages :is(input, select, textarea)`, `[data-cle="${cle}"] [data-geste="ouvrir"]`];
    setAnnonce(`« ${BIBLIOTHEQUE[type].nom} » ajoutée en bas de l'accueil, ouverte pour la régler.`);
  }

  function annuler() {
    setSections(JSON.parse(JSON.stringify(sectionsDepuis(sauve, code, parGabarit))) as SectionBrute[]);
    setOuverte(null);
    setRetour(null);
    setAnnonce("Changements annulés : l'accueil revient à sa version enregistrée.");
  }

  /* --- Partir avec des changements non enregistrés : on demande. */
  useEffect(() => {
    if (!modifie) return;
    const avant = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const clic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      if (new URL(a.href, location.href).origin !== location.origin) return;
      if (!window.confirm("Vos changements de l'accueil ne sont pas enregistrés. Quitter quand même cette page ?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", avant);
    window.addEventListener("click", clic, true);
    return () => {
      window.removeEventListener("beforeunload", avant);
      window.removeEventListener("click", clic, true);
    };
  }, [modifie]);

  /* --- L'envoi. */
  const envoyer = useCallback(async (geste: "enregistrer" | "gabarit") => {
    if (!ecrit || envoi) return;
    if (geste === "enregistrer") {
      const premier = Object.keys(problemes.parSection)[0];
      if (problemes.general || premier) {
        if (premier) { setOuverte(premier); viser.current = [`[data-cle="${premier}"] .ac-erreur`]; }
        setRetour({ ok: false, texte: problemes.general ?? "Une section est à revoir (signalée en rouge) : rien n'est perdu." });
        return;
      }
    }
    setEnvoi(true);
    const d = new FormData();
    d.set("geste", geste);
    d.set("version", String(version ?? ""));
    const envoyees = sections;
    if (geste === "enregistrer") d.set("sections", JSON.stringify(versBase(envoyees)));
    try {
      const r = await fetch(action, { method: "POST", body: d, headers: { accept: "application/json" }, credentials: "same-origin" });
      const rep = (await r.json().catch(() => null)) as { ok: true; message: string; version: number } | { ok: false; message: string } | null;
      if (!rep) throw new Error("réponse illisible");
      if (!rep.ok) { setRetour({ ok: false, texte: rep.message }); return; }
      setVersion(rep.version);
      if (geste === "gabarit") {
        const defaut = sectionsDepuis(null, code, true);
        setSections(defaut);
        setSauve(empreinte(defaut));
        setParGabarit(true);
        setOuverte(null);
      } else {
        setSauve(empreinte(envoyees));
        setParGabarit(false);
      }
      setRetour({ ok: true, texte: rep.message });
    } catch {
      setRetour({ ok: false, texte: "L'envoi n'a pas abouti (réseau coupé ?). Votre composition est toujours là : réessayez." });
    } finally {
      setEnvoi(false);
    }
  }, [ecrit, envoi, problemes, version, sections, action, code]);

  // ⌘S / Ctrl+S, où que soit le focus.
  useEffect(() => {
    if (!ecrit) return;
    const touche = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void envoyer("enregistrer");
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [ecrit, envoyer]);

  const destinations = useMemo(() => [
    { valeur: "/catalogue", libelle: "Tout le catalogue" },
    ...accueil.rayons.map((r) => ({ valeur: `/categorie/${r.slug}`, libelle: `Rayon : ${r.nom}` })),
    ...accueil.pages.filter((p) => p.publie).map((p) => ({ valeur: `/${p.slug}`, libelle: `Page : ${p.titre}` })),
  ], [accueil.rayons, accueil.pages]);

  const mod = mac ? "⌘" : "Ctrl+";

  return (
    <form
      className="ac-composeur"
      action={action}
      method="post"
      onSubmit={(e) => { e.preventDefault(); void envoyer("enregistrer"); }}
    >
      <input type="hidden" name="geste" value="enregistrer" />
      <input type="hidden" name="version" value={version ?? ""} />
      <input type="hidden" name="sections" value={JSON.stringify(versBase(sections))} />
      <p className="sr-only" aria-live="polite">{annonce}</p>

      {retour && !ecrit ? (
        <p className={retour.ok ? "message message-succes" : "message message-erreur"} role={retour.ok ? "status" : "alert"}>{retour.texte}</p>
      ) : null}

      <div className="ac-grille">
        <section className="carte ac-plan" aria-labelledby="t-plan">
          <div className="carte-tete">
            <div>
              <h2 id="t-plan" className="carte-titre-icone"><Icone nom="boutique" /> Votre accueil, de haut en bas</h2>
              <p>
                {sections.length} section{sections.length > 1 ? "s" : ""}
                {masquees ? ` · ${masquees} que la vitrine ne montre pas encore` : ""}
                {parGabarit && !modifie ? " · l'accueil du gabarit" : ""}
              </p>
            </div>
            {vitrine ? (
              <a className="btn btn-second btn-petit" href={vitrine} target="_blank" rel="noopener">
                <Icone nom="externe" /> Voir l&apos;accueil
              </a>
            ) : null}
          </div>

          <ol className="ac-liste" role="list">
            {sections.map((s, i) => {
              const entree = BIBLIOTHEQUE[s.type];
              const titre = (s.textes?.titre_fr ?? "").trim() || s.textes?.titre_ar || titreParDefaut(s.type, code, s.tri);
              const masquee = sectionMasquee(s, accueil);
              const ouvert = ouverte === s.cle;
              const erreur = s.cle ? problemes.parSection[s.cle] : undefined;
              const idReglages = `ac-reglages-${s.cle}`;
              return (
                <li key={s.cle} className="ac-section" data-cle={s.cle} data-ouverte={ouvert ? "" : undefined} data-masquee={masquee ? "" : undefined}>
                  <div className="ac-section-ligne">
                    <span className="ac-rang" aria-hidden="true">{i + 1}</span>
                    <Miniature type={s.type} photo={s.image ? urlFichier(s.image.chemin) : null} />
                    <div className="ac-section-texte">
                      <b>{entree.nom}</b>
                      <span className="ac-section-titre">{titre.replace(/\n/g, " ")}</span>
                      {resumeReglage(s, accueil) ? <span className="aide">{resumeReglage(s, accueil)}</span> : null}
                      {masquee ? <span className="ac-masquee"><Icone nom="oeil" taille={12} /> {masquee}</span> : null}
                    </div>
                    {ecrit ? (
                      <span className="ac-gestes">
                        {i > 0 ? (
                          <button type="button" className="btn-icone" data-geste="monter" aria-label={`Monter « ${entree.nom} »`} title="Monter" onClick={() => deplacer(i, -1, "monter")}>
                            <Icone nom="haut" />
                          </button>
                        ) : <span className="ac-geste-vide" />}
                        {i < sections.length - 1 ? (
                          <button type="button" className="btn-icone" data-geste="descendre" aria-label={`Descendre « ${entree.nom} »`} title="Descendre" onClick={() => deplacer(i, 1, "descendre")}>
                            <Icone nom="bas" />
                          </button>
                        ) : <span className="ac-geste-vide" />}
                        <button type="button" className="btn btn-second btn-petit" data-geste="ouvrir" aria-expanded={ouvert} aria-controls={idReglages}
                          onClick={() => setOuverte(ouvert ? null : (s.cle ?? null))}>
                          <Icone nom="crayon" /> {ouvert ? "Fermer" : "Régler"}<span className="sr-only"> « {entree.nom} »</span>
                        </button>
                        <button type="button" className="btn-icone ac-retirer" data-geste="retirer" aria-label={`Retirer « ${entree.nom} »`} title="Retirer" onClick={() => retirer(i)} disabled={sections.length <= 1}>
                          <Icone nom="corbeille" />
                        </button>
                      </span>
                    ) : null}
                  </div>
                  {erreur ? <p className="ac-erreur" tabIndex={-1}>{erreur}</p> : null}
                  {ouvert ? (
                    <div id={idReglages} className="ac-reglages formulaire">
                      <Reglages s={s} accueil={accueil} code={code} destinations={destinations} ecrit={ecrit} changer={changer} texte={texte} photoAction={photoAction} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="carte ac-bibliotheque" aria-labelledby="t-biblio">
          <div className="carte-tete">
            <div>
              <h2 id="t-biblio" className="carte-titre-icone"><Icone nom="plus" /> Ajouter une section</h2>
              <p>{sections.length >= MAX_SECTIONS ? `L'accueil compte ses ${MAX_SECTIONS} sections : retirez-en une pour en ajouter.` : "Elle se place en bas de l'accueil ; montez-la ensuite où vous voulez."}</p>
            </div>
          </div>
          <ul className="ac-modeles" role="list">
            {/* Ce qu'on peut ajouter d'abord ; ce qui est déjà sur l'accueil, à la fin. */}
            {[...TYPES].sort((a, b) => Number(Boolean(BIBLIOTHEQUE[a].unique && presents.has(a))) - Number(Boolean(BIBLIOTHEQUE[b].unique && presents.has(b)))).map((type) => {
              const e = BIBLIOTHEQUE[type];
              const deja = e.unique && presents.has(type);
              const plein = sections.length >= MAX_SECTIONS;
              const masquee = sectionMasquee(nouvelleSection(type, "x"), accueil);
              const montrable = type === "editorial" || type === "texte" ? null : masquee;
              return (
                <li key={type}>
                  <button type="button" className="ac-modele" disabled={!ecrit || deja || plein} onClick={() => ajouter(type)}
                    aria-describedby={`ac-modele-${type}`}>
                    <Miniature type={type} />
                    <span className="ac-modele-texte">
                      <b>{e.nom}</b>
                      <span id={`ac-modele-${type}`} className="aide">
                        {deja ? "Déjà sur l'accueil." : montrable ? `${e.resume} ${montrable}` : e.resume}
                      </span>
                    </span>
                    <span className="ac-modele-plus" aria-hidden="true"><Icone nom="plus" taille={14} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {ecrit ? (
        // Collée sous le pouce tant qu'il y a quelque chose à enregistrer ou à
        // lire (un retrait à rétablir, la réponse de l'envoi) ; sinon à sa place.
        <div className="carte ac-pied" data-actif={modifie || retour || envoi ? "" : undefined}>
          {retour ? (
            <p className={retour.ok ? "ac-retour" : "ac-retour ac-retour-erreur"} role={retour.ok ? "status" : "alert"}>
              <Icone nom={retour.ok ? "coche" : "alerte"} taille={14} />
              <span>{retour.texte}{modifie && !retour.retablir ? " Des changements ne sont pas enregistrés." : ""}</span>
              {retour.retablir ? <button type="button" className="btn btn-second btn-petit" onClick={retablir}>Rétablir</button> : null}
            </p>
          ) : (
            <span className="aide" aria-live="polite">
              {envoi ? "Enregistrement…" : modifie ? "Des changements ne sont pas enregistrés." : "Tout est enregistré."}
            </span>
          )}
          <span className="ac-pied-gestes">
            {modifie ? <button type="button" className="btn btn-fantome" onClick={annuler} disabled={envoi}>Annuler les changements</button> : null}
            <button className="btn btn-primaire" disabled={envoi || !modifie} aria-busy={envoi || undefined} aria-keyshortcuts={mac ? "Meta+S" : "Control+S"}>
              <Icone nom="coche" /> Enregistrer l&apos;accueil
              <kbd className="pg-kbd" aria-hidden="true">{mod}S</kbd>
            </button>
          </span>
        </div>
      ) : (
        <p className="aide ac-lecture">Seuls le propriétaire et l&apos;administrateur composent l&apos;accueil.</p>
      )}

      {ecrit && !parGabarit ? (
        <details className="av-pli ac-gabarit">
          <summary className="btn btn-fantome btn-petit">Revenir à l&apos;accueil du gabarit…</summary>
          <div className="av-pli-form">
            <p className="aide">
              Les sections d&apos;origine du gabarit {code === "technique" ? "technique" : "éditorial"} reviennent, sans vos textes ni vos photos d&apos;accueil.
              Le changement est gardé au journal.
            </p>
            <button type="button" className="btn btn-danger btn-petit" disabled={envoi} onClick={() => void envoyer("gabarit")}>Oui, revenir à l&apos;accueil du gabarit</button>
          </div>
        </details>
      ) : null}
    </form>
  );
}

/** La composition enregistrée (son empreinte), ou celle du gabarit. */
function sectionsDepuis(empreinteSauvee: string | null, code: CodeTheme, parGabarit: boolean): SectionBrute[] {
  const brutes = (empreinteSauvee && !parGabarit ? JSON.parse(empreinteSauvee) : definitionDe(code).sections) as SectionBrute[];
  return brutes.map((s, i) => ({ ...s, cle: `r${Date.now().toString(36)}${i}` }));
}

/** Le réglage d'une section en quelques mots (« Les nouveautés · Robes · 8 »). */
function resumeReglage(s: SectionBrute, a: AccueilGestion): string {
  const rayon = (slug?: string) => a.rayons.find((r) => r.slug === slug)?.nom ?? slug;
  switch (s.type) {
    case "selection":
      return [s.tri === "nouveautes" ? "Les nouveautés" : "Votre sélection", s.rayon ? `rayon ${rayon(s.rayon)}` : "tout le catalogue", `${s.nombre ?? 8} produits`].join(" · ");
    case "avis":
      return `${s.nombre ?? 6} avis au plus`;
    case "questions": {
      const page = a.pages.find((p) => p.slug === s.page) ?? a.pages.find((p) => p.publie);
      return page ? `${s.nombre ?? 5} questions de « ${page.titre} »` : "";
    }
    case "hero":
    case "editorial":
      return s.image ? "Avec sa photo" : "Sans photo";
    default:
      return "";
  }
}

function Reglages({
  s, accueil, code, destinations, ecrit, changer, texte, photoAction,
}: {
  s: SectionBrute;
  accueil: AccueilGestion;
  code: CodeTheme;
  destinations: { valeur: string; libelle: string }[];
  ecrit: boolean;
  changer: (cle: string, x: Partial<SectionBrute>) => void;
  texte: (cle: string, champ: string, valeur: string) => void;
  photoAction: string;
}) {
  const cle = s.cle ?? "";
  const id = (champ: string) => `ac-${cle}-${champ}`;
  const entree = BIBLIOTHEQUE[s.type];
  const lienActuel = s.lien ?? "";
  const lienConnu = !lienActuel || destinations.some((d) => d.valeur === lienActuel);

  return (
    <fieldset className="ac-champs" disabled={!ecrit}>
      <legend className="sr-only">Réglages de « {entree.nom} »</legend>
      {s.type === "engagements" ? (
        <p className="aide">
          Ses lignes viennent de vos réglages : paiement à la livraison, délais et frais, rappel avant expédition, refus possible{code === "technique" ? ", retrait en magasin et conseil" : ""}. Changez-les dans les Réglages de la boutique.
        </p>
      ) : null}

      {entree.textes.map((c) => {
        const valeur = s.textes?.[`${c.cle}_fr`] ?? "";
        const defaut = c.cle === "titre" ? titreParDefaut(s.type, code, s.tri) : "";
        const trop = valeur.length > LONGUEUR_TEXTE;
        return (
          <div key={c.cle} className="champ">
            <label htmlFor={id(c.cle)}>{c.libelle}</label>
            {c.long ? (
              <textarea id={id(c.cle)} rows={c.cle === "texte" || c.cle === "chapo" ? 3 : 2} value={valeur} placeholder={defaut}
                aria-invalid={trop || undefined} aria-describedby={c.aide ? `${id(c.cle)}-aide` : undefined}
                onChange={(e) => texte(cle, c.cle, e.currentTarget.value)} />
            ) : (
              <input id={id(c.cle)} type="text" value={valeur} placeholder={defaut} maxLength={LONGUEUR_TEXTE + 50}
                aria-invalid={trop || undefined} aria-describedby={c.aide ? `${id(c.cle)}-aide` : undefined}
                onChange={(e) => texte(cle, c.cle, e.currentTarget.value)} />
            )}
            {c.aide ? <p id={`${id(c.cle)}-aide`} className="aide">{c.aide}{defaut && c.cle === "titre" ? ` Vide : « ${defaut} ».` : ""}</p>
              : defaut ? <p className="aide">Vide : « {defaut} ».</p> : null}
          </div>
        );
      })}

      {s.type === "selection" ? (
        <>
          <fieldset className="champ">
            <legend>Quels produits</legend>
            <div className="choix choix-2">
              {([["selection", "Votre sélection", "Dans l'ordre du catalogue (les mis en avant d'abord)."], ["nouveautes", "Les nouveautés", "Les derniers publiés d'abord."]] as const).map(([v, b, aide]) => (
                <label key={v} className="choix-carte">
                  <input type="radio" name={id("tri")} value={v} checked={(s.tri ?? "selection") === v} onChange={() => changer(cle, { tri: v })} />
                  <span><b>{b}</b><span className="aide">{aide}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="ac-deux">
            <div className="champ">
              <label htmlFor={id("rayon")}>Rayon</label>
              <select id={id("rayon")} value={s.rayon ?? ""} onChange={(e) => changer(cle, { rayon: e.currentTarget.value || undefined })}>
                <option value="">Tout le catalogue</option>
                {accueil.rayons.map((r) => <option key={r.slug} value={r.slug}>{r.parent ? `— ${r.nom}` : r.nom}</option>)}
              </select>
            </div>
            <div className="champ">
              <label htmlFor={id("nombre")}>Nombre de produits</label>
              <select id={id("nombre")} value={s.nombre ?? 8} onChange={(e) => changer(cle, { nombre: Number(e.currentTarget.value) })}>
                {[4, 6, 8, 10, 12, 16, 20, 24].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </>
      ) : null}

      {s.type === "avis" ? (
        <div className="champ">
          <label htmlFor={id("nombre")}>Nombre d&apos;avis</label>
          <select id={id("nombre")} value={s.nombre ?? 6} onChange={(e) => changer(cle, { nombre: Number(e.currentTarget.value) })}>
            {[3, 4, 6, 8, 9, 12].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <p className="aide">Les plus récents, de 4 et 5 étoiles, avec un texte. La note affichée est celle de tous vos avis publiés.</p>
        </div>
      ) : null}

      {s.type === "questions" ? (
        <div className="ac-deux">
          <div className="champ">
            <label htmlFor={id("page")}>Page de questions</label>
            <select id={id("page")} value={s.page ?? ""} onChange={(e) => changer(cle, { page: e.currentTarget.value || undefined })}>
              <option value="">La première publiée</option>
              {accueil.pages.map((p) => <option key={p.slug} value={p.slug}>{p.titre}{p.publie ? "" : " (brouillon)"}</option>)}
            </select>
          </div>
          <div className="champ">
            <label htmlFor={id("nombre")}>Nombre de questions</label>
            <select id={id("nombre")} value={s.nombre ?? 5} onChange={(e) => changer(cle, { nombre: Number(e.currentTarget.value) })}>
              {[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      ) : null}

      {s.type === "hero" || s.type === "editorial" ? (
        <div className="champ">
          <label htmlFor={id("lien")}>{s.type === "hero" ? "Le bouton mène à" : "Le lien mène à"}</label>
          <select id={id("lien")} value={lienActuel} onChange={(e) => changer(cle, { lien: e.currentTarget.value || undefined })}>
            {s.type === "editorial" ? <option value="">Pas de lien</option> : <option value="">Tout le catalogue</option>}
            {!lienConnu ? <option value={lienActuel}>{lienActuel}</option> : null}
            {destinations.filter((d) => !(s.type === "hero" && d.valeur === "/catalogue")).map((d) => <option key={d.valeur} value={d.valeur}>{d.libelle}</option>)}
          </select>
        </div>
      ) : null}

      {s.type === "hero" || s.type === "editorial" ? (
        <Photos s={s} action={photoAction} ecrit={ecrit} changer={changer} texte={texte} id={id} />
      ) : null}
    </fieldset>
  );
}

/** Le dessin de la section, en blocs : on la reconnaît d'un coup d'œil. */
function Miniature({ type, photo = null }: { type: TypeSection; photo?: string | null }) {
  const n = { hero: 3, rayons: 3, selection: 4, editorial: 4, engagements: 4, texte: 3, avis: 3, questions: 4, marques: 6 }[type];
  // Sa photo, s'il en a une : en fond de l'ouverture, à la place de l'image du récit.
  const fond = photo ? { backgroundImage: `url("${photo}")` } : undefined;
  return (
    <span className="ac-mini" data-type={type} data-photo={photo ? "" : undefined} aria-hidden="true" style={type === "hero" ? fond : undefined}>
      {Array.from({ length: n }, (_, i) => <i key={i} style={type === "editorial" && i === 0 ? fond : undefined} />)}
    </span>
  );
}

/** La photo d'une section (l'ouverture, le récit) : la choisir — réduite
 *  dans le navigateur, déposée par le serveur —, la changer, la retirer ;
 *  pour l'ouverture, son cadrage pour téléphone et le côté du texte ; sa
 *  description, pour qui ne la voit pas. Rien n'est publié avant
 *  « Enregistrer l'accueil ». */
function Photos({
  s, action, ecrit, changer, texte, id,
}: {
  s: SectionBrute;
  action: string;
  ecrit: boolean;
  changer: (cle: string, x: Partial<SectionBrute>) => void;
  texte: (cle: string, champ: string, valeur: string) => void;
  id: (champ: string) => string;
}) {
  const cle = s.cle ?? "";
  const ouverture = s.type === "hero";
  const principal: EmplacementAccueil = ouverture ? "ouverture" : "recit";
  const [etat, setEtat] = useState<{ e: EmplacementAccueil; texte: string; erreur?: boolean; enCours?: boolean } | null>(null);

  async function choisir(e: EmplacementAccueil, fichier: File | undefined) {
    if (!fichier) return;
    setEtat({ e, texte: "Préparation de la photo…", enCours: true });
    const p = await preparerPhoto(fichier, e);
    if ("erreur" in p) { setEtat({ e, texte: p.erreur, erreur: true }); return; }
    setEtat({ e, texte: "Envoi de la photo…", enCours: true });
    try {
      const d = new FormData();
      d.set("emplacement", e);
      d.set("fichier", p.blob, p.nom);
      const r = await fetch(action, { method: "POST", body: d, headers: { accept: "application/json" }, credentials: "same-origin" });
      const rep = (await r.json().catch(() => null)) as { ok: true; chemin: string } | { ok: false; message: string } | null;
      if (!rep) throw new Error("réponse illisible");
      if (!rep.ok) { setEtat({ e, texte: rep.message, erreur: true }); return; }
      // Une nouvelle photo est un autre sujet : ni son ancien cadrage ni son
      // ancienne description ne la suivent.
      if (e === "ouverture_portrait" && s.image) changer(cle, { image: { ...s.image, chemin_portrait: rep.chemin } });
      else {
        changer(cle, { image: { chemin: rep.chemin } });
        if (s.textes?.image_alt_fr) texte(cle, "image_alt", "");
      }
      setEtat({ e, texte: e === "ouverture_portrait" ? "Cadrage posé : enregistrez l'accueil pour le publier." : "Photo posée : enregistrez l'accueil pour la publier." });
    } catch {
      setEtat({ e, texte: "L'envoi n'a pas abouti (réseau coupé ?) : réessayez.", erreur: true });
    }
  }

  const fichier = (e: EmplacementAccueil, libelle: string) => (
    <label className="btn btn-second btn-petit ac-fichier" data-occupe={etat?.enCours ? "" : undefined}>
      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!ecrit || etat?.enCours}
        aria-describedby={etat?.e === e ? id(`etat-${e}`) : undefined}
        onChange={(ev) => { const f = ev.currentTarget.files?.[0]; ev.currentTarget.value = ""; void choisir(e, f); }} />
      <Icone nom="photo" /> {libelle}
    </label>
  );
  const etatDe = (e: EmplacementAccueil) => etat?.e === e ? (
    <p id={id(`etat-${e}`)} className={etat.erreur ? "ac-photo-etat ac-photo-erreur" : "ac-photo-etat"} role={etat.erreur ? "alert" : "status"}>
      {etat.enCours ? <span className="ac-roue" aria-hidden="true" /> : null}{etat.texte}
    </p>
  ) : null;

  return (
    <div className="ac-photo" data-vide={s.image ? undefined : ""}>
      {s.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlFichier(s.image.chemin)} alt="" loading="lazy" />
      ) : (
        <span className="ac-photo-vide" aria-hidden="true"><Icone nom="photo" taille={22} /></span>
      )}
      <div className="ac-photo-corps">
        <b>{REGLES[principal].titre}</b>
        <p className="aide">
          {REGLES[principal].conseil}
          {s.image ? ` Retirée, la section garde ses textes${ouverture ? " sur un aplat" : ""}.` : ` Sans photo, la section montre ses textes${ouverture ? " sur un aplat" : ""}.`}
        </p>
        <span className="ac-photo-gestes">
          {fichier(principal, s.image ? "Changer la photo" : "Choisir une photo")}
          {s.image ? (
            <button type="button" className="btn btn-fantome btn-petit" onClick={() => { changer(cle, { image: undefined, alignement: undefined }); setEtat(null); }}>
              <Icone nom="croix" /> Retirer la photo
            </button>
          ) : null}
        </span>
        {etatDe(principal)}

        {s.image ? (
          <div className="champ ac-photo-alt">
            <label htmlFor={id("image_alt")}>Description de la photo</label>
            <input id={id("image_alt")} type="text" value={s.textes?.image_alt_fr ?? ""} maxLength={LONGUEUR_TEXTE}
              placeholder="Femme en robe de lin sous une arcade blanche" aria-describedby={`${id("image_alt")}-aide`}
              onChange={(ev) => texte(cle, "image_alt", ev.currentTarget.value)} />
            <p id={`${id("image_alt")}-aide`} className="aide">Ce qu&apos;elle montre, pour qui ne la voit pas (lecteurs d&apos;écran, moteurs de recherche).</p>
          </div>
        ) : null}

        {ouverture && s.image && !s.image.detouree ? (
          <>
            <div className="ac-portrait">
              {s.image.chemin_portrait ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urlFichier(s.image.chemin_portrait)} alt="" loading="lazy" />
              ) : <span className="ac-portrait-vide" aria-hidden="true" />}
              <div className="ac-photo-corps">
                <b>{REGLES.ouverture_portrait.titre}</b>
                <p className="aide">{s.image.chemin_portrait ? "Le téléphone montre ce cadrage en hauteur." : "Sans lui, le téléphone recadre la photo en son centre."} {REGLES.ouverture_portrait.conseil}</p>
                <span className="ac-photo-gestes">
                  {fichier("ouverture_portrait", s.image.chemin_portrait ? "Changer le cadrage" : "Choisir un cadrage")}
                  {s.image.chemin_portrait ? (
                    <button type="button" className="btn btn-fantome btn-petit" onClick={() => { const { chemin_portrait: _retire, ...reste } = s.image!; void _retire; changer(cle, { image: reste }); setEtat(null); }}>
                      <Icone nom="croix" /> Retirer le cadrage
                    </button>
                  ) : null}
                </span>
                {etatDe("ouverture_portrait")}
              </div>
            </div>
            <fieldset className="ac-alignement">
              <legend>Le texte sur la photo</legend>
              {([["debut", "À gauche"], ["fin", "À droite"]] as const).map(([v, l]) => (
                <label key={v}>
                  <input type="radio" name={id("alignement")} value={v} checked={(s.alignement ?? "debut") === v} onChange={() => changer(cle, { alignement: v === "fin" ? "fin" : undefined })} />
                  {l}
                </label>
              ))}
            </fieldset>
          </>
        ) : null}
      </div>
    </div>
  );
}
