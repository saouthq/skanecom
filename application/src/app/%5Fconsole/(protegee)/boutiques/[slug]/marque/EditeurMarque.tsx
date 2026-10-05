"use client";

import { useMemo, useState } from "react";
import type { ImagesMarque as Images } from "@/lib/console/images-marque";
import { urlFichier } from "@/lib/photos";
import { gabaritDe, JETONS_COULEUR, pilePolice, structureDe, themeDeLaBoutique, type CodeTheme, type JetonCouleur, type Police, type Structure } from "@/lib/theme";
import { LIBELLES_THEME } from "@/lib/console/libelles";
import { STRUCTURES_CONSOLE } from "@/lib/console/structures";
import { GROUPES_COULEURS, POLICES_TEXTE, POLICES_TITRES, TEXTES_MARQUE } from "./champs";
import { ImagesMarque } from "./ImagesMarque";

/* ============================================================================
   L'ÉDITEUR DE MARQUE — formulaire ordinaire (il s'enregistre sans
   JavaScript), avec un APERÇU qui suit chaque changement : les jetons
   modifiés sont posés en variables CSS sur l'aperçu seul, qui emploie les
   mêmes classes que la vitrine.

   Une couleur égale à celle du gabarit n'est pas enregistrée comme
   personnalisée : changer de gabarit garde alors des couleurs cohérentes.

   Le logo et les images s'enregistrent à part, dès leur envoi
   (ImagesMarque) : chacun rend la nouvelle version du thème, que le
   formulaire garde pour rester enregistrable.
   ========================================================================== */

export type ThemeEdite = {
  code: CodeTheme;
  version: number;
  couleurs: Partial<Record<JetonCouleur, string>>;
  polices: { titres?: Police; texte?: Police };
  textes: Record<string, string>;
  logo_mode: "masque" | "image";
  logo_chemin: string | null;
};

const defautsDe = (code: Structure) => themeDeLaBoutique({ code });

