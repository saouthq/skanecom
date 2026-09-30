"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Icone, type NomIcone } from "@/components/console/Icone";
import { BlocsRendus, blocs, questions } from "@/lib/texte-riche";
import { LIMITES, problemesPage, slugDe, type ChampPage } from "@/lib/pages-forme";

/* ============================================================================
   L'ÉDITEUR D'UNE PAGE DE LA BOUTIQUE — à gauche on écrit, à droite on voit
   la page telle que la boutique la montrera (sur téléphone : deux onglets).

   · la mise en forme en peu de signes (## intertitre, **gras**, - liste,
     [lien](adresse)), posée par la barre d'outils ou au clavier (⌘B, ⌘I,
     ⌘K) — personne n'a à la retenir ;
   · l'adresse suit le titre tant qu'on ne l'a pas touchée ;
   · l'envoi part en arrière-plan (⌘S) : un refus s'affiche sous le champ en
     cause, le texte reste à l'écran. Quitter la page avec des changements
     non enregistrés demande confirmation, et un brouillon reste sur
     l'appareil (une coupure, un onglet fermé) jusqu'à l'enregistrement.
   ========================================================================== */

export type PageEditee = {
  id: string | null;
  version: number | null;
  titre: string;
  slug: string;
  genre: "texte" | "questions";
  corps: string;
  publie: boolean;
  dans_pied: boolean;
};

type Contenu = Pick<PageEditee, "titre" | "slug" | "genre" | "corps" | "publie" | "dans_pied">;
type Retour = { ok: boolean; texte: string } | null;
type Brouillon = Contenu & { version: number | null; le: number };
type Outil = "intertitre" | "question" | "gras" | "italique" | "liste" | "lien";

const contenuDe = (p: PageEditee): Contenu => ({ titre: p.titre, slug: p.slug, genre: p.genre, corps: p.corps, publie: p.publie, dans_pied: p.dans_pied });
const memes = (a: Contenu, b: Contenu) =>
  a.titre === b.titre && a.slug === b.slug && a.genre === b.genre && a.corps === b.corps && a.publie === b.publie && a.dans_pied === b.dans_pied;

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });
const rien = () => () => {};
const surMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

/* Le brouillon laissé sur l'appareil, lu UNE fois par ouverture de l'éditeur
   (celui qu'on écrit ensuite en tapant ne doit pas se proposer lui-même). */
const brouillonsLus = new Map<string, string | null>();
function brouillonDOrigine(cle: string): string | null {
  if (!brouillonsLus.has(cle)) {
    let v: string | null = null;
    try { v = localStorage.getItem(cle); } catch { /* stockage indisponible */ }
    brouillonsLus.set(cle, v);
  }
  return brouillonsLus.get(cle) ?? null;
}

const OUTILS: { cle: Outil; libelle: (mod: string) => string; seul?: "texte" | "questions" }[] = [
  { cle: "intertitre", libelle: () => "Intertitre (## en début de ligne)", seul: "texte" },
  { cle: "question", libelle: () => "Ajouter une question", seul: "questions" },
  { cle: "gras", libelle: (m) => `Gras (${m}B)` },
  { cle: "italique", libelle: (m) => `Italique (${m}I)` },
  { cle: "liste", libelle: () => "Liste à puces" },
  { cle: "lien", libelle: (m) => `Lien (${m}K)` },
];

