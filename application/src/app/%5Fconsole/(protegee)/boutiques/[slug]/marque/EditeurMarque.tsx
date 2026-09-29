"use client";

import { useMemo, useState } from "react";
import { JETONS_COULEUR, themeDeLaBoutique, type CodeTheme, type JetonCouleur, type Police } from "@/lib/theme";
import { GROUPES_COULEURS, POLICES_TITRES, TEXTES_MARQUE } from "./champs";

/* ============================================================================
   L'ÉDITEUR DE MARQUE — formulaire ordinaire (il s'enregistre sans
   JavaScript), avec un APERÇU qui suit chaque changement : les jetons
   modifiés sont posés en variables CSS sur l'aperçu seul, qui emploie les
   mêmes classes que la vitrine.

   Une couleur égale à celle du thème n'est pas enregistrée comme
   personnalisée : changer de thème de départ garde alors des couleurs
   cohérentes.
   ========================================================================== */

export type ThemeEdite = {
  code: CodeTheme;
  version: number;
  couleurs: Partial<Record<JetonCouleur, string>>;
  polices: { titres?: Police };
  textes: Record<string, string>;
  logo_mode: "masque" | "image";
  logo_chemin: string | null;
};

const PILES: Record<Police, string> = {
  "young-serif": 'var(--font-young-serif), Georgia, serif',
  "plex-sans": 'var(--font-plex-sans), system-ui, sans-serif',
  archivo: 'var(--font-archivo), system-ui, sans-serif',
};

const defautsDe = (code: CodeTheme) => themeDeLaBoutique({ code });

