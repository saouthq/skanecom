"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Icone } from "@/components/console/Icone";
import { REGLES, defautImage, type Emplacement, type ImagesMarque as Images, type Regle } from "@/lib/console/images-marque";
import { urlFichier } from "@/lib/photos";

/* ============================================================================
   LE LOGO ET LES IMAGES — dans l'éditeur de marque, chaque image
   s'enregistre dès qu'on la choisit (ou qu'on la glisse sur sa ligne).

   Le navigateur PRÉPARE le fichier avant l'envoi :
   · un SVG est dessiné à la taille voulue puis converti en PNG (le serveur
     n'accepte jamais de SVG : il pourrait porter du script) ;
   · un tracé (logo, monogramme, icône) garde sa transparence, perd ses
     marges vides ; l'icône est complétée en carré ;
   · une photo est réduite (WebP) et perd ses informations cachées (lieu de
     la prise de vue).
   Un logo sans transparence est affiché avec ses couleurs : en monochrome,
   ce serait un rectangle plein.

   Chaque réponse rend les images à jour et la nouvelle version du thème :
   le formulaire de marque la garde, et reste enregistrable.

   Sans script, chaque ligne a son bouton « Envoyer » : le formulaire de
   marque part alors vers la route des images (formAction).
   ========================================================================== */

type Etat = { phase: "repos" | "preparation" | "envoi"; message?: { ok: boolean; texte: string } };
type Prepare = { blob: Blob; nom: string; opaque: boolean } | { erreur: string };

const rien = () => () => {};

function versBlob(canvas: HTMLCanvasElement, type: string, qualite?: number): Promise<Blob | null> {
  return new Promise((r) => canvas.toBlob(r, type, qualite));
}

