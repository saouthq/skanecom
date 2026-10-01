"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Icone } from "@/components/console/Icone";
import { ZoneTexte } from "@/components/console/ZoneTexte";
import { LIMITES, problemesPage, slugDe } from "@/lib/pages-forme";

/* ============================================================================
   LES PAGES DE LA BOUTIQUE, DANS L'ÉDITEUR DE LA VITRINE — la liste (en
   ligne ou non, changée ou non), les modèles à partir desquels en écrire une
   (composés des réglages de la boutique), les pages qu'elle a d'office ; et
   l'écriture d'une page, la page elle-même à côté dans l'aperçu.

   Chaque frappe s'inscrit, une seconde plus tard, dans le brouillon de la
   page (`ecrire`, côté éditeur) : l'aperçu la rend de nouveau, « Publier »
   la met en ligne avec le reste. L'adresse d'une page se choisit à sa
   création ; une page neuve reste hors ligne jusqu'à « Publier ».
   ========================================================================== */

export type ContenuPage = { titre_fr: string; corps_fr: string; genre: "texte" | "questions"; publie: boolean; dans_pied: boolean };
export type PageEditeur = { id: string; slug: string; version: number; en_ligne: ContenuPage; brouillon: ContenuPage | null };
export type ModelePage = { cle: string; slug: string; genre: "texte" | "questions"; titre: string; resume: string; corps: string };
export type PageOffice = { titre: string; chemin: string; source: string; reglages: string | null };
/** Le résultat d'une écriture : rien (réussie), ou ce qui l'a empêchée. */
export type Refus = { champ: "titre" | "slug" | "corps" | null; texte: string } | null;

const memes = (a: ContenuPage, b: ContenuPage) =>
  a.titre_fr === b.titre_fr && a.corps_fr === b.corps_fr && a.genre === b.genre && a.publie === b.publie && a.dans_pied === b.dans_pied;