export function EditeurMarque({ slug, boutiqueId, nom, theme }: { slug: string; boutiqueId: string; nom: string; theme: ThemeEdite }) {
  const [code, setCode] = useState<CodeTheme>(theme.code);
  const defauts = useMemo(() => defautsDe(code), [code]);
  const [couleurs, setCouleurs] = useState<Partial<Record<JetonCouleur, string>>>(theme.couleurs ?? {});
  const [titres, setTitres] = useState<Police | "">(theme.polices?.titres ?? "");
  const [textes, setTextes] = useState<Record<string, string>>(theme.textes ?? {});

  const couleur = (j: JetonCouleur) => (couleurs[j] ?? defauts.couleurs[j]).toUpperCase();
  const police = (titres || defauts.polices.titres) as Police;
  const change = (j: JetonCouleur, v: string) => setCouleurs((c) => ({ ...c, [j]: v.toUpperCase() }));
  const retire = (j: JetonCouleur) => setCouleurs((c) => { const n = { ...c }; delete n[j]; return n; });

  const variables = Object.fromEntries([
    ...JETONS_COULEUR.map((j) => [`--theme-${j.replace("_", "-")}`, couleur(j)]),
    ["--theme-font-display", PILES[police]],
    ["--theme-radius-carte", defauts.rayons.carte],
    ["--theme-radius-doux", defauts.rayons.doux],
  ]) as React.CSSProperties;

  return (
    <form action={`/boutiques/${slug}/marque/enregistrer`} method="post" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] items-start">
      <input type="hidden" name="boutique_id" value={boutiqueId} />
      <input type="hidden" name="version" value={theme.version} />

      <div className="grid gap-5">
        <section className="carte formulaire" aria-labelledby="t-theme">
          <h2 id="t-theme">Thème de départ</h2>
          <div className="deux-colonnes">
            {(["premium_sobre", "catalogue_technique"] as const).map((c) => (
              <label key={c} className="opt">
                <input type="radio" name="code" value={c} checked={code === c} onChange={() => setCode(c)} />
                {c === "premium_sobre" ? "Premium sobre (arcs, empattements)" : "Catalogue technique (angles vifs)"}
              </label>
            ))}
          </div>
          <div className="champ">
            <label htmlFor="polices_titres">Police des titres</label>
            <select id="polices_titres" name="polices_titres" value={titres} onChange={(e) => setTitres(e.target.value as Police | "")}>
              <option value="">Celle du thème ({POLICES_TITRES.find((p) => p.valeur === defauts.polices.titres)?.libelle.split(" —")[0]})</option>
              {POLICES_TITRES.map((p) => <option key={p.valeur} value={p.valeur}>{p.libelle}</option>)}
            </select>
          </div>
          {theme.logo_chemin ? (
            <div className="champ">
              <label htmlFor="logo_mode">Logo</label>
              <select id="logo_mode" name="logo_mode" defaultValue={theme.logo_mode}>
                <option value="masque">Monochrome : prend la couleur du texte (clair sur le pied foncé)</option>
                <option value="image">Image : affiché avec ses propres couleurs</option>
              </select>
            </div>
          ) : (
            <p className="aide">Pas de logo : le nom de la boutique s&apos;affiche dans la police des titres.</p>
          )}
        </section>

        <section className="carte formulaire" aria-labelledby="t-couleurs">
          <h2 id="t-couleurs">Couleurs</h2>
          <p className="aide">Une couleur laissée à la valeur du thème n&apos;est pas personnalisée.</p>
          {GROUPES_COULEURS.map((g) => (
            <fieldset key={g.titre} className="grid gap-3">
              <legend className="text-petit font-medium text-encre-doux">{g.titre}</legend>
              {g.jetons.map(({ cle, libelle }) => {
                const perso = couleurs[cle] !== undefined && couleurs[cle]!.toUpperCase() !== defauts.couleurs[cle].toUpperCase();
                return (
                  <div key={cle} className="flex flex-wrap items-center gap-3">
                    <input type="color" aria-label={libelle} value={couleur(cle).toLowerCase()} onChange={(e) => change(cle, e.target.value)}
                      className="w-11 h-11 p-0.5 border border-contour-champ rounded-doux bg-surface cursor-pointer" />
                    <label className="flex-1 min-w-[10rem]" htmlFor={`c-${cle}`}>
                      {libelle}
                      {perso ? <span className="text-legende text-accent ms-2">personnalisée</span> : null}
                    </label>
                    <input id={`c-${cle}`} name={`couleur.${cle}`} value={couleur(cle)} onChange={(e) => change(cle, e.target.value)}
                      pattern="#[0-9A-Fa-f]{6}" maxLength={7} className="w-28 font-mono text-petit px-2 py-2 border border-contour-champ rounded-doux bg-surface" />
                    {/* Place réservée même sans personnalisation : les champs restent alignés. */}
                    <button type="button" className={`btn-lien text-petit w-20 ${perso ? "" : "invisible"}`} onClick={() => retire(cle)}
                      tabIndex={perso ? 0 : -1} aria-hidden={!perso} aria-label={`${libelle} : revenir à la couleur du thème`}>
                      Rétablir
                    </button>
                  </div>
                );
              })}
            </fieldset>
          ))}
        </section>

        <section className="carte formulaire" aria-labelledby="t-textes">
          <h2 id="t-textes">Textes</h2>
          {TEXTES_MARQUE.map((t) => (
            <div key={t.cle} className="champ">
              <label htmlFor={`t-${t.cle}`}>{t.libelle}</label>
              {t.long ? (
                <textarea id={`t-${t.cle}`} name={`texte.${t.cle}`} maxLength={t.max} value={textes[t.cle] ?? ""}
                  onChange={(e) => setTextes((x) => ({ ...x, [t.cle]: e.target.value }))} aria-describedby={`a-${t.cle}`} />
              ) : (
                <input id={`t-${t.cle}`} name={`texte.${t.cle}`} maxLength={t.max} value={textes[t.cle] ?? ""}
                  onChange={(e) => setTextes((x) => ({ ...x, [t.cle]: e.target.value }))} aria-describedby={`a-${t.cle}`} />
              )}
              <p id={`a-${t.cle}`} className="aide">{t.aide}</p>
            </div>
          ))}
        </section>

        <div className="flex gap-3">
          <button type="submit" className="btn btn-primaire">Enregistrer la marque</button>
        </div>
      </div>

      {/* L'APERÇU : les classes de la vitrine, les jetons en cours. */}
      <aside className="lg:sticky lg:top-6" aria-label="Aperçu de la vitrine">
        <p className="text-petit text-encre-doux mb-2">Aperçu</p>
        <div className="apercu border border-filet-fort rounded-carte overflow-hidden" style={variables} data-apercu>
          <div className="bg-fond text-encre">
            <div className="flex items-center justify-between px-4 py-3 border-b border-filet">
              <span className="font-display text-[1.125rem]">{nom}</span>
              <span className="text-legende text-encre-doux">Catalogue · Panier</span>
            </div>
            <div className="px-4 py-5">
              <p className="etiquette"><b>01</b> <span>Accueil</span></p>
              <p className="font-display text-[1.625rem] leading-tight mt-2">Bienvenue chez {nom}.</p>
              <p className="text-petit text-encre-doux mt-2">{textes.resume_fr || "La présentation courte de la boutique s'affiche ici."}</p>
              <span className="btn btn-primaire mt-4 pointer-events-none">Voir le catalogue</span>
            </div>
            <div className="px-4 pb-5">
              <div className="bg-surface border border-filet rounded-carte p-3">
                <div className="bg-surface-2 rounded-doux h-20 grid place-items-center text-legende text-encre-doux">Photo</div>
                <p className="font-display mt-3">Un produit du catalogue</p>
                <p className="text-legende mt-1" style={{ color: "var(--theme-succes)" }}>● En stock — 12 pièces</p>
                <p className="mt-2 tabular-nums"><b>149,000</b> <span className="text-legende text-encre-doux">TND</span></p>
                <p className="text-legende text-accent mt-1">Voir la fiche →</p>
              </div>
            </div>
            <div className="bg-encre text-surface px-4 py-3 text-legende">
              © {nom}{textes.origine_fr ? ` — ${textes.origine_fr}` : ""}
            </div>
          </div>
        </div>
      </aside>
    </form>
  );
}