/** Un SVG dessiné à la taille de la boîte (un tracé vectoriel grandit sans perte). */
async function chargerSvg(fichier: File, regle: Regle): Promise<HTMLImageElement | null> {
  const texte = await fichier.text();
  const racine = texte.match(/<svg\b[^>]*>/i)?.[0];
  if (!racine) return null;
  const attribut = (nom: string) => racine.match(new RegExp(`\\s${nom}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
  const boite = attribut("viewBox")?.trim().split(/[\s,]+/).map(Number);
  let l = parseFloat(attribut("width") ?? "");
  let h = parseFloat(attribut("height") ?? "");
  if (boite?.length === 4 && boite[2] > 0 && boite[3] > 0) { l = boite[2]; h = boite[3]; }
  if (!(l > 0 && h > 0)) return null;
  const echelle = Math.min(regle.boite.largeur / l, regle.boite.hauteur / h);
  const largeur = Math.round(l * echelle);
  const hauteur = Math.round(h * echelle);
  // Largeur et hauteur fixées sur la racine : le navigateur le dessine à cette taille.
  const nouvelle = racine
    .replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, "")
    .replace(/^<svg\b/i, `<svg width="${largeur}" height="${hauteur}"${attribut("viewBox") ? "" : ` viewBox="0 0 ${l} ${h}"`}`);
  const url = URL.createObjectURL(new Blob([texte.replace(racine, nouvelle)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** La boîte des pixels non transparents ; null si l'image est opaque partout. */
function contenu(ctx: CanvasRenderingContext2D, l: number, h: number): { x: number; y: number; l: number; h: number } | null {
  const { data } = ctx.getImageData(0, 0, l, h);
  let x0 = l, y0 = h, x1 = -1, y1 = -1, transparent = false;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < l; x += 1) {
      const a = data[(y * l + x) * 4 + 3];
      if (a < 250) transparent = true;
      if (a > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (!transparent) return null;
  if (x1 < 0) return { x: 0, y: 0, l, h };
  return { x: x0, y: y0, l: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function preparer(fichier: File, e: Emplacement): Promise<Prepare> {
  const regle = REGLES[e];
  const svg = fichier.type === "image/svg+xml" || /\.svg$/i.test(fichier.name);
  if (svg && regle.genre !== "trace") return { erreur: "Une photo de l'accueil est un JPEG, un PNG ou un WebP." };

  let source: CanvasImageSource;
  let l: number;
  let h: number;
  if (svg) {
    const img = await chargerSvg(fichier, regle);
    if (!img) return { erreur: `« ${fichier.name} » : SVG illisible (il lui faut une largeur et une hauteur, ou un viewBox).` };
    source = img;
    l = img.width;
    h = img.height;
  } else {
    try {
      const bitmap = await createImageBitmap(fichier, { imageOrientation: "from-image" });
      source = bitmap;
      l = bitmap.width;
      h = bitmap.height;
    } catch {
      return { erreur: `« ${fichier.name} » n'est pas une image que le navigateur sait lire.` };
    }
    const defaut = defautImage(e, l, h, true);
    if (defaut) return { erreur: defaut };
  }

  const echelle = Math.min(1, regle.boite.largeur / l, regle.boite.hauteur / h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(l * echelle));
  canvas.height = Math.max(1, Math.round(h * echelle));
  const ctx = canvas.getContext("2d", { willReadFrequently: regle.genre === "trace" });
  if (!ctx) return { erreur: "Le navigateur ne sait pas préparer cette image." };
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source && typeof source.close === "function") source.close();

  if (regle.genre === "photo") {
    let blob = await versBlob(canvas, "image/webp", 0.85);
    if (!blob || blob.type !== "image/webp") blob = await versBlob(canvas, "image/jpeg", 0.88);
    if (!blob) return { erreur: "Le navigateur ne sait pas préparer cette photo." };
    return { blob, nom: `${e}.${blob.type === "image/webp" ? "webp" : "jpg"}`, opaque: true };
  }

  // Un tracé : on rogne les marges transparentes, puis l'icône est mise au carré.
  const zone = contenu(ctx, canvas.width, canvas.height);
  if (e === "monogramme" && !zone) {
    return { erreur: "Le monogramme sert de filigrane : il lui faut un fond transparent (PNG ou SVG)." };
  }
  let sortie = canvas;
  const cadre = zone ?? { x: 0, y: 0, l: canvas.width, h: canvas.height };
  if (zone || regle.forme === "carre") {
    const cote = Math.max(cadre.l, cadre.h);
    const carre = regle.forme === "carre";
    sortie = document.createElement("canvas");
    sortie.width = carre ? regle.boite.largeur : cadre.l;
    sortie.height = carre ? regle.boite.hauteur : cadre.h;
    const c = sortie.getContext("2d");
    if (!c) return { erreur: "Le navigateur ne sait pas préparer cette image." };
    c.imageSmoothingQuality = "high";
    if (carre) {
      const k = sortie.width / cote;
      const dl = cadre.l * k;
      const dh = cadre.h * k;
      c.drawImage(canvas, cadre.x, cadre.y, cadre.l, cadre.h, (sortie.width - dl) / 2, (sortie.height - dh) / 2, dl, dh);
    } else {
      c.drawImage(canvas, cadre.x, cadre.y, cadre.l, cadre.h, 0, 0, cadre.l, cadre.h);
    }
  }
  if (e === "logo") {
    const defaut = defautImage(e, sortie.width, sortie.height);
    if (defaut) return { erreur: defaut };
  }
  const blob = await versBlob(sortie, "image/png");
  if (!blob) return { erreur: "Le navigateur ne sait pas préparer cette image." };
  return { blob, nom: `${e}.png`, opaque: !zone };
}

/* --- L'écran ------------------------------------------------------------- */

