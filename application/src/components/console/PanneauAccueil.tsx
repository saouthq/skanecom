"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icone } from "@/components/console/Icone";
import {
  entreeDe, LONGUEUR_TEXTE, MAX_DIAPOS, MAX_POINTS, MAX_SECTIONS, TYPES,
  nouvelleSection, problemesAccueil, sectionMasquee, titreParDefaut,
  type AccueilGestion, type DiapoBrute, type EmplacementAccueil, type PieceCatalogue, type SectionBrute,
} from "@/lib/gestion/accueil";
import { REGLES } from "@/lib/console/images-marque";
import { preparerPhoto } from "@/lib/console/photo-navigateur";
import { gabaritDe, type Structure, type TypeSection } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";

/* ============================================================================
   L'ACCUEIL, DANS L'ÉDITEUR DE LA VITRINE — l'accueil de haut en bas :
   chaque section, sa miniature, ce qu'elle dit, si la vitrine la montrera ;
   on la monte, la descend, l'ouvre pour la régler, la retire (et on la
   rétablit). Sous la liste, la bibliothèque : une section s'ajoute en un
   geste, en bas de l'accueil, ouverte et prête à régler.

   Rien n'est gardé ici : chaque geste remonte à l'éditeur (`modifier`), qui
   l'inscrit dans le brouillon avec le style — l'aperçu suit, « Publier » met
   le tout en ligne, ⌘Z défait. La section ouverte est celle de l'éditeur :
   un clic sur la vitrine de l'aperçu l'ouvre aussi. Au clavier : chaque
   geste garde le focus sur la section qu'il a déplacée, et l'annonce.
   ========================================================================== */

export type InfosAccueil = Omit<AccueilGestion, "code" | "theme" | "version" | "sections" | "modifie_le" | "modifie_par">;

type Retour = { texte: string; retablir?: { section: SectionBrute; position: number } } | null;

const ordinal = (n: number) => (n === 1 ? "1re" : `${n}e`);