export function EditeurPage({
  boutique,
  base,
  action,
  vitrine,
  affichee,
  ecrit,
  page,
  message,
}: {
  boutique: string;
  base: string;
  action: string;
  /** L'adresse de la vitrine (voir la page publiée), ou null. */
  vitrine: string | null;
  /** Le domaine montré devant l'adresse de la page (« maison-selma.tn »). */
  affichee: string | null;
  ecrit: boolean;
  page: PageEditee;
  message: Retour;
}) {
  const router = useRouter();
  const [id, setId] = useState(page.id);
  const [version, setVersion] = useState(page.version);
  const [c, setC] = useState<Contenu>(() => contenuDe(page));
  const [sauve, setSauve] = useState<Contenu>(() => contenuDe(page));
  const [slugLibre, setSlugLibre] = useState(!page.id && (!page.slug || page.slug === slugDe(page.titre)));
  const [tente, setTente] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [retour, setRetour] = useState<Retour>(message);
  const [refus, setRefus] = useState<{ champ: ChampPage; texte: string } | null>(null);
  const [vue, setVue] = useState<"ecrire" | "apercu">("ecrire");
  const [repriseVue, setRepriseVue] = useState(false);
  // « ⌘ » sur Mac, « Ctrl+ » ailleurs ; lu dans le navigateur seulement.
  const mac = useSyncExternalStore(rien, surMac, () => false);
  const refTitre = useRef<HTMLInputElement>(null);
  const refSlug = useRef<HTMLInputElement>(null);
  const zone = useRef<HTMLTextAreaElement>(null);
  const cleBrouillon = `skanecom.page.${boutique}.${page.id ?? "nouvelle"}`;

  // Une version plus récente que la nôtre arrive du serveur (enregistrée
  // ailleurs) : sans changement en cours, l'éditeur repart d'elle ; sinon il
  // prévient, et l'envoi sera refusé plutôt que d'écraser.
  const [versionServeur, setVersionServeur] = useState(page.version);
  if (page.version !== versionServeur) {
    setVersionServeur(page.version);
    if (page.version !== null && version !== null && page.version > version) {
      if (memes(c, sauve)) {
        setC(contenuDe(page));
        setSauve(contenuDe(page));
        setVersion(page.version);
      } else {
        setRetour({ ok: false, texte: "Quelqu'un d'autre vient d'enregistrer cette page : copiez votre texte, puis rechargez-la." });
      }
    }
  }

  const modifie = !memes(c, sauve);
  const problemes = useMemo(() => problemesPage(c), [c]);
  const erreur = (champ: ChampPage) => (refus?.champ === champ ? refus.texte : tente ? problemes[champ] : undefined);
  const apercu = useDeferredValue(c);
  const poser = (x: Partial<Contenu>) => { setC((v) => ({ ...v, ...x })); setRetour(null); };
  const viser = (k: ChampPage) => (k === "titre" ? refTitre : k === "slug" ? refSlug : zone).current?.focus();

  /* --- Le brouillon de l'appareil : proposé au retour s'il part de la version
     affichée, effacé à l'enregistrement. */
  const brut = useSyncExternalStore(rien, () => brouillonDOrigine(cleBrouillon), () => null);
  useEffect(() => () => { brouillonsLus.delete(cleBrouillon); }, [cleBrouillon]);
  const reprise = useMemo<Brouillon | null>(() => {
    if (!brut || repriseVue || !ecrit) return null;
    try {
      const b = JSON.parse(brut) as Brouillon;
      return b.version === page.version && !memes(b, contenuDe(page)) ? b : null;
    } catch {
      return null;
    }
  }, [brut, repriseVue, ecrit, page]);

  useEffect(() => {
    if (!modifie || !ecrit) return;
    const t = window.setTimeout(() => {
      try { localStorage.setItem(cleBrouillon, JSON.stringify({ ...c, version, le: Date.now() } satisfies Brouillon)); } catch { /* plein ou interdit */ }
    }, 700);
    return () => window.clearTimeout(t);
  }, [c, modifie, ecrit, cleBrouillon, version]);

  /* --- Partir avec des changements non enregistrés : on demande. */
  useEffect(() => {
    if (!modifie) return;
    const avant = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const clic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.closest(".pg-apercu")) return;
      if (new URL(a.href, location.href).origin !== location.origin) return;
      if (!window.confirm("Vos changements ne sont pas enregistrés. Quitter quand même cette page ?")) {
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
  const enregistrer = useCallback(async () => {
    if (!ecrit || envoi) return;
    setTente(true);
    setRefus(null);
    const premier = (["titre", "slug", "corps"] as const).find((k) => problemes[k]);
    if (premier) {
      setVue("ecrire");
      viser(premier);
      setRetour({ ok: false, texte: "Un champ est à revoir (signalé en rouge) : rien n'est perdu." });
      return;
    }
    setEnvoi(true);
    const d = new FormData();
    d.set("geste", "enregistrer");
    if (id) { d.set("id", id); d.set("version", String(version ?? "")); }
    d.set("titre", c.titre); d.set("slug", c.slug); d.set("genre", c.genre); d.set("corps", c.corps);
    if (c.publie) d.set("publie", "1");
    if (c.dans_pied) d.set("dans_pied", "1");
    const envoye = c;
    try {
      const r = await fetch(action, { method: "POST", body: d, headers: { accept: "application/json" }, credentials: "same-origin" });
      const rep = (await r.json().catch(() => null)) as
        | { ok: true; message: string; id: string; version: number; slug: string }
        | { ok: false; message: string; champ: string | null }
        | null;
      if (!rep) throw new Error("réponse illisible");
      if (!rep.ok) {
        setRetour({ ok: false, texte: rep.message });
        if (rep.champ === "titre" || rep.champ === "slug" || rep.champ === "corps") {
          setRefus({ champ: rep.champ, texte: rep.message });
          setVue("ecrire");
          viser(rep.champ);
        }
        return;
      }
      try { localStorage.removeItem(cleBrouillon); } catch { /* rien à effacer */ }
      setSauve(envoye);
      setVersion(rep.version);
      setVersionServeur(rep.version);
      setRetour({ ok: true, texte: rep.message });
      if (!id) {
        setId(rep.id);
        // La page existe : son adresse au backoffice est désormais la sienne.
        router.replace(`${base}/${rep.id}?${new URLSearchParams({ ok: rep.message })}`);
      } else {
        router.refresh();
      }
    } catch {
      setRetour({ ok: false, texte: "L'envoi n'a pas abouti (réseau coupé ?). Votre texte est toujours là : réessayez." });
    } finally {
      setEnvoi(false);
    }
  }, [ecrit, envoi, problemes, id, version, c, action, base, cleBrouillon, router]);

  // ⌘S / Ctrl+S, où que soit le focus.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void enregistrer();
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [enregistrer]);

  /* --- La mise en forme : autour de la sélection, ou en début de ligne. */
  function remplacer(debut: number, fin: number, texte: string, selDebut: number, selFin: number) {
    const t = zone.current;
    if (!t) return;
    poser({ corps: c.corps.slice(0, debut) + texte + c.corps.slice(fin) });
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(selDebut, selFin);
    });
  }

  function entourer(t: HTMLTextAreaElement, marque: string, defaut: string) {
    const { selectionStart: a, selectionEnd: b } = t;
    const choisi = c.corps.slice(a, b);
    // Déjà entouré : on retire la marque.
    if (choisi && c.corps.slice(a - marque.length, a) === marque && c.corps.slice(b, b + marque.length) === marque) {
      remplacer(a - marque.length, b + marque.length, choisi, a - marque.length, b - marque.length);
      return;
    }
    const texte = choisi || defaut;
    remplacer(a, b, `${marque}${texte}${marque}`, a + marque.length, a + marque.length + texte.length);
  }

  function debutDeLigne(t: HTMLTextAreaElement, prefixe: string) {
    const { selectionStart: a, selectionEnd: b } = t;
    const debut = c.corps.lastIndexOf("\n", a - 1) + 1;
    const finLigne = c.corps.indexOf("\n", b);
    const fin = finLigne === -1 ? c.corps.length : finLigne;
    const lignes = c.corps.slice(debut, fin).split("\n");
    const tous = lignes.every((l) => l.startsWith(prefixe));
    const texte = lignes
      .map((l) => (tous ? l.slice(prefixe.length) : `${prefixe}${l.replace(/^(#{2,3}\s+|[-•*]\s+|\d{1,2}[.)]\s+)/, "")}`))
      .join("\n");
    remplacer(debut, fin, texte, debut, debut + texte.length);
  }

  function appliquer(outil: Outil) {
    const t = zone.current;
    if (!t) return;
    switch (outil) {
      case "gras": return entourer(t, "**", "texte en gras");
      case "italique": return entourer(t, "*", "texte en italique");
      case "intertitre": return debutDeLigne(t, "## ");
      case "liste": return debutDeLigne(t, "- ");
      case "lien": {
        const { selectionStart: a, selectionEnd: b } = t;
        const texte = c.corps.slice(a, b) || "le texte du lien";
        // L'adresse est sélectionnée : il n'y a plus qu'à la taper (ou « /catalogue »).
        return remplacer(a, b, `[${texte}](https://)`, a + texte.length + 3, a + texte.length + 11);
      }
      case "question": {
        const a = t.selectionEnd;
        const avant = c.corps.slice(0, a).replace(/\s+$/, "");
        const q = "Votre question ?";
        const saut = avant ? "\n\n" : "";
        const debutQ = avant.length + saut.length + 4;
        return remplacer(avant.length, a, `${saut}### ${q}\nLa réponse, en quelques phrases.`, debutQ, debutQ + q.length);
      }
    }
  }

  function raccourcis(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const outil = ({ b: "gras", i: "italique", k: "lien" } as const)[e.key.toLowerCase() as "b" | "i" | "k"];
    if (outil) { e.preventDefault(); appliquer(outil); }
  }

  const mod = mac ? "⌘" : "Ctrl+";
  const signes = c.corps.length;

  return (
    <div className="pg-editeur" data-vue={vue}>
      {reprise ? (
        <div className="message pg-reprise" role="status">
          <span>
            {id ? "Des changements à cette page" : "Une page commencée ici"}, non enregistrés, sont restés sur cet appareil (à {HEURE.format(new Date(reprise.le))}).
          </span>
          <span className="pg-reprise-gestes">
            <button type="button" className="btn btn-second btn-petit" onClick={() => {
              poser({ titre: reprise.titre, slug: reprise.slug, genre: reprise.genre, corps: reprise.corps, publie: reprise.publie, dans_pied: reprise.dans_pied });
              setSlugLibre(false);
              setRepriseVue(true);
            }}>Reprendre</button>
            <button type="button" className="btn btn-fantome btn-petit" onClick={() => {
              try { localStorage.removeItem(cleBrouillon); } catch { /* rien */ }
              setRepriseVue(true);
            }}>Les écarter</button>
          </span>
        </div>
      ) : null}

      <div className="pg-bascule segments" role="group" aria-label="Affichage">
        <button type="button" aria-pressed={vue === "ecrire"} onClick={() => setVue("ecrire")}><Icone nom="crayon" taille={14} /> Écrire</button>
        <button type="button" aria-pressed={vue === "apercu"} onClick={() => setVue("apercu")}><Icone nom="oeil" taille={14} /> Aperçu</button>
      </div>

      <form
        className="carte pg-formulaire formulaire"
        action={action}
        method="post"
        noValidate
        onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}
      >
        <input type="hidden" name="geste" value="enregistrer" />
        {id ? <input type="hidden" name="id" value={id} /> : null}
        {id ? <input type="hidden" name="version" value={version ?? ""} /> : null}
        <fieldset className="pg-champs" disabled={!ecrit}>
          <div className="champ">
            <label htmlFor="pg-titre">Titre</label>
            <input
              ref={refTitre}
              id="pg-titre"
              name="titre"
              value={c.titre}
              maxLength={LIMITES.titre.max + 20}
              placeholder="À propos, Questions fréquentes, Guide des tailles…"
              aria-invalid={erreur("titre") ? true : undefined}
              aria-describedby={erreur("titre") ? "err-titre" : undefined}
              onChange={(e) => {
                const titre = e.currentTarget.value;
                poser(slugLibre ? { titre, slug: slugDe(titre) } : { titre });
                if (refus?.champ === "titre") setRefus(null);
              }}
            />
            {erreur("titre") ? <p id="err-titre" className="pg-erreur">{erreur("titre")}</p> : null}
          </div>

          <div className="champ">
            <label htmlFor="pg-slug">Adresse de la page</label>
            <div className="pg-adresse-champ">
              <span className="pg-adresse-prefixe" aria-hidden="true">{affichee ? `${affichee}/` : "/"}</span>
              <input
                ref={refSlug}
                id="pg-slug"
                name="slug"
                value={c.slug}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                maxLength={LIMITES.slug.max}
                aria-invalid={erreur("slug") ? true : undefined}
                aria-describedby={erreur("slug") ? "err-slug" : "aide-slug"}
                onChange={(e) => {
                  setSlugLibre(false);
                  poser({ slug: e.currentTarget.value.toLowerCase().replace(/\s+/g, "-") });
                  if (refus?.champ === "slug") setRefus(null);
                }}
              />
            </div>
            {erreur("slug")
              ? <p id="err-slug" className="pg-erreur">{erreur("slug")}</p>
              : <p id="aide-slug" className="aide">{id && sauve.publie ? "Changer l'adresse d'une page publiée casse les liens déjà partagés." : "Elle suit le titre tant que vous ne la changez pas."}</p>}
          </div>

          <fieldset className="champ pg-genre">
            <legend>Forme</legend>
            <div className="choix choix-2">
              <label className="choix-carte">
                <input type="radio" name="genre" value="texte" checked={c.genre === "texte"} onChange={() => poser({ genre: "texte" })} />
                <span><b>Un texte</b><span className="aide">Des paragraphes, des intertitres : votre histoire, votre livraison.</span></span>
              </label>
              <label className="choix-carte">
                <input type="radio" name="genre" value="questions" checked={c.genre === "questions"} onChange={() => poser({ genre: "questions" })} />
                <span><b>Des questions-réponses</b><span className="aide">Chaque intertitre est une question ; le client ouvre celle qui l&apos;intéresse.</span></span>
              </label>
            </div>
          </fieldset>

          <div className="champ pg-corps">
            <div className="pg-corps-tete">
              <label htmlFor="pg-corps">Texte</label>
              <div className="pg-outils" role="toolbar" aria-label="Mise en forme" aria-controls="pg-corps">
                {OUTILS.filter((o) => !o.seul || o.seul === c.genre).map((o) => (
                  <button key={o.cle} type="button" className="btn-icone" aria-label={o.libelle(mod)} title={o.libelle(mod)}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => appliquer(o.cle)}>
                    <Icone nom={o.cle as NomIcone} taille={16} />
                  </button>
                ))}
              </div>
            </div>
            <textarea
              ref={zone}
              id="pg-corps"
              name="corps"
              value={c.corps}
              rows={18}
              aria-invalid={erreur("corps") ? true : undefined}
              aria-describedby={erreur("corps") ? "err-corps pg-signes" : "pg-signes"}
              placeholder={c.genre === "questions"
                ? "### Comment payer ?\nÀ la livraison, en espèces.\n\n### Quels sont les délais ?\n2 à 4 jours ouvrés, partout en Tunisie."
                : "Une maison de Tunis, depuis 1998.\n\n## Nos matières\nDu lin et du coton, tissés à Ksar Hellal."}
              onKeyDown={raccourcis}
              onChange={(e) => poser({ corps: e.currentTarget.value })}
            />
            <div className="pg-corps-pied">
              {erreur("corps") ? <p id="err-corps" className="pg-erreur">{erreur("corps")}</p> : <span />}
              <span id="pg-signes" className="pg-signes" data-alerte={signes > LIMITES.corps * 0.9 ? "" : undefined}>
                {signes.toLocaleString("fr-FR")} / {LIMITES.corps.toLocaleString("fr-FR")} signes
              </span>
            </div>
            <details className="pg-aide">
              <summary>Mise en forme : ce que chaque signe donne</summary>
              <dl>
                <div><dt><code>## Livraison</code></dt><dd>un intertitre{c.genre === "questions" ? " (une question)" : ""}</dd></div>
                <div><dt><code>### Comment payer ?</code></dt><dd>{c.genre === "questions" ? "une question, sa réponse en dessous" : "un sous-titre"}</dd></div>
                <div><dt><code>**important**</code></dt><dd><b>important</b></dd></div>
                <div><dt><code>*en italique*</code></dt><dd><i>en italique</i></dd></div>
                <div><dt><code>- un point</code></dt><dd>une liste à puces (<code>1.</code> : numérotée)</dd></div>
                <div><dt><code>[le catalogue](/catalogue)</code></dt><dd>un lien vers une page de la boutique, ou une adresse https://, mailto:, tel:</dd></div>
                <div><dt>une ligne vide</dt><dd>un nouveau paragraphe</dd></div>
              </dl>
            </details>
          </div>

          <div className="choix pg-options">
            <label className="choix-carte">
              <input type="checkbox" name="publie" value="1" checked={c.publie} onChange={(e) => poser({ publie: e.currentTarget.checked })} />
              <span>
                <b>Publiée</b>
                <span className="aide">{c.publie ? `Visible sur la boutique à /${c.slug || "…"}.` : "Un brouillon : la boutique ne le montre à personne."}</span>
              </span>
            </label>
            <label className="choix-carte">
              <input type="checkbox" name="dans_pied" value="1" checked={c.dans_pied} onChange={(e) => poser({ dans_pied: e.currentTarget.checked })} />
              <span>
                <b>Un lien au pied de page</b>
                <span className="aide">Dans la colonne « La boutique », sur toutes les pages.</span>
              </span>
            </label>
          </div>
        </fieldset>

        {ecrit ? (
          <div className="carte-pied pg-pied">
            <span className="aide" aria-live="polite">
              {envoi ? "Enregistrement…" : modifie ? "Des changements ne sont pas enregistrés." : id ? "Tout est enregistré." : "Pas encore enregistrée."}
            </span>
            <span className="pg-pied-gestes">
              {id && sauve.publie && vitrine ? (
                <a className="btn btn-second" href={`${vitrine}/${sauve.slug}`} target="_blank" rel="noopener">
                  <Icone nom="externe" /> Voir sur la boutique
                </a>
              ) : null}
              <button className="btn btn-primaire" disabled={envoi} aria-busy={envoi || undefined} aria-keyshortcuts={mac ? "Meta+S" : "Control+S"}>
                <Icone nom="coche" /> {c.publie && !sauve.publie ? "Enregistrer et publier" : "Enregistrer"}
                <kbd className="pg-kbd" aria-hidden="true">{mod}S</kbd>
              </button>
            </span>
          </div>
        ) : null}
        {retour ? (
          <p className={retour.ok ? "message message-succes pg-retour" : "message message-erreur pg-retour"} role={retour.ok ? "status" : "alert"}>
            {retour.texte}
          </p>
        ) : null}
      </form>

      <aside className="carte pg-apercu" aria-label="Aperçu de la page"
        onClickCapture={(e) => { if ((e.target as HTMLElement).closest("a")) e.preventDefault(); }}>
        <div className="pg-apercu-tete">
          <span className="ui-etat"><Icone nom="oeil" taille={12} /> Aperçu</span>
          <span className="aide">Aux couleurs et aux polices de la boutique près</span>
        </div>
        <article className="pg-apercu-page" data-genre={apercu.genre}>
          <p className="pg-apercu-chemin">{affichee ?? ""}/{apercu.slug || "…"}</p>
          <h1>{apercu.titre.trim() || <span className="discret">Le titre de la page</span>}</h1>
          <Apercu corps={apercu.corps} genre={apercu.genre} />
        </article>
      </aside>
    </div>
  );
}

function Apercu({ corps, genre }: { corps: string; genre: "texte" | "questions" }) {
  if (!corps.trim()) return <p className="discret">Le texte paraîtra ici, mis en forme, à mesure que vous l&apos;écrivez.</p>;
  if (genre === "texte") return <div className="pg-apercu-texte"><BlocsRendus blocs={blocs(corps)} cle="a" /></div>;
  const { intro, questions: liste } = questions(corps);
  return (
    <div className="pg-apercu-texte">
      {intro.length ? <BlocsRendus blocs={intro} cle="i" /> : null}
      {liste.length ? (
        <div className="pg-apercu-questions">
          {liste.map((q, i) => (
            <details key={i} open={i === 0}>
              <summary>{q.question}</summary>
              <div><BlocsRendus blocs={q.reponse} cle={`q${i}`} /></div>
            </details>
          ))}
        </div>
      ) : (
        <p className="pg-apercu-note">Aucune question encore : chaque intertitre (« ### Comment payer ? ») en devient une.</p>
      )}
    </div>
  );
}