export function ImagesMarque({
  slug, images, surChangement, teintes,
}: {
  slug: string;
  images: Images;
  surChangement: (images: Images) => void;
  /** Les couleurs en cours de la marque, pour montrer le logo sur ses fonds. */
  teintes: { fond: string; encre: string; surface: string };
}) {
  const pret = useSyncExternalStore(rien, () => true, () => false);
  const [etats, setEtats] = useState<Partial<Record<Emplacement, Etat>>>({});
  // Les gestes passent l'un après l'autre, chacun avec la version rendue par
  // le précédent (deux fichiers glissés d'affilée ne se contredisent pas).
  const version = useRef(images.version);
  const file = useRef<Promise<void>>(Promise.resolve());
  const action = `/boutiques/${slug}/marque/images`;
  const etat = (e: Emplacement): Etat => etats[e] ?? { phase: "repos" };
  const poser = (e: Emplacement, x: Etat) => setEtats((s) => ({ ...s, [e]: x }));

  function envoyer(e: Emplacement, geste: string, champs: Record<string, string | [Blob, string]> = {}) {
    poser(e, { phase: "envoi" });
    const tache = file.current.then(() => executer(e, geste, champs));
    file.current = tache.catch(() => {});
    return tache;
  }

  async function executer(e: Emplacement, geste: string, champs: Record<string, string | [Blob, string]>) {
    const donnees = new FormData();
    donnees.set("geste", `${geste}:${e}`);
    donnees.set("version", String(version.current));
    for (const [cle, v] of Object.entries(champs)) {
      if (Array.isArray(v)) donnees.set(cle, v[0], v[1]);
      else donnees.set(cle, v);
    }
    try {
      const r = await fetch(action, { method: "POST", body: donnees, headers: { accept: "application/json" }, credentials: "same-origin" });
      const corps = (await r.json().catch(() => null)) as { ok: boolean; message: string; images?: Images | null } | null;
      if (!corps) throw new Error("réponse illisible");
      if (corps.ok && corps.images) {
        version.current = corps.images.version;
        surChangement(corps.images);
      }
      poser(e, { phase: "repos", message: { ok: corps.ok, texte: corps.message } });
    } catch {
      poser(e, { phase: "repos", message: { ok: false, texte: "L'envoi n'a pas abouti (réseau coupé, ou session expirée : rechargez la page)." } });
    }
  }

  async function choisir(e: Emplacement, fichier: File | undefined) {
    if (!fichier || etat(e).phase !== "repos") return;
    poser(e, { phase: "preparation" });
    const p = await preparer(fichier, e);
    if ("erreur" in p) {
      poser(e, { phase: "repos", message: { ok: false, texte: p.erreur } });
      return;
    }
    const champs: Record<string, string | [Blob, string]> = { [`fichier.${e}`]: [p.blob, p.nom] };
    if (e === "logo") champs.logo_mode = p.opaque ? "image" : (images.logo?.mode ?? "masque");
    await envoyer(e, "deposer", champs);
  }

  const ligne = (e: Emplacement, vignette: React.ReactNode, present: boolean, extra?: React.ReactNode, secondaire = false) => {
    const r = REGLES[e];
    const x = etat(e);
    const occupe = x.phase !== "repos";
    return (
      <div
        className={`im-ligne${secondaire ? " im-ligne-secondaire" : ""}`}
        data-emplacement={e}
        data-occupe={occupe ? "" : undefined}
        onDragOver={(ev) => { if (pret) ev.preventDefault(); }}
        onDrop={(ev) => { if (!pret) return; ev.preventDefault(); void choisir(e, ev.dataTransfer.files[0]); }}
      >
        <div className={`im-vignette im-vignette-${r.genre}${e === "ouverture_portrait" ? " im-vignette-portrait" : ""}`}>{vignette}</div>
        <div className="im-corps">
          <div className="im-tete">
            <p className="im-titre">{r.titre}{present ? null : <span className="ui-etat">Aucun{r.titre.startsWith("Photo") || r.titre.startsWith("Icône") ? "e" : ""}</span>}</p>
            <div className="im-actions">
              <label className={`btn btn-second btn-petit im-choisir${occupe ? " im-occupe" : ""}`}>
                <input
                  type="file"
                  name={`fichier.${e}`}
                  aria-label={`${present ? "Remplacer" : "Choisir"} : ${r.titre.toLowerCase()}`}
                  className="sr-only"
                  accept={r.genre === "trace" ? "image/svg+xml,image/png,image/webp,image/jpeg" : "image/jpeg,image/png,image/webp"}
                  disabled={occupe}
                  onChange={(ev) => {
                    if (!pret) return;
                    const f = ev.currentTarget.files?.[0];
                    ev.currentTarget.value = "";
                    void choisir(e, f);
                  }}
                />
                <Icone nom={occupe ? "horloge" : "photo"} taille={15} />
                <span aria-live="polite">{x.phase === "preparation" ? "Préparation…" : x.phase === "envoi" ? "Envoi…" : present ? "Remplacer" : "Choisir"}</span>
              </label>
              {!pret ? (
                <button type="submit" className="btn btn-second btn-petit" formAction={action} formEncType="multipart/form-data" name="geste" value={`deposer:${e}`}>
                  Envoyer
                </button>
              ) : null}
              {present ? (
                <button
                  type="submit" className="btn btn-fantome btn-petit im-retirer" formAction={action} formEncType="multipart/form-data" name="geste" value={`retirer:${e}`}
                  disabled={occupe}
                  aria-label={`Retirer : ${r.titre.toLowerCase()}`}
                  onClick={(ev) => { if (!pret) return; ev.preventDefault(); void envoyer(e, "retirer"); }}
                >
                  <Icone nom="corbeille" taille={15} /> Retirer
                </button>
              ) : null}
            </div>
          </div>
          <p className="aide">{r.role}</p>
          <p className="aide im-conseil">{r.conseil}</p>
          {x.message ? (
            <p className={`im-message ${x.message.ok ? "im-message-ok" : "im-message-erreur"}`} role={x.message.ok ? "status" : "alert"}>
              <Icone nom={x.message.ok ? "succes" : "alerte"} taille={14} /> {x.message.texte}
            </p>
          ) : null}
          {extra}
        </div>
      </div>
    );
  };

  // Des vignettes : le fichier tel que déposé, sans passer par l'optimiseur d'images.
  const photo = (chemin: string | null, alt = "") =>
    // eslint-disable-next-line @next/next/no-img-element
    chemin ? <img src={urlFichier(chemin)} alt={alt} loading="lazy" /> : <span className="im-vide"><Icone nom="photo" taille={18} /></span>;

  const trace = (chemin: string | null, masque: boolean, fond: "clair" | "sombre", titre: string) => (
    <span className={`im-trace im-trace-${fond}`} title={titre}>
      {chemin ? (
        masque
          ? <span className="im-masque" style={{ WebkitMaskImage: `url("${urlFichier(chemin)}")`, maskImage: `url("${urlFichier(chemin)}")` }} role="img" aria-label={titre} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={urlFichier(chemin)} alt={titre} />
      ) : <span className="im-vide"><Icone nom="photo" taille={18} /></span>}
    </span>
  );

  const legender = (e: "ouverture" | "recit", alt: string) => { void envoyer(e, "legender", { [`alt.${e}`]: alt }); };

  const logo = images.logo;
  return (
    <section className="carte im-carte" aria-labelledby="t-images"
      style={{ "--im-fond": teintes.fond, "--im-encre": teintes.encre, "--im-surface": teintes.surface } as React.CSSProperties}>
      <div className="carte-tete">
        <div>
          <h2 id="t-images">Logo et images</h2>
          <p>Chaque image est enregistrée dès son envoi, et paraît sur la boutique d&apos;ici cinq minutes. Glissez un fichier sur sa ligne, ou choisissez-le.</p>
        </div>
      </div>

      <div className="im-liste">
        {ligne("logo", (
          <span className="im-paire">
            {trace(logo?.chemin ?? null, logo?.mode !== "image", "clair", "Logo sur fond clair")}
            {trace(logo?.chemin ?? null, logo?.mode !== "image", "sombre", "Logo sur le pied de page")}
          </span>
        ), Boolean(logo), logo ? (
          <ModeLogo key={logo.mode} mode={logo.mode} occupe={etat("logo").phase !== "repos"}
            surChoix={(m) => { if (pret) void envoyer("logo", "mode", { logo_mode: m }); }} />
        ) : <p className="aide">Sans logo, le nom de la boutique s&apos;écrit dans la police des titres.</p>)}

        {ligne("monogramme", trace(images.monogramme, true, "clair", "Monogramme"), Boolean(images.monogramme))}
        {ligne("favicon", (
          <span className="im-onglet">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className="im-onglet-icone">{images.favicon ? <img src={urlFichier(images.favicon)} alt="Icône d'onglet" /> : null}</span>
            <span className="im-onglet-nom" aria-hidden="true" />
          </span>
        ), Boolean(images.favicon))}

        {images.ouverture ? (
          <>
            {ligne("ouverture", photo(images.ouverture.chemin, images.ouverture.alt), Boolean(images.ouverture.chemin), (
              <Description key={images.ouverture.alt} e="ouverture" alt={images.ouverture.alt} actif={Boolean(images.ouverture.chemin)}
                occupe={etat("ouverture").phase !== "repos"} action={action} surEnvoi={legender} pret={pret} />
            ))}
            {images.ouverture.chemin
              ? ligne("ouverture_portrait", photo(images.ouverture.portrait), Boolean(images.ouverture.portrait), undefined, true)
              : null}
          </>
        ) : null}
        {images.recit ? ligne("recit", photo(images.recit.chemin, images.recit.alt), Boolean(images.recit.chemin), (
          <Description key={images.recit.alt} e="recit" alt={images.recit.alt} actif={Boolean(images.recit.chemin)}
            occupe={etat("recit").phase !== "repos"} action={action} surEnvoi={legender} pret={pret} />
        )) : null}
      </div>
    </section>
  );
}