export function PanneauAccueil({
  sections, parStructure, structure, nomStructure, infos, ecrit, photoAction, ouverte, ouvrir, modifier, montrer,
}: {
  /** L'accueil effectif : celui du brouillon, ou celui de la structure. */
  sections: SectionBrute[];
  /** L'accueil est celui de la structure (aucune composition propre). */
  parStructure: boolean;
  structure: Structure;
  nomStructure: string;
  infos: InfosAccueil;
  ecrit: boolean;
  /** Où téléverser une photo de section (…/accueil/photo). */
  photoAction: string;
  ouverte: string | null;
  ouvrir: (cle: string | null) => void;
  /** Un geste : la nouvelle composition (null : celle de la structure). `cle`
   *  regroupe les gestes continus (la frappe dans un même champ). */
  modifier: (sections: SectionBrute[] | null, cle: string, dit?: string) => void;
  /** Montrer une section dans l'aperçu (par sa clé), ou plus aucune ;
   *  `defiler` : l'aperçu la fait venir sous les yeux. */
  montrer: (cle: string | null, defiler?: boolean) => void;
}) {
  const [retour, setRetour] = useState<Retour>(null);
  const [annonce, setAnnonce] = useState("");
  const [bibliotheque, setBibliotheque] = useState(false);
  const code = gabaritDe(structure);
  const accueil = useMemo(() => ({ ...infos, code }), [infos, code]);

  const problemes = useMemo(() => problemesAccueil(sections), [sections]);
  const presents = new Set(sections.map((s) => s.type));
  const masquees = sections.filter((s) => sectionMasquee(s, accueil, structure)).length;

  /* --- Le focus suit la section déplacée : après le rendu, on vise le
     bouton (ou le champ) demandé. */
  const viser = useRef<string[] | null>(null);
  useEffect(() => {
    if (!viser.current) return;
    const el = viser.current.map((q) => document.querySelector<HTMLElement>(q)).find(Boolean);
    viser.current = null;
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  });

  // Un message de réussite s'efface ; « Rétablir » reste le temps de le lire.
  useEffect(() => {
    if (!retour) return;
    const minuterie = window.setTimeout(() => setRetour(null), 9000);
    return () => window.clearTimeout(minuterie);
  }, [retour]);

  const nom = (s: SectionBrute) => entreeDe(s.type, structure).nom;
  const changer = (cle: string, x: Partial<SectionBrute>, champ = "reglage") =>
    modifier(sections.map((s) => (s.cle === cle ? { ...s, ...x } : s)), `accueil.${cle}.${champ}`);
  const texte = (cle: string, champ: string, valeur: string) =>
    modifier(sections.map((s) => (s.cle === cle ? { ...s, textes: { ...(s.textes ?? {}), [`${champ}_fr`]: valeur } } : s)), `texte.${cle}.${champ}`);

  function deplacer(i: number, sens: -1 | 1, geste: "monter" | "descendre") {
    const j = i + sens;
    if (j < 0 || j >= sections.length) return;
    const s = sections[i];
    const v = [...sections];
    [v[i], v[j]] = [v[j], v[i]];
    const dit = `« ${nom(s)} » ${geste === "monter" ? "montée" : "descendue"} en ${ordinal(j + 1)} position sur ${v.length}`;
    modifier(v, `ordre.${s.cle}.${i}`, dit);
    setRetour(null);
    // Arrivée en haut (ou en bas), le bouton disparaît : on vise l'autre.
    const cible = (geste === "monter" && j === 0) ? "descendre" : (geste === "descendre" && j === v.length - 1) ? "monter" : geste;
    viser.current = [`[data-cle="${s.cle}"] [data-geste="${cible}"]`];
    setAnnonce(`${dit}.`);
    montrer(s.cle ?? null, true);
  }

  function retirer(i: number) {
    const s = sections[i];
    const v = sections.filter((_, k) => k !== i);
    modifier(v, `retirer.${s.cle}`, `« ${nom(s)} » retirée`);
    if (ouverte === s.cle) ouvrir(null);
    setRetour({ texte: `« ${nom(s)} » retirée de l'accueil.`, retablir: { section: s, position: i } });
    const suivante = v[Math.min(i, v.length - 1)];
    viser.current = suivante ? [`[data-cle="${suivante.cle}"] [data-geste="ouvrir"]`] : [".pa-ajouter"];
  }

  function retablir() {
    if (!retour?.retablir) return;
    const { section, position } = retour.retablir;
    modifier([...sections.slice(0, position), section, ...sections.slice(position)], `retablir.${section.cle}`, `« ${nom(section)} » rétablie`);
    setRetour(null);
    viser.current = [`[data-cle="${section.cle}"] [data-geste="ouvrir"]`];
    setAnnonce(`« ${nom(section)} » rétablie en ${ordinal(position + 1)} position.`);
  }

  function ajouter(type: TypeSection) {
    if (sections.length >= MAX_SECTIONS) return;
    // Une clé que la liste n'a pas encore (n1, n2…).
    const cle = `n${1 + Math.max(0, ...sections.map((s) => Number(/^n(\d+)$/.exec(s.cle ?? "")?.[1] ?? 0)))}`;
    modifier([...sections, nouvelleSection(type, cle)], `ajouter.${cle}`, `« ${entreeDe(type, structure).nom} » ajoutée`);
    ouvrir(cle);
    setBibliotheque(false);
    setRetour(null);
    viser.current = [`[data-cle="${cle}"] .ac-reglages :is(input, select, textarea)`, `[data-cle="${cle}"] [data-geste="ouvrir"]`];
    setAnnonce(`« ${entreeDe(type, structure).nom} » ajoutée en bas de l'accueil, ouverte pour la régler.`);
  }

  const destinations = useMemo(() => [
    { valeur: "/catalogue", libelle: "Tout le catalogue" },
    ...infos.rayons.map((r) => ({ valeur: `/categorie/${r.slug}`, libelle: `Rayon : ${r.nom}` })),
    ...infos.pages.filter((p) => p.publie).map((p) => ({ valeur: `/${p.slug}`, libelle: `Page : ${p.titre}` })),
  ], [infos.rayons, infos.pages]);

  return (
    <div className="pa-accueil">
      <p className="sr-only" aria-live="polite">{annonce}</p>
      <section className="carte ap-groupe pa-plan" aria-labelledby="pa-t-plan">
        <div className="pa-tete">
          <h2 id="pa-t-plan">L&apos;accueil, de haut en bas</h2>
          <p className="aide">
            {sections.length} section{sections.length > 1 ? "s" : ""}
            {masquees ? ` · ${masquees} que la vitrine ne montre pas encore` : ""}
            {parStructure ? ` · celui de la structure ${nomStructure}` : ""}
          </p>
          <p className="aide pa-astuce"><Icone nom="apercu" taille={14} /> Cliquez une section sur l&apos;aperçu pour la régler.</p>
        </div>

        <ol className="ac-liste pa-liste" role="list">
          {sections.map((s, i) => {
            const entree = entreeDe(s.type, structure);
            const titre = (s.textes?.titre_fr ?? "").trim() || s.textes?.titre_ar || titreParDefaut(s.type, structure, s.tri);
            const masquee = sectionMasquee(s, accueil, structure);
            const ouvert = ouverte === s.cle;
            const erreur = s.cle ? problemes.parSection[s.cle] : undefined;
            const idReglages = `ac-reglages-${s.cle}`;
            return (
              <li key={s.cle} className="ac-section" data-cle={s.cle} data-ouverte={ouvert ? "" : undefined} data-masquee={masquee ? "" : undefined}
                onMouseEnter={() => montrer(s.cle ?? null)} onMouseLeave={() => montrer(ouverte)}>
                <div className="ac-section-ligne pa-ligne">
                  <button type="button" className="pa-ouvrir" data-geste="ouvrir" aria-expanded={ouvert} aria-controls={idReglages}
                    onClick={() => { ouvrir(ouvert ? null : (s.cle ?? null)); if (!ouvert) montrer(s.cle ?? null, true); }}
                    onFocus={() => montrer(s.cle ?? null)}>
                    <Miniature type={s.type} photo={s.image ? urlFichier(s.image.chemin) : s.diapos?.find((d) => d.image)?.image ? urlFichier(s.diapos.find((d) => d.image)!.image!.chemin) : null} />
                    <span className="ac-section-texte">
                      <b>{entree.nom}<span className="sr-only"> — {ouvert ? "fermer ses réglages" : "régler"}</span></b>
                      <span className="ac-section-titre">{titre.replace(/\n/g, " ")}</span>
                      {resumeReglage(s, accueil, structure) ? <span className="aide">{resumeReglage(s, accueil, structure)}</span> : null}
                      {masquee ? <span className="ac-masquee"><Icone nom="oeil" taille={12} /> {masquee}</span> : null}
                    </span>
                    <span className="pa-regler" aria-hidden="true"><Icone nom={ouvert ? "croix" : "crayon"} taille={14} /></span>
                  </button>
                  {ecrit ? (
                    <span className="ac-gestes pa-gestes">
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
                      <button type="button" className="btn-icone ac-retirer" data-geste="retirer" aria-label={`Retirer « ${entree.nom} »`} title="Retirer" onClick={() => retirer(i)} disabled={sections.length <= 1}>
                        <Icone nom="corbeille" />
                      </button>
                    </span>
                  ) : null}
                </div>
                {erreur ? <p className="ac-erreur" tabIndex={-1}>{erreur}</p> : null}
                {ouvert ? (
                  <div id={idReglages} className="ac-reglages formulaire">
                    <Reglages s={s} accueil={accueil} structure={structure} destinations={destinations} ecrit={ecrit} changer={changer} texte={texte} photoAction={photoAction} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>

        {retour ? (
          <p className="ac-retour pa-retour" role="status">
            <Icone nom="coche" taille={14} />
            <span>{retour.texte}</span>
            {retour.retablir ? <button type="button" className="btn btn-second btn-petit" onClick={retablir}>Rétablir</button> : null}
          </p>
        ) : null}
        {problemes.general ? <p className="ac-retour ac-retour-erreur" role="alert"><Icone nom="alerte" taille={14} /><span>{problemes.general}</span></p> : null}
      </section>

      {ecrit ? (
        <section className="carte ap-groupe pa-biblio" aria-labelledby="pa-t-biblio">
          <button type="button" className="btn btn-second pa-ajouter" aria-expanded={bibliotheque} aria-controls="pa-modeles"
            disabled={sections.length >= MAX_SECTIONS} onClick={() => {
              // Ouverte : la bibliothèque vient sous les yeux, le focus sur son premier modèle.
              if (!bibliotheque) viser.current = ["#pa-modeles .ac-modele:not(:disabled)"];
              setBibliotheque(!bibliotheque);
            }}>
            <Icone nom="plus" /> <span id="pa-t-biblio">Ajouter une section</span>
          </button>
          {sections.length >= MAX_SECTIONS ? <p className="aide">L&apos;accueil compte ses {MAX_SECTIONS} sections : retirez-en une pour en ajouter.</p> : null}
          {bibliotheque ? (
            <>
              <p className="aide">Elle se place en bas de l&apos;accueil ; montez-la ensuite où vous voulez.</p>
              <ul id="pa-modeles" className="ac-modeles pa-modeles" role="list">
                {/* Ce qu'on peut ajouter d'abord ; ce qui est déjà sur l'accueil, à la fin. */}
                {[...TYPES].sort((a, b) => Number(Boolean(entreeDe(a, structure).unique && presents.has(a))) - Number(Boolean(entreeDe(b, structure).unique && presents.has(b)))).map((type) => {
                  const e = entreeDe(type, structure);
                  const deja = e.unique && presents.has(type);
                  const masquee = sectionMasquee(nouvelleSection(type, "x"), accueil, structure);
                  const montrable = type === "editorial" || type === "texte" ? null : masquee;
                  return (
                    <li key={type}>
                      <button type="button" className="ac-modele" disabled={deja} onClick={() => ajouter(type)} aria-describedby={`ac-modele-${type}`}>
                        <Miniature type={type} />
                        <span className="ac-modele-texte">
                          <b>{e.nom}</b>
                          <span id={`ac-modele-${type}`} className="aide">{deja ? "Déjà sur l'accueil." : montrable ? `${e.resume} ${montrable}` : e.resume}</span>
                        </span>
                        <span className="ac-modele-plus" aria-hidden="true"><Icone nom="plus" taille={14} /></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {ecrit && !parStructure ? (
        <details className="av-pli ac-gabarit pa-structure">
          <summary className="btn btn-fantome btn-petit">Reprendre l&apos;accueil de la structure…</summary>
          <div className="av-pli-form">
            <p className="aide">
              Les sections d&apos;origine de la structure {nomStructure} reviennent dans le brouillon, sans vos textes ni vos photos d&apos;accueil.
              Rien n&apos;est en ligne avant « Publier » (⌘Z pour revenir à votre composition).
            </p>
            <button type="button" className="btn btn-danger btn-petit" onClick={() => { ouvrir(null); modifier(null, "structure-accueil", `l'accueil de la structure ${nomStructure}`); }}>
              Oui, reprendre l&apos;accueil de la structure
            </button>
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** Le réglage d'une section en quelques mots (« Les nouveautés · Robes · 8 »). */
function resumeReglage(s: SectionBrute, a: Pick<AccueilGestion, "rayons" | "pages" | "catalogue">, structure: Structure): string {
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
    case "lookbook": {
      const n = (s.points ?? []).length;
      return !s.image ? "Sans photo" : n ? `${n} point${n > 1 ? "s" : ""} sur la photo` : "Aucun point encore";
    }
    case "bannieres": {
      const n = (s.diapos ?? []).length;
      const photos = (s.diapos ?? []).filter((d) => d.image).length;
      return `${n} bannière${n > 1 ? "s" : ""}${photos ? ` · ${photos} avec photo` : ""}`;
    }
    case "piece":
      if (!s.produit && structure === "monoproduit") return "Le premier produit mis en avant, tant qu'aucun n'est choisi";
      return a.catalogue.find((c) => c.slug === s.produit)?.nom ?? "";
    default:
      return "";
  }
}

function Reglages({
  s, accueil, structure, destinations, ecrit, changer, texte, photoAction,
}: {
  s: SectionBrute;
  accueil: Pick<AccueilGestion, "rayons" | "pages" | "catalogue">;
  structure: Structure;
  destinations: { valeur: string; libelle: string }[];
  ecrit: boolean;
  changer: (cle: string, x: Partial<SectionBrute>, champ?: string) => void;
  texte: (cle: string, champ: string, valeur: string) => void;
  photoAction: string;
}) {
  const cle = s.cle ?? "";
  const id = (champ: string) => `ac-${cle}-${champ}`;
  const entree = entreeDe(s.type, structure);
  const lienActuel = s.lien ?? "";
  const lienConnu = !lienActuel || destinations.some((d) => d.valeur === lienActuel);

  return (
    <fieldset className="ac-champs" disabled={!ecrit}>
      <legend className="sr-only">Réglages de « {entree.nom} »</legend>
      {s.type === "engagements" ? (
        <p className="aide">
          Ses lignes viennent de vos réglages : paiement à la livraison, délais et frais, rappel avant expédition, refus possible{gabaritDe(structure) === "technique" ? ", retrait en magasin et conseil" : ""}. Changez-les dans les Réglages de la boutique.
        </p>
      ) : null}

      {entree.textes.map((c) => {
        const valeur = s.textes?.[`${c.cle}_fr`] ?? "";
        const defaut = c.cle === "titre" ? titreParDefaut(s.type, structure, s.tri) : "";
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
                  <input type="radio" name={id("tri")} value={v} checked={(s.tri ?? "selection") === v} onChange={() => changer(cle, { tri: v }, "tri")} />
                  <span><b>{b}</b><span className="aide">{aide}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="ac-deux">
            <div className="champ">
              <label htmlFor={id("rayon")}>Rayon</label>
              <select id={id("rayon")} value={s.rayon ?? ""} onChange={(e) => changer(cle, { rayon: e.currentTarget.value || undefined }, "rayon")}>
                <option value="">Tout le catalogue</option>
                {accueil.rayons.map((r) => <option key={r.slug} value={r.slug}>{r.parent ? `— ${r.nom}` : r.nom}</option>)}
              </select>
            </div>
            <div className="champ">
              <label htmlFor={id("nombre")}>Nombre de produits</label>
              <select id={id("nombre")} value={s.nombre ?? 8} onChange={(e) => changer(cle, { nombre: Number(e.currentTarget.value) }, "nombre")}>
                {[4, 6, 8, 10, 12, 16, 20, 24].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </>
      ) : null}

      {s.type === "avis" ? (
        <div className="champ">
          <label htmlFor={id("nombre")}>Nombre d&apos;avis</label>
          <select id={id("nombre")} value={s.nombre ?? 6} onChange={(e) => changer(cle, { nombre: Number(e.currentTarget.value) }, "nombre")}>
            {[3, 4, 6, 8, 9, 12].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <p className="aide">Les plus récents, de 4 et 5 étoiles, avec un texte. La note affichée est celle de tous vos avis publiés.</p>
        </div>
      ) : null}

      {s.type === "questions" ? (
        <div className="ac-deux">
          <div className="champ">
            <label htmlFor={id("page")}>Page de questions</label>
            <select id={id("page")} value={s.page ?? ""} onChange={(e) => changer(cle, { page: e.currentTarget.value || undefined }, "page")}>
              <option value="">La première publiée</option>
              {accueil.pages.map((p) => <option key={p.slug} value={p.slug}>{p.titre}{p.publie ? "" : " (brouillon)"}</option>)}
            </select>
          </div>
          <div className="champ">
            <label htmlFor={id("nombre")}>Nombre de questions</label>
            <select id={id("nombre")} value={s.nombre ?? 5} onChange={(e) => changer(cle, { nombre: Number(e.currentTarget.value) }, "nombre")}>
              {[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      ) : null}

      {s.type === "hero" || s.type === "editorial" ? (
        <div className="champ">
          <label htmlFor={id("lien")}>{s.type === "hero" ? "Le bouton mène à" : "Le lien mène à"}</label>
          <select id={id("lien")} value={lienActuel} onChange={(e) => changer(cle, { lien: e.currentTarget.value || undefined }, "lien")}>
            {s.type === "editorial" ? <option value="">Pas de lien</option> : <option value="">Tout le catalogue</option>}
            {!lienConnu ? <option value={lienActuel}>{lienActuel}</option> : null}
            {destinations.filter((d) => !(s.type === "hero" && d.valeur === "/catalogue")).map((d) => <option key={d.valeur} value={d.valeur}>{d.libelle}</option>)}
          </select>
        </div>
      ) : null}

      {s.type === "piece" ? (
        <div className="champ">
          <label htmlFor={id("produit")}>La pièce</label>
          <select id={id("produit")} value={s.produit ?? ""} onChange={(e) => changer(cle, { produit: e.currentTarget.value || undefined }, "produit")}>
            <option value="">Choisir une pièce…</option>
            {s.produit && !accueil.catalogue.some((c) => c.slug === s.produit) ? <option value={s.produit}>{s.produit} (plus publiée)</option> : null}
            {accueil.catalogue.map((c) => <option key={c.slug} value={c.slug}>{c.nom}</option>)}
          </select>
          <p className="aide">Ses photos, ses déclinaisons et son prix viennent de sa fiche : on la met au panier sans quitter l&apos;accueil.</p>
        </div>
      ) : null}

      {s.type === "hero" || s.type === "editorial" || s.type === "lookbook" ? (
        <Photos s={s} action={photoAction} ecrit={ecrit} changer={changer} texte={texte} id={id} />
      ) : null}

      {s.type === "bannieres" ? (
        <Diapos s={s} destinations={destinations} action={photoAction} ecrit={ecrit} changer={changer} id={id} />
      ) : null}

      {s.type === "lookbook" && s.image ? (
        <PointsLookbook s={s} catalogue={accueil.catalogue} ecrit={ecrit} changer={changer} id={id} />
      ) : null}
    </fieldset>
  );
}

/** Le dessin de la section, en blocs : on la reconnaît d'un coup d'œil. */
export function Miniature({ type, photo = null }: { type: TypeSection; photo?: string | null }) {
  const n = { hero: 3, rayons: 3, selection: 4, editorial: 4, engagements: 4, texte: 3, avis: 3, questions: 4, marques: 6, lookbook: 3, piece: 3, bannieres: 4 }[type];
  // Sa photo, s'il en a une : en fond de l'ouverture, à la place de l'image du récit.
  const fond = photo ? { backgroundImage: `url("${photo}")` } : undefined;
  return (
    <span className="ac-mini" data-type={type} data-photo={photo ? "" : undefined} aria-hidden="true" style={type === "hero" ? fond : undefined}>
      {Array.from({ length: n }, (_, i) => <i key={i} style={(type === "editorial" || type === "bannieres") && i === 0 ? fond : undefined} />)}
    </span>
  );
}

/** La photo d'une section (l'ouverture, le récit) : la choisir — réduite
 *  dans le navigateur, déposée par le serveur —, la changer, la retirer ;
 *  pour l'ouverture, son cadrage pour téléphone et le côté du texte ; sa
 *  description, pour qui ne la voit pas. Posée dans le brouillon : l'aperçu
 *  la montre, « Publier » la met en ligne. */
function Photos({
  s, action, ecrit, changer, texte, id,
}: {
  s: SectionBrute;
  action: string;
  ecrit: boolean;
  changer: (cle: string, x: Partial<SectionBrute>, champ?: string) => void;
  texte: (cle: string, champ: string, valeur: string) => void;
  id: (champ: string) => string;
}) {
  const cle = s.cle ?? "";
  const ouverture = s.type === "hero";
  const principal: EmplacementAccueil = ouverture ? "ouverture" : s.type === "lookbook" ? "lookbook" : "recit";
  // Les points du lookbook sont posés sur une photo : elle changée ou retirée, ils partent avec elle.
  const sansPoints = s.type === "lookbook" ? { points: [] } : {};
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
      if (e === "ouverture_portrait" && s.image) changer(cle, { image: { ...s.image, chemin_portrait: rep.chemin } }, "photo");
      else {
        const { image_alt_fr: _ancienne, ...textes } = s.textes ?? {};
        void _ancienne;
        changer(cle, { image: { chemin: rep.chemin }, textes, ...sansPoints }, "photo");
      }
      setEtat({ e, texte: e === "ouverture_portrait" ? "Cadrage posé dans le brouillon : « Publier » le met en ligne." : "Photo posée dans le brouillon : « Publier » la met en ligne." });
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
            <button type="button" className="btn btn-fantome btn-petit" onClick={() => { changer(cle, { image: undefined, alignement: undefined, ...sansPoints }, "photo"); setEtat(null); }}>
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
                    <button type="button" className="btn btn-fantome btn-petit" onClick={() => { const { chemin_portrait: _retire, ...reste } = s.image!; void _retire; changer(cle, { image: reste }, "photo"); setEtat(null); }}>
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
                  <input type="radio" name={id("alignement")} value={v} checked={(s.alignement ?? "debut") === v} onChange={() => changer(cle, { alignement: v === "fin" ? "fin" : undefined }, "alignement")} />
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

/** Les points du lookbook : choisir la pièce, puis toucher la photo là où
 *  elle est portée. Un point se glisse à la souris ou au doigt, se déplace
 *  aux flèches du clavier (Maj : de cinq), se retire (Suppr). Chaque point
 *  dit sa pièce, et sa pièce se change dans la liste. */
function PointsLookbook({ s, catalogue, ecrit, changer, id }: {
  s: SectionBrute;
  catalogue: PieceCatalogue[];
  ecrit: boolean;
  changer: (cle: string, x: Partial<SectionBrute>, champ?: string) => void;
  id: (champ: string) => string;
}) {
  const cle = s.cle ?? "";
  const points = s.points ?? [];
  const [piece, setPiece] = useState(catalogue[0]?.slug ?? "");
  const [glisse, setGlisse] = useState<{ i: number; x: number; y: number } | null>(null);
  const [annonce, setAnnonce] = useState("");
  const scene = useRef<HTMLDivElement>(null);
  const nom = (slug: string) => catalogue.find((c) => c.slug === slug)?.nom ?? `${slug} (plus publiée)`;
  const borne = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;
  const poser = (suivants: NonNullable<SectionBrute["points"]>, dit: string) => {
    changer(cle, { points: suivants }, "points");
    setAnnonce(dit);
  };
  const ici = (e: { clientX: number; clientY: number }) => {
    const r = scene.current!.getBoundingClientRect();
    return { x: borne(((e.clientX - r.left) / r.width) * 100), y: borne(((e.clientY - r.top) / r.height) * 100) };
  };
  const plein = points.length >= MAX_POINTS;
  const viserPoint = (i: number) => requestAnimationFrame(() => scene.current?.querySelector<HTMLElement>(`[data-point="${i}"]`)?.focus());

  function ajouter(x: number, y: number) {
    if (!ecrit || plein || !piece) return;
    poser([...points, { x, y, produit: piece }], `Point ${points.length + 1} posé : ${nom(piece)}.`);
    viserPoint(points.length);
  }

  return (
    <div className="pl" aria-describedby={id("points-aide")}>
      <p className="sr-only" aria-live="polite">{annonce}</p>
      <div className="pl-tete">
        <b>Les points</b>
        <p id={id("points-aide")} className="aide">
          {plein ? `${MAX_POINTS} points au plus : retirez-en un pour en poser un autre.` : "Choisissez la pièce, puis touchez la photo là où elle est portée. Glissez un point pour l'ajuster (ou ses flèches, au clavier)."}
        </p>
      </div>
      {!plein ? (
        <div className="champ pl-piece">
          <label htmlFor={id("piece-a-poser")}>Pièce à poser</label>
          <select id={id("piece-a-poser")} value={piece} disabled={!ecrit} onChange={(e) => setPiece(e.currentTarget.value)}>
            {catalogue.map((c) => <option key={c.slug} value={c.slug}>{c.nom}</option>)}
          </select>
        </div>
      ) : null}
      <div ref={scene} className="pl-scene" data-plein={plein ? "" : undefined}
        onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "IMG") { const p = ici(e); ajouter(p.x, p.y); } }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urlFichier(s.image!.chemin)} alt="" draggable={false} />
        {points.map((p, i) => {
          const vu = glisse?.i === i ? glisse : p;
          return (
            <button key={i} type="button" className="pl-point" data-point={i} style={{ left: `${vu.x}%`, top: `${vu.y}%` }} disabled={!ecrit}
              aria-label={`Point ${i + 1} : ${nom(p.produit)}, à ${Math.round(p.x)} % de la largeur et ${Math.round(p.y)} % de la hauteur. Flèches pour le déplacer, Suppr pour le retirer.`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => { if (!ecrit) return; e.currentTarget.setPointerCapture(e.pointerId); setGlisse({ i, x: p.x, y: p.y }); }}
              onPointerMove={(e) => { if (glisse?.i === i) setGlisse({ i, ...ici(e) }); }}
              onPointerUp={() => {
                if (glisse?.i !== i) return;
                const fin = glisse;
                setGlisse(null);
                if (fin.x !== p.x || fin.y !== p.y) poser(points.map((q, k) => (k === i ? { ...q, x: fin.x, y: fin.y } : q)), `Point ${i + 1} déplacé.`);
              }}
              onKeyDown={(e) => {
                const pas = e.shiftKey ? 5 : 1;
                const d = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] }[e.key];
                if (d) {
                  e.preventDefault();
                  poser(points.map((q, k) => (k === i ? { ...q, x: borne(q.x + d[0]), y: borne(q.y + d[1]) } : q)), `Point ${i + 1} : ${Math.round(borne(p.x + d[0]))} %, ${Math.round(borne(p.y + d[1]))} %.`);
                } else if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  poser(points.filter((_, k) => k !== i), `Point ${i + 1} retiré.`);
                }
              }}>
              {i + 1}
            </button>
          );
        })}
      </div>
      {!plein && ecrit ? (
        <button type="button" className="btn btn-fantome btn-petit pl-centre" disabled={!piece} onClick={() => ajouter(50, 50)}>
          <Icone nom="plus" /> Poser un point au centre
        </button>
      ) : null}
      {points.length ? (
        <ol className="pl-liste" role="list">
          {points.map((p, i) => (
            <li key={i}>
              <span className="pl-numero" aria-hidden="true">{i + 1}</span>
              <label className="sr-only" htmlFor={id(`point-${i}`)}>Pièce du point {i + 1}</label>
              <select id={id(`point-${i}`)} value={p.produit} disabled={!ecrit}
                onChange={(e) => { const v = e.currentTarget.value; poser(points.map((q, k) => (k === i ? { ...q, produit: v } : q)), `Point ${i + 1} : ${nom(v)}.`); }}>
                {!catalogue.some((c) => c.slug === p.produit) ? <option value={p.produit}>{nom(p.produit)}</option> : null}
                {catalogue.map((c) => <option key={c.slug} value={c.slug}>{c.nom}</option>)}
              </select>
              <button type="button" className="btn-icone ac-retirer" disabled={!ecrit} aria-label={`Retirer le point ${i + 1} (${nom(p.produit)})`} title="Retirer"
                onClick={() => poser(points.filter((_, k) => k !== i), `Point ${i + 1} retiré.`)}>
                <Icone nom="corbeille" />
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/** Déposer une photo de l'accueil (réduite dans le navigateur, revérifiée
 *  par le serveur) : son chemin dans le dépôt, ou ce qui n'a pas marché. */
async function deposerPhoto(action: string, e: EmplacementAccueil, fichier: File): Promise<{ chemin: string } | { erreur: string }> {
  const p = await preparerPhoto(fichier, e);
  if ("erreur" in p) return { erreur: p.erreur };
  try {
    const d = new FormData();
    d.set("emplacement", e);
    d.set("fichier", p.blob, p.nom);
    const r = await fetch(action, { method: "POST", body: d, headers: { accept: "application/json" }, credentials: "same-origin" });
    const rep = (await r.json().catch(() => null)) as { ok: true; chemin: string } | { ok: false; message: string } | null;
    if (!rep) return { erreur: "L'envoi n'a pas abouti : réessayez." };
    return rep.ok ? { chemin: rep.chemin } : { erreur: rep.message };
  } catch {
    return { erreur: "L'envoi n'a pas abouti (réseau coupé ?) : réessayez." };
  }
}

/** Les bannières : une carte chacune — sa photo (et son cadrage pour
 *  téléphone, sa description), son titre, son texte, son bouton et où il
 *  mène ; on les monte, les descend, les retire ; cinq au plus. */
function Diapos({ s, destinations, action, ecrit, changer, id }: {
  s: SectionBrute;
  destinations: { valeur: string; libelle: string }[];
  action: string;
  ecrit: boolean;
  changer: (cle: string, x: Partial<SectionBrute>, champ?: string) => void;
  id: (champ: string) => string;
}) {
  const cle = s.cle ?? "";
  const diapos = s.diapos?.length ? s.diapos : [{ textes: {} }];
  const [etat, setEtat] = useState<{ i: number; e: EmplacementAccueil; texte: string; erreur?: boolean; enCours?: boolean } | null>(null);
  const [annonce, setAnnonce] = useState("");
  const viser = useRef<string | null>(null);
  useEffect(() => {
    if (!viser.current) return;
    document.querySelector<HTMLElement>(viser.current)?.focus();
    viser.current = null;
  });

  const poser = (suivantes: DiapoBrute[], champ: string, dit?: string) => {
    changer(cle, { diapos: suivantes }, champ);
    if (dit) setAnnonce(dit);
  };
  const regler = (i: number, x: Partial<DiapoBrute>, champ: string) => poser(diapos.map((d, k) => (k === i ? { ...d, ...x } : d)), `diapos.${i}.${champ}`);
  const ecrire = (i: number, champ: string, valeur: string) => regler(i, { textes: { ...(diapos[i].textes ?? {}), [`${champ}_fr`]: valeur } }, champ);

  async function choisir(i: number, e: EmplacementAccueil, fichier: File | undefined) {
    if (!fichier) return;
    setEtat({ i, e, texte: "Envoi de la photo…", enCours: true });
    const r = await deposerPhoto(action, e, fichier);
    if ("erreur" in r) { setEtat({ i, e, texte: r.erreur, erreur: true }); return; }
    const d = diapos[i];
    if (e === "ouverture_portrait" && d.image) regler(i, { image: { ...d.image, chemin_portrait: r.chemin } }, "photo");
    else {
      // Une autre photo est un autre sujet : ni son cadrage ni sa description ne la suivent.
      const { image_alt_fr: _ancienne, ...textes } = d.textes ?? {};
      void _ancienne;
      regler(i, { image: { chemin: r.chemin }, textes }, "photo");
    }
    setEtat({ i, e, texte: "Photo posée dans le brouillon : « Publier » la met en ligne." });
  }

  const fichier = (i: number, e: EmplacementAccueil, libelle: string) => (
    <label className="btn btn-second btn-petit ac-fichier" data-occupe={etat?.enCours ? "" : undefined}>
      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!ecrit || etat?.enCours}
        aria-describedby={etat?.i === i && etat.e === e ? id(`b${i}-etat`) : undefined}
        onChange={(ev) => { const f = ev.currentTarget.files?.[0]; ev.currentTarget.value = ""; void choisir(i, e, f); }} />
      <Icone nom="photo" /> {libelle}
    </label>
  );

  function deplacer(i: number, sens: -1 | 1) {
    const j = i + sens;
    if (j < 0 || j >= diapos.length) return;
    const v = [...diapos];
    [v[i], v[j]] = [v[j], v[i]];
    poser(v, `diapos.ordre.${i}`, `Bannière ${i + 1} ${sens < 0 ? "montée" : "descendue"} en ${j + 1}e position.`);
    viser.current = `[data-cle="${cle}"] [data-diapo="${j}"] [data-geste="${sens < 0 && j === 0 ? "descendre" : sens > 0 && j === v.length - 1 ? "monter" : sens < 0 ? "monter" : "descendre"}"]`;
  }

  return (
    <div className="bd" aria-describedby={id("diapos-aide")}>
      <p className="sr-only" aria-live="polite">{annonce}</p>
      <div className="pl-tete">
        <b>Les bannières</b>
        <p id={id("diapos-aide")} className="aide">Elles défilent dans cet ordre, une toutes les six secondes ; le visiteur peut aussi les faire glisser. Une bannière sans photo s&apos;affiche sur un aplat.</p>
      </div>
      <ol className="bd-liste" role="list">
        {diapos.map((d, i) => {
          const lien = d.lien ?? "";
          const connu = !lien || destinations.some((x) => x.valeur === lien);
          const etatIci = etat?.i === i ? etat : null;
          return (
            <li key={i} className="bd-diapo" data-diapo={i}>
              <div className="bd-tete">
                <b>Bannière {i + 1}</b>
                {ecrit ? (
                  <span className="ac-gestes">
                    {i > 0 ? <button type="button" className="btn-icone" data-geste="monter" aria-label={`Monter la bannière ${i + 1}`} title="Monter" onClick={() => deplacer(i, -1)}><Icone nom="haut" /></button> : <span className="ac-geste-vide" />}
                    {i < diapos.length - 1 ? <button type="button" className="btn-icone" data-geste="descendre" aria-label={`Descendre la bannière ${i + 1}`} title="Descendre" onClick={() => deplacer(i, 1)}><Icone nom="bas" /></button> : <span className="ac-geste-vide" />}
                    <button type="button" className="btn-icone ac-retirer" aria-label={`Retirer la bannière ${i + 1}`} title="Retirer" disabled={diapos.length <= 1}
                      onClick={() => { poser(diapos.filter((_, k) => k !== i), `diapos.retirer.${i}`, `Bannière ${i + 1} retirée.`); viser.current = `[data-cle="${cle}"] .bd-ajouter`; }}>
                      <Icone nom="corbeille" />
                    </button>
                  </span>
                ) : null}
              </div>
              <div className="ac-photo" data-vide={d.image ? undefined : ""}>
                {d.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlFichier(d.image.chemin)} alt="" loading="lazy" />
                ) : <span className="ac-photo-vide" aria-hidden="true"><Icone nom="photo" taille={22} /></span>}
                <div className="ac-photo-corps">
                  <b>{REGLES.banniere.titre}</b>
                  <p className="aide">{REGLES.banniere.conseil}</p>
                  <span className="ac-photo-gestes">
                    {fichier(i, "banniere", d.image ? "Changer la photo" : "Choisir une photo")}
                    {d.image ? (
                      <button type="button" className="btn btn-fantome btn-petit" onClick={() => { regler(i, { image: undefined }, "photo"); setEtat(null); }}>
                        <Icone nom="croix" /> Retirer la photo
                      </button>
                    ) : null}
                    {d.image ? fichier(i, "ouverture_portrait", d.image.chemin_portrait ? "Changer le cadrage téléphone" : "Cadrage pour téléphone") : null}
                  </span>
                  {etatIci ? (
                    <p id={id(`b${i}-etat`)} className={etatIci.erreur ? "ac-photo-etat ac-photo-erreur" : "ac-photo-etat"} role={etatIci.erreur ? "alert" : "status"}>
                      {etatIci.enCours ? <span className="ac-roue" aria-hidden="true" /> : null}{etatIci.texte}
                    </p>
                  ) : null}
                  {d.image ? (
                    <div className="champ ac-photo-alt">
                      <label htmlFor={id(`b${i}-alt`)}>Description de la photo</label>
                      <input id={id(`b${i}-alt`)} type="text" value={d.textes?.image_alt_fr ?? ""} maxLength={LONGUEUR_TEXTE}
                        placeholder="Scie circulaire posée sur des tréteaux" onChange={(ev) => ecrire(i, "image_alt", ev.currentTarget.value)} />
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="champ">
                <label htmlFor={id(`b${i}-titre`)}>Titre</label>
                <input id={id(`b${i}-titre`)} type="text" value={d.textes?.titre_fr ?? ""} maxLength={LONGUEUR_TEXTE + 50}
                  aria-invalid={(d.textes?.titre_fr ?? "").length > LONGUEUR_TEXTE || undefined} onChange={(ev) => ecrire(i, "titre", ev.currentTarget.value)} />
              </div>
              <div className="champ">
                <label htmlFor={id(`b${i}-texte`)}>Texte</label>
                <textarea id={id(`b${i}-texte`)} rows={2} value={d.textes?.texte_fr ?? ""}
                  aria-invalid={(d.textes?.texte_fr ?? "").length > LONGUEUR_TEXTE || undefined} onChange={(ev) => ecrire(i, "texte", ev.currentTarget.value)} />
              </div>
              <div className="ac-deux">
                <div className="champ">
                  <label htmlFor={id(`b${i}-lien`)}>Le bouton mène à</label>
                  <select id={id(`b${i}-lien`)} value={lien} onChange={(ev) => regler(i, { lien: ev.currentTarget.value || undefined }, "lien")}>
                    <option value="">Pas de bouton</option>
                    {!connu ? <option value={lien}>{lien}</option> : null}
                    {destinations.map((x) => <option key={x.valeur} value={x.valeur}>{x.libelle}</option>)}
                  </select>
                </div>
                <div className="champ">
                  <label htmlFor={id(`b${i}-cta`)}>Texte du bouton</label>
                  <input id={id(`b${i}-cta`)} type="text" value={d.textes?.cta_fr ?? ""} placeholder="Découvrir" disabled={!lien}
                    maxLength={LONGUEUR_TEXTE + 50} onChange={(ev) => ecrire(i, "cta", ev.currentTarget.value)} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {ecrit ? (
        <button type="button" className="btn btn-fantome btn-petit bd-ajouter" disabled={diapos.length >= MAX_DIAPOS}
          onClick={() => { poser([...diapos, { textes: {} }], `diapos.ajouter.${diapos.length}`, `Bannière ${diapos.length + 1} ajoutée.`); viser.current = `[data-cle="${cle}"] [data-diapo="${diapos.length}"] input[type="text"]:not([disabled])`; }}>
          <Icone nom="plus" /> {diapos.length >= MAX_DIAPOS ? `${MAX_DIAPOS} bannières au plus` : "Ajouter une bannière"}
        </button>
      ) : null}
    </div>
  );
}