export function EditeurMarque({ slug, boutiqueId, nom, theme, images: imagesInitiales }: {
  slug: string; boutiqueId: string; nom: string; theme: ThemeEdite; images: Images;
}) {
  // La structure (six) ; l'aperçu, lui, suit son gabarit (éditorial ou technique).
  const [structure, setStructure] = useState<Structure>(structureDe(theme.code));
  const code: CodeTheme = gabaritDe(structure);
  const [images, setImages] = useState<Images>(imagesInitiales);
  const defauts = useMemo(() => defautsDe(structure), [structure]);
  const [couleurs, setCouleurs] = useState<Partial<Record<JetonCouleur, string>>>(theme.couleurs ?? {});
  const [titres, setTitres] = useState<Police | "">(theme.polices?.titres ?? "");
  const [corps, setCorps] = useState<Police | "">(theme.polices?.texte ?? "");
  const [textes, setTextes] = useState<Record<string, string>>(theme.textes ?? {});

  const couleur = (j: JetonCouleur) => (couleurs[j] ?? defauts.couleurs[j]).toUpperCase();
  const police = (titres || defauts.polices.titres) as Police;
  const policeTexte = (corps || defauts.polices.texte) as Police;
  const change = (j: JetonCouleur, v: string) => setCouleurs((c) => ({ ...c, [j]: v.toUpperCase() }));
  const retire = (j: JetonCouleur) => setCouleurs((c) => { const n = { ...c }; delete n[j]; return n; });

  const variables = Object.fromEntries([
    ...JETONS_COULEUR.map((j) => [`--theme-${j.replace("_", "-")}`, couleur(j)]),
    ["--theme-font-display", pilePolice(police)],
    ["--theme-font-texte", pilePolice(policeTexte)],
    ["--theme-radius-carte", defauts.angles.carte],
    ["--theme-radius-doux", defauts.angles.doux],
  ]) as React.CSSProperties;

  return (
    <form action={`/boutiques/${slug}/marque/enregistrer`} method="post" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] items-start">
      {/* Le bouton par défaut (touche Entrée dans un champ) : enregistrer la
          marque, jamais le premier bouton venu (« Retirer » le logo…). */}
      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">Enregistrer la marque</button>
      <input type="hidden" name="boutique_id" value={boutiqueId} />
      <input type="hidden" name="version" value={images.version} />

      <div className="grid gap-5">
        <section className="carte formulaire" aria-labelledby="t-theme">
          <h2 id="t-theme">Structure</h2>
          <fieldset className="choix choix-2 mq-structures">
            <legend className="sr-only">Structure de la vitrine</legend>
            {STRUCTURES_CONSOLE.map((x) => (
              <label key={x.code} className="choix-carte">
                <input type="radio" name="code" value={x.code} checked={structure === x.code} onChange={() => setStructure(x.code)} />
                <span><b>{LIBELLES_THEME[x.code] ?? x.code}</b><span className="aide">{x.aide}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="champ">
            <label htmlFor="polices_titres">Police des titres</label>
            <select id="polices_titres" name="polices_titres" value={titres} onChange={(e) => setTitres(e.target.value as Police | "")}>
              <option value="">Celle du gabarit ({POLICES_TITRES.find((p) => p.valeur === defauts.polices.titres)?.libelle.split(" —")[0]})</option>
              {POLICES_TITRES.map((p) => <option key={p.valeur} value={p.valeur}>{p.libelle}</option>)}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="polices_texte">Police du texte</label>
            <select id="polices_texte" name="polices_texte" value={corps} onChange={(e) => setCorps(e.target.value as Police | "")}>
              <option value="">Celle du gabarit ({POLICES_TEXTE.find((p) => p.valeur === defauts.polices.texte)?.libelle.split(" —")[0]})</option>
              {POLICES_TEXTE.map((p) => <option key={p.valeur} value={p.valeur}>{p.libelle}</option>)}
            </select>
          </div>
        </section>

        <ImagesMarque slug={slug} images={images} surChangement={setImages}
          teintes={{ fond: couleur("fond"), encre: couleur("encre"), surface: couleur("surface") }} />

        <section className="carte formulaire" aria-labelledby="t-couleurs">
          <h2 id="t-couleurs">Couleurs</h2>
          <p className="aide">Une couleur laissée à la valeur du gabarit n&apos;est pas personnalisée.</p>
          {GROUPES_COULEURS.map((g) => (
            <fieldset key={g.titre} className="mq-groupe">
              <legend className="text-petit font-medium text-encre-doux">{g.titre}</legend>
              {/* Deux par rang sur ordinateur : treize couleurs sur une
                  colonne faisaient la moitié de la page. */}
              {g.jetons.map(({ cle, libelle }) => {
                const perso = couleurs[cle] !== undefined && couleurs[cle]!.toUpperCase() !== defauts.couleurs[cle].toUpperCase();
                return (
                  <div key={cle} className="mq-couleur">
                    <input type="color" aria-label={libelle} value={couleur(cle).toLowerCase()} onChange={(e) => change(cle, e.target.value)}
                      className="mq-pastille" />
                    <span className="mq-nom">
                      <label htmlFor={`c-${cle}`}>{libelle}</label>
                      {perso ? (
                        <span className="mq-perso">
                          personnalisée ·{" "}
                          <button type="button" className="btn-lien" aria-label={`${libelle} : revenir à la couleur du gabarit`}
                            // Le bouton disparaît : le curseur reste sur la couleur, pas en haut de page.
                            onClick={() => { retire(cle); document.getElementById(`c-${cle}`)?.focus(); }}>
                            Rétablir
                          </button>
                        </span>
                      ) : null}
                    </span>
                    <input id={`c-${cle}`} name={`couleur.${cle}`} value={couleur(cle)} onChange={(e) => change(cle, e.target.value)}
                      pattern="#[0-9A-Fa-f]{6}" maxLength={7} className="mq-hexa" />
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

        {/* Toujours à portée : le gabarit se règle en haut, le bouton était
            3 000 px plus bas. */}
        <div className="mq-pied">
          <button type="submit" className="btn btn-primaire">Enregistrer la marque</button>
          <p className="aide">Le logo et les images, eux, sont enregistrés dès leur envoi.</p>
        </div>
      </div>

      {/* L'APERÇU : les classes de la vitrine, les jetons en cours. */}
      <aside className="lg:sticky lg:top-6" aria-label="Aperçu de la vitrine">
        <p className="text-petit text-encre-doux mb-2">Aperçu</p>
        <div className="apercu border border-filet-fort rounded-carte overflow-hidden font-texte" style={variables} data-apercu data-apercu-gabarit={code}>
          <div className="bg-fond text-encre">
            <div className="flex items-center justify-between px-4 py-3 border-b border-filet">
              <Marque nom={nom} logo={images.logo} hauteur={20} />
              <span className="text-legende text-encre-doux">Catalogue · Panier</span>
            </div>
            <div className={`px-4 py-5${images.ouverture?.chemin ? " apercu-ouverture" : ""}`}>
              {images.ouverture?.chemin ? (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu : l'image telle que déposée
                <img className="apercu-ouverture-image" src={urlFichier(images.ouverture.chemin)} alt="" />
              ) : null}
              <p className="ui-etiquette">{code === "technique" ? "Outillage et quincaillerie" : "Nouvelle collection"}</p>
              <p className={`font-display leading-tight mt-2 ${code === "technique" ? "text-[1.5rem] font-extrabold uppercase" : "text-[1.875rem]"}`}>Bienvenue chez {nom}.</p>
              <p className="text-petit text-encre-doux mt-2">{textes.resume_fr || "La présentation courte de la boutique s'affiche ici."}</p>
              <span className="btn btn-primaire mt-4 pointer-events-none">Voir le catalogue</span>
            </div>
            <div className="px-4 pb-5">
              <div className="bg-surface border border-filet rounded-carte p-3">
                <div className="bg-surface-2 rounded-doux h-20 grid place-items-center text-legende text-encre-doux">
                  {images.monogramme ? (
                    <span className="apercu-filigrane" role="img" aria-label="Photo à venir"
                      style={{ WebkitMaskImage: `url("${urlFichier(images.monogramme)}")`, maskImage: `url("${urlFichier(images.monogramme)}")` }} />
                  ) : "Photo"}
                </div>
                <p className="font-display mt-3">Un produit du catalogue</p>
                <p className="text-legende mt-1" style={{ color: "var(--theme-succes)" }}>● En stock — 12 pièces</p>
                <p className="mt-2 tabular-nums"><b>149,000</b> <span className="text-legende text-encre-doux">TND</span></p>
                <p className="text-legende text-accent mt-1">Voir la fiche →</p>
              </div>
            </div>
            <div className="bg-encre text-surface px-4 py-4 text-legende grid gap-3">
              {images.logo ? <Marque nom={nom} logo={images.logo} hauteur={16} /> : null}
              <span>© {nom}{textes.origine_fr ? ` — ${textes.origine_fr}` : ""}</span>
            </div>
          </div>
        </div>
      </aside>
    </form>
  );
}

/** Le logo comme la vitrine l'affiche : monochrome (masque à la couleur du
 *  texte) ou avec ses couleurs ; sans logo, le nom dans la police des titres. */
function Marque({ nom, logo, hauteur }: { nom: string; logo: Images["logo"]; hauteur: number }) {
  if (!logo) return <span className="font-display text-[1.125rem]">{nom}</span>;
  const url = urlFichier(logo.chemin);
  if (logo.mode === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- aperçu : l'image telle que déposée
    return <img src={url} alt={nom} style={{ blockSize: hauteur, inlineSize: "auto" }} />;
  }
  return (
    <span role="img" aria-label={nom} className="apercu-marque"
      style={{ blockSize: hauteur, inlineSize: Math.min(hauteur * logo.ratio, 220), WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")` }} />
  );
}