/** Monochrome ou en couleurs : coché dès le clic, enregistré aussitôt ; la
 *  réponse du serveur remonte le composant (clé) sur le mode enregistré. */
function ModeLogo({ mode, occupe, surChoix }: { mode: "masque" | "image"; occupe: boolean; surChoix: (m: "masque" | "image") => void }) {
  const [choix, setChoix] = useState(mode);
  return (
    <fieldset className="im-mode">
      <legend className="sr-only">Affichage du logo</legend>
      {(["masque", "image"] as const).map((m) => (
        <label key={m} className="opt">
          <input type="radio" name="logo_mode" value={m} checked={choix === m} disabled={occupe}
            onChange={() => { setChoix(m); surChoix(m); }} />
          {m === "masque" ? "Monochrome : à la couleur du texte, clair sur le pied" : "Avec ses propres couleurs"}
        </label>
      ))}
    </fieldset>
  );
}

/** Ce que montre la photo : lu aux personnes aveugles et par Google. */
function Description({ e, alt, actif, occupe, action, surEnvoi: envoi, pret }: {
  e: "ouverture" | "recit"; alt: string; actif: boolean; occupe: boolean; action: string; surEnvoi: (e: "ouverture" | "recit", alt: string) => void; pret: boolean;
}) {
  const surEnvoi = (texte: string) => envoi(e, texte);
  const [texte, setTexte] = useState(alt);
  const champ = useRef<HTMLInputElement>(null);
  if (!actif) return null;
  const change = texte.trim() !== alt;
  return (
    <div className="im-description">
      <label htmlFor={`alt-${e}`} className="im-description-libelle">Ce que montre la photo</label>
      <div className="im-description-rang">
        <input
          ref={champ} id={`alt-${e}`} name={`alt.${e}`} className="entree" maxLength={200} value={texte}
          placeholder={e === "ouverture" ? "Ex. : valise rouge dans une salle d'embarquement" : "Ex. : sac de voyage posé sur un parquet"}
          onChange={(ev) => setTexte(ev.target.value)}
          onKeyDown={(ev) => {
            // Entrée enregistre la description, pas toute la marque.
            if (ev.key === "Enter") { ev.preventDefault(); if (pret && change) surEnvoi(texte); }
          }}
        />
        <button
          type="submit" className="btn btn-second btn-petit" formAction={action} formEncType="multipart/form-data" name="geste" value={`legender:${e}`}
          disabled={occupe || (pret && !change)}
          onClick={(ev) => { if (!pret) return; ev.preventDefault(); surEnvoi(texte); }}
        >
          Enregistrer
        </button>
      </div>
      <p className="aide">Lu aux personnes aveugles, et par Google. Une phrase simple.</p>
    </div>
  );
}