export function PanneauPages({
  pages, modeles, office, ecrit, affichee, courante, ouvrir, ecrire, creer, ranger, retirer,
}: {
  pages: PageEditeur[];
  modeles: ModelePage[];
  office: PageOffice[];
  ecrit: boolean;
  /** Le domaine montré devant l'adresse d'une page (« dar-alia.tn »). */
  affichee: string | null;
  /** La page ouverte (son id), « nouvelle », ou la liste. */
  courante: string | null;
  ouvrir: (id: string | null) => void;
  /** Écrire le brouillon d'une page (null : revenir à ce qui est en ligne). */
  ecrire: (page: PageEditeur, contenu: ContenuPage | null) => Promise<Refus>;
  /** Créer une page (hors ligne) : son id, ou ce qui l'a empêchée. */
  creer: (slug: string, contenu: ContenuPage) => Promise<{ id: string } | Refus>;
  /** Ranger les pages (toutes, dans l'ordre voulu) — aussitôt en ligne : null, ou ce qui l'a empêché. */
  ranger: (ids: string[]) => Promise<string | null>;
  /** Retirer une page de la boutique — aussitôt : null, ou ce qui l'a empêché. */
  retirer: (page: PageEditeur) => Promise<string | null>;
}) {
  const [annonce, setAnnonce] = useState("");
  const [souci, setSouci] = useState<string | null>(null);
  const page = pages.find((p) => p.id === courante) ?? null;
  if (courante === "nouvelle" || courante?.startsWith("modele:")) {
    const modele = courante.startsWith("modele:") ? modeles.find((m) => `modele:${m.cle}` === courante) ?? null : null;
    return <NouvellePage key={courante} modele={modele} affichee={affichee} ecrit={ecrit} retour={() => ouvrir(null)} creer={creer} ouvrir={ouvrir} />;
  }
  if (page) {
    return (
      <Ecriture key={page.id} page={page} affichee={affichee} ecrit={ecrit} retour={() => ouvrir(null)} ecrire={ecrire}
        retirer={async () => {
          const r = await retirer(page);
          if (!r) { ouvrir(null); setAnnonce(`« ${(page.brouillon ?? page.en_ligne).titre_fr} » retirée de la boutique.`); }
          return r;
        }} />
    );
  }

  // Monter ou descendre une page : l'ordre part aussitôt (le pied de page de
  // la boutique le suit), le focus reste sur le geste.
  async function deplacer(i: number, sens: -1 | 1) {
    const j = i + sens;
    if (j < 0 || j >= pages.length) return;
    const ids = pages.map((p) => p.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const deplacee = pages[i];
    setSouci(null);
    const r = await ranger(ids);
    if (r) { setSouci(r); return; }
    const geste = (sens < 0 && j === 0) ? "descendre" : (sens > 0 && j === pages.length - 1) ? "monter" : sens < 0 ? "monter" : "descendre";
    setAnnonce(`« ${(deplacee.brouillon ?? deplacee.en_ligne).titre_fr} » ${sens < 0 ? "montée" : "descendue"} en position ${j + 1} sur ${pages.length}.`);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.pp-liste [data-page="${deplacee.slug}"] [data-geste="${geste}"]`)?.focus());
  }

  const prises = new Set(pages.map((p) => p.slug));
  const libres = modeles.filter((m) => !prises.has(m.slug));
  return (
    <div className="pp-pages">
      <p className="sr-only" aria-live="polite">{annonce}</p>
      <section className="carte ap-groupe" aria-labelledby="pp-t-liste">
        <h2 id="pp-t-liste">Les pages de la boutique</h2>
        {pages.length ? (
          <ul className="pp-liste" role="list">
            {pages.map((p, i) => {
              const vue = p.brouillon ?? p.en_ligne;
              const changee = p.brouillon !== null && !memes(p.brouillon, p.en_ligne);
              return (
                <li key={p.id} className="pp-item" data-page={p.slug}>
                  <button type="button" className="pp-ligne" onClick={() => ouvrir(p.id)}>
                    <span className="pp-ligne-texte">
                      <b>{vue.titre_fr}</b>
                      <span className="aide">/{p.slug}{vue.genre === "questions" ? " · questions-réponses" : ""}{vue.dans_pied ? " · au pied de page" : ""}</span>
                    </span>
                    <span className="pp-etats">
                      <span className="pp-etat" data-etat={vue.publie ? "en-ligne" : "hors-ligne"}>{vue.publie ? (p.en_ligne.publie ? "En ligne" : "En ligne à la publication") : p.en_ligne.publie ? "Retirée à la publication" : "Hors ligne"}</span>
                      {changee ? <span className="pp-etat" data-etat="change">Changée</span> : null}
                    </span>
                    <Icone nom="droite" taille={14} />
                  </button>
                  {ecrit && pages.length > 1 ? (
                    <span className="ac-gestes pp-gestes">
                      {i > 0 ? (
                        <button type="button" className="btn-icone" data-geste="monter" aria-label={`Monter « ${vue.titre_fr} »`} title="Monter" onClick={() => void deplacer(i, -1)}>
                          <Icone nom="haut" />
                        </button>
                      ) : <span className="ac-geste-vide" />}
                      {i < pages.length - 1 ? (
                        <button type="button" className="btn-icone" data-geste="descendre" aria-label={`Descendre « ${vue.titre_fr} »`} title="Descendre" onClick={() => void deplacer(i, 1)}>
                          <Icone nom="bas" />
                        </button>
                      ) : <span className="ac-geste-vide" />}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : <p className="aide">Aucune page encore : partez d&apos;un modèle, ou d&apos;une page vide.</p>}
        {pages.length > 1 && ecrit ? <p className="aide pp-astuce">L&apos;ordre est celui du pied de page ; il change aussitôt, sans « Publier ».</p> : null}
        {souci ? <p className="pg-erreur" role="alert">{souci}</p> : null}
      </section>

      {ecrit ? (
        <section className="carte ap-groupe" aria-labelledby="pp-t-nouvelle">
          <h2 id="pp-t-nouvelle">Écrire une page</h2>
          <ul className="pp-modeles" role="list">
            {libres.map((m) => (
              <li key={m.cle}>
                <button type="button" className="ac-modele" onClick={() => ouvrir(`modele:${m.cle}`)}>
                  <span className="ac-modele-texte"><b>{m.titre}</b><span className="aide">{m.resume}</span></span>
                  <span className="ac-modele-plus" aria-hidden="true"><Icone nom="plus" taille={14} /></span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="ac-modele" onClick={() => ouvrir("nouvelle")}>
                <span className="ac-modele-texte"><b>Une page vide</b><span className="aide">Un guide des tailles, l&apos;entretien, vos boutiques…</span></span>
                <span className="ac-modele-plus" aria-hidden="true"><Icone nom="plus" taille={14} /></span>
              </button>
            </li>
          </ul>
        </section>
      ) : null}

      {office.length ? (
        <details className="carte ap-groupe pp-office">
          <summary>Les pages que la boutique a d&apos;office</summary>
          <ul role="list">
            {office.map((o) => (
              <li key={o.chemin}>
                <b>{o.titre}</b> <code>{o.chemin}</code>
                <span className="aide">{o.source}{o.reglages ? <> <a href={o.reglages}>Les régler</a></> : null}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** L'écriture d'une page : chaque frappe part dans son brouillon, une seconde plus tard. */
function Ecriture({ page, affichee, ecrit, retour, ecrire, retirer }: {
  page: PageEditeur;
  affichee: string | null;
  ecrit: boolean;
  retour: () => void;
  ecrire: (page: PageEditeur, contenu: ContenuPage | null) => Promise<Refus>;
  retirer: () => Promise<string | null>;
}) {
  const [aRetirer, setARetirer] = useState(false);
  const [retrait, setRetrait] = useState<{ envoi: boolean; souci: string | null }>({ envoi: false, souci: null });
  const [c, setC] = useState<ContenuPage>(() => page.brouillon ?? page.en_ligne);
  const [envoye, setEnvoye] = useState<ContenuPage>(() => page.brouillon ?? page.en_ligne);
  const [refus, setRefus] = useState<Refus>(null);
  const [envoi, setEnvoi] = useState(false);
  const problemes = useMemo(() => problemesPage({ titre: c.titre_fr, slug: page.slug, corps: c.corps_fr }), [c, page.slug]);
  const aRevoir = Boolean(problemes.titre || problemes.corps);
  const poser = (x: Partial<ContenuPage>) => { setC((v) => ({ ...v, ...x })); setRefus(null); };

  const envoyer = useEffectEvent(async () => {
    if (!ecrit || envoi || aRevoir || memes(c, envoye)) return;
    const part = c;
    setEnvoi(true);
    // Revenue à ce qui est en ligne : le brouillon de la page n'a plus lieu d'être.
    const r = await ecrire(page, memes(part, page.en_ligne) ? null : part);
    setEnvoi(false);
    if (r) setRefus(r);
    else setEnvoye(part);
  });
  useEffect(() => {
    if (memes(c, envoye) || envoi) return;
    const minuterie = window.setTimeout(() => { void envoyer(); }, 900);
    return () => window.clearTimeout(minuterie);
  }, [c, envoye, envoi]);

  const erreur = (champ: "titre" | "corps") => (refus?.champ === champ ? refus.texte : problemes[champ]);
  const etat = envoi ? "Enregistrement…" : refus && !refus.champ ? refus.texte : memes(c, envoye) ? (page.brouillon || !memes(c, page.en_ligne) ? "Dans le brouillon : « Publier » la met en ligne." : "C'est la page en ligne.") : "Modifications…";

  return (
    <div className="pp-ecriture">
      <button type="button" className="btn btn-fantome btn-petit pp-retour" onClick={retour}><Icone nom="gauche" /> Toutes les pages</button>
      <section className="carte ap-groupe" aria-labelledby="pp-t-page">
        <h2 id="pp-t-page">{c.titre_fr.trim() || "La page"}</h2>
        <p className="aide pp-adresse">{affichee ?? ""}/{page.slug}</p>
        <fieldset className="ac-champs" disabled={!ecrit}>
          <legend className="sr-only">La page « {c.titre_fr} »</legend>
          <div className="champ">
            <label htmlFor="pp-titre">Titre</label>
            <input id="pp-titre" type="text" value={c.titre_fr} maxLength={LIMITES.titre.max + 20} aria-invalid={erreur("titre") ? true : undefined}
              aria-describedby={erreur("titre") ? "pp-titre-erreur" : undefined} onChange={(e) => poser({ titre_fr: e.currentTarget.value })} />
            {erreur("titre") ? <p id="pp-titre-erreur" className="pg-erreur">{erreur("titre")}</p> : null}
          </div>
          <fieldset className="champ">
            <legend>Forme</legend>
            <div className="choix pp-genre">
              {([["texte", "Un texte", "Des paragraphes, des intertitres."], ["questions", "Des questions-réponses", "Chaque intertitre est une question."]] as const).map(([v, b, aide]) => (
                <label key={v} className="choix-carte">
                  <input type="radio" name="pp-genre" value={v} checked={c.genre === v} onChange={() => poser({ genre: v })} />
                  <span><b>{b}</b><span className="aide">{aide}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <ZoneTexte id="pp-corps" valeur={c.corps_fr} genre={c.genre} erreur={erreur("corps")} changer={(corps) => poser({ corps_fr: corps })} desactive={!ecrit} />
          <label className="pc-bascule">
            <input type="checkbox" checked={c.publie} onChange={(e) => poser({ publie: e.currentTarget.checked })} />
            <span><b>En ligne</b><span className="aide">{c.publie ? `À la publication, la boutique la montre à /${page.slug}.` : "Hors ligne : la boutique ne la montre à personne."}</span></span>
          </label>
          <label className="pc-bascule">
            <input type="checkbox" checked={c.dans_pied} onChange={(e) => poser({ dans_pied: e.currentTarget.checked })} />
            <span><b>Un lien au pied de page</b><span className="aide">Dans la colonne « La boutique », sur toutes les pages.</span></span>
          </label>
        </fieldset>
        <p className="aide pp-etat-envoi" aria-live="polite" data-erreur={refus && !refus.champ ? "" : undefined}>{etat}</p>
      </section>
      {ecrit ? (
        <section className="carte ap-groupe pp-retrait" aria-labelledby="pp-t-retrait">
          <h2 id="pp-t-retrait">Retirer la page</h2>
          {!aRetirer ? (
            <>
              <p className="aide">Pour la cacher un temps, décochez plutôt « En ligne ». Retirée, elle quitte la boutique tout de suite, son texte avec.</p>
              <button type="button" className="btn btn-second btn-petit pp-retirer" onClick={() => setARetirer(true)}>
                <Icone nom="corbeille" /> Retirer « {c.titre_fr.trim() || page.slug} »…
              </button>
            </>
          ) : (
            <div className="pp-confirmer" role="group" aria-labelledby="pp-t-retrait">
              <p><b>Retirer « {c.titre_fr.trim() || page.slug} » de la boutique ?</b> Son adresse /{page.slug} ne répondra plus. Cela ne se défait pas.</p>
              <div className="pp-confirmer-gestes">
                <button type="button" className="btn btn-danger btn-petit" disabled={retrait.envoi} aria-busy={retrait.envoi || undefined}
                  onClick={async () => {
                    setRetrait({ envoi: true, souci: null });
                    const r = await retirer();
                    setRetrait({ envoi: false, souci: r });
                  }}>
                  Retirer la page
                </button>
                <button type="button" className="btn btn-fantome btn-petit" disabled={retrait.envoi} onClick={() => { setARetirer(false); setRetrait({ envoi: false, souci: null }); }}>
                  Garder la page
                </button>
              </div>
              {retrait.souci ? <p className="pg-erreur" role="alert">{retrait.souci}</p> : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

/** Une page neuve : son titre, son adresse (qui suit le titre tant qu'on n'y touche pas), sa forme. */
function NouvellePage({ modele, affichee, ecrit, retour, creer, ouvrir }: {
  modele: ModelePage | null;
  affichee: string | null;
  ecrit: boolean;
  retour: () => void;
  creer: (slug: string, contenu: ContenuPage) => Promise<{ id: string } | Refus>;
  ouvrir: (id: string | null) => void;
}) {
  const [titre, setTitre] = useState(modele?.titre ?? "");
  const [slug, setSlug] = useState(modele?.slug ?? "");
  const [libre, setLibre] = useState(!modele);
  const [genre, setGenre] = useState<"texte" | "questions">(modele?.genre ?? "texte");
  const [tente, setTente] = useState(false);
  const [refus, setRefus] = useState<Refus>(null);
  const [envoi, setEnvoi] = useState(false);
  const champTitre = useRef<HTMLInputElement>(null);
  const problemes = problemesPage({ titre, slug, corps: modele?.corps ?? "" });
  const erreur = (champ: "titre" | "slug") => (refus?.champ === champ ? refus.texte : tente ? problemes[champ] : undefined);
  useEffect(() => { champTitre.current?.focus(); }, []);

  async function valider() {
    setTente(true);
    if (problemes.titre || problemes.slug) return;
    setEnvoi(true);
    const r = await creer(slug, { titre_fr: titre.trim(), corps_fr: modele?.corps ?? "", genre, publie: true, dans_pied: true });
    setEnvoi(false);
    if (r && "id" in r) ouvrir(r.id);
    else setRefus(r);
  }

  return (
    <div className="pp-ecriture">
      <button type="button" className="btn btn-fantome btn-petit pp-retour" onClick={retour}><Icone nom="gauche" /> Toutes les pages</button>
      <form className="carte ap-groupe" aria-labelledby="pp-t-nouvelle-page" onSubmit={(e) => { e.preventDefault(); void valider(); }}>
        <h2 id="pp-t-nouvelle-page">{modele ? `Page « ${modele.titre} »` : "Une page neuve"}</h2>
        {modele ? <p className="aide">Son texte est composé de vos réglages : relisez-le, ajustez-le, puis publiez.</p> : null}
        <fieldset className="ac-champs" disabled={!ecrit || envoi}>
          <legend className="sr-only">La page neuve</legend>
          <div className="champ">
            <label htmlFor="pp-nouveau-titre">Titre</label>
            <input ref={champTitre} id="pp-nouveau-titre" type="text" value={titre} maxLength={LIMITES.titre.max + 20}
              placeholder="Guide des tailles, Entretien, Nos boutiques…" aria-invalid={erreur("titre") ? true : undefined}
              onChange={(e) => { const v = e.currentTarget.value; setTitre(v); if (libre) setSlug(slugDe(v)); setRefus(null); }} />
            {erreur("titre") ? <p className="pg-erreur">{erreur("titre")}</p> : null}
          </div>
          <div className="champ">
            <label htmlFor="pp-nouveau-slug">Adresse de la page</label>
            <div className="pg-adresse-champ">
              <span className="pg-adresse-prefixe" aria-hidden="true">{affichee ? `${affichee}/` : "/"}</span>
              <input id="pp-nouveau-slug" type="text" value={slug} maxLength={LIMITES.slug.max} spellCheck={false} autoCapitalize="none" autoCorrect="off"
                aria-invalid={erreur("slug") ? true : undefined}
                onChange={(e) => { setLibre(false); setSlug(e.currentTarget.value.toLowerCase().replace(/\s+/g, "-")); setRefus(null); }} />
            </div>
            {erreur("slug") ? <p className="pg-erreur">{erreur("slug")}</p> : <p className="aide">Elle suit le titre tant que vous ne la changez pas ; elle ne change plus une fois la page créée.</p>}
          </div>
          {!modele ? (
            <fieldset className="champ">
              <legend>Forme</legend>
              <div className="choix pp-genre">
                {([["texte", "Un texte"], ["questions", "Des questions-réponses"]] as const).map(([v, b]) => (
                  <label key={v} className="choix-carte">
                    <input type="radio" name="pp-nouveau-genre" value={v} checked={genre === v} onChange={() => setGenre(v)} />
                    <span><b>{b}</b></span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </fieldset>
        {refus && !refus.champ ? <p className="pg-erreur" role="alert">{refus.texte}</p> : null}
        <button className="btn btn-primaire" disabled={!ecrit || envoi} aria-busy={envoi || undefined}><Icone nom="plus" /> Créer la page</button>
        <p className="aide">Elle s&apos;ouvre aussitôt à côté, dans l&apos;aperçu ; elle reste hors ligne jusqu&apos;à « Publier ».</p>
      </form>
    </div>
  );
}
