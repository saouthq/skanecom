// Photos de démonstration SkanEcom, depuis Unsplash (licence Unsplash :
// usage libre, commercial compris ; nous créditons quand même chaque photo).
// Tourne dans GitHub Actions (le poste de développement n'a pas accès à
// Internet) :
//   node outils/photos-demo/photos.mjs candidats   → planches contact (candidats.json) dans outils/photos-demo/candidats/
//   node outils/photos-demo/photos.mjs final       → photos retenues (choix.json) dans supabase/fichiers-demo/
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "../..");
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36", accept: "application/json" };

async function json(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  return r.json();
}

async function telecharge(url, fichier) {
  const r = await fetch(url, { headers: { "user-agent": UA["user-agent"] } });
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  mkdirSync(path.dirname(fichier), { recursive: true });
  writeFileSync(fichier, Buffer.from(await r.arrayBuffer()));
}

/* L'adresse de l'image d'une photo, sans clé d'API : le lien « Télécharger »
   public redirige vers images.unsplash.com ; à défaut, l'image de partage
   (og:image) de la page de la photo. Et ce que la page dit de l'auteur. */
async function source(id) {
  let image = null;
  const r = await fetch(`https://unsplash.com/photos/${id}/download?force=true`, { headers: { "user-agent": UA["user-agent"] }, redirect: "manual" });
  const lieu = r.headers.get("location");
  if (lieu && lieu.includes("images.unsplash.com")) image = lieu;
  let auteur = null;
  let titre = null;
  const page = await fetch(`https://unsplash.com/photos/${id}`, { headers: { "user-agent": UA["user-agent"], accept: "text/html" } });
  if (page.ok) {
    const html = await page.text();
    image ??= /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, "&") ?? null;
    titre = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/.exec(html)?.[1] ?? null;
    auteur = /"user":\{"id":"[^"]+","updated_at":"[^"]*","username":"([^"]+)","name":"([^"]+)"/.exec(html)?.slice(1) ?? null;
  }
  if (!image) throw new Error(`photo ${id} : image introuvable (${r.status}, page ${page.status})`);
  const base = new URL(image);
  for (const k of ["w", "h", "fit", "crop", "fm", "q", "dl", "force"]) base.searchParams.delete(k);
  return { base: base.toString(), titre, auteur: auteur ? { username: auteur[0], nom: auteur[1] } : null };
}

function taille(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

async function candidats() {
  const groupes = JSON.parse(readFileSync(path.join(ICI, "candidats.json"), "utf8"));
  const sortie = path.join(ICI, "candidats");
  rmSync(sortie, { recursive: true, force: true });
  const tmp = path.join(RACINE, ".outils/photos-tmp");
  rmSync(tmp, { recursive: true, force: true });
  const index = {};
  for (const [groupe, ids] of Object.entries(groupes)) {
    if (groupe === "_") continue;
    const vignettes = [];
    for (const [i, id] of ids.entries()) {
      try {
        const s = await source(id);
        const f = path.join(tmp, groupe, `${String(i + 1).padStart(2, "0")}.jpg`);
        await telecharge(taille(s.base, { w: 360, h: 450, fit: "crop", crop: "entropy", q: 70, fm: "jpg" }), f);
        vignettes.push({ f, n: i + 1 });
        (index[groupe] ??= []).push({ n: i + 1, id, titre: s.titre, auteur: s.auteur });
      } catch (e) {
        console.log(`${groupe} n°${i + 1} (${id}) : ${e.message}`);
        (index[groupe] ??= []).push({ n: i + 1, id, erreur: e.message });
      }
    }
    if (vignettes.length === 0) continue;
    const fichier = path.join(sortie, `${groupe.replace("/", "--")}.jpg`);
    mkdirSync(path.dirname(fichier), { recursive: true });
    // Planche contact : 5 colonnes, chaque vignette numérotée comme dans candidats.json.
    execFileSync("montage", [
      ...vignettes.flatMap((v) => ["-label", String(v.n), v.f]),
      "-tile", "5x", "-geometry", "360x450+6+6", "-pointsize", "30", "-background", "#ffffff",
      "-quality", "72", fichier,
    ]);
    console.log(`${groupe} : ${vignettes.length}/${ids.length} photos`);
  }
  writeFileSync(path.join(sortie, "index.json"), JSON.stringify(index, null, 2) + "\n");
}

async function final() {
  const { photos } = JSON.parse(readFileSync(path.join(ICI, "choix.json"), "utf8"));
  if (photos.length === 0) return console.log("Aucune photo retenue pour l'instant.");
  const credits = [];
  for (const { id, chemin, largeurs = [1600, 800, 400], rapport } of photos) {
    const s = await source(id);
    for (const w of largeurs) {
      const params = rapport ? { w, h: Math.round(w * rapport), fit: "crop", crop: "entropy" } : { w };
      await telecharge(taille(s.base, { ...params, q: 78, fm: "webp" }), path.join(RACINE, "supabase/fichiers-demo", `${chemin}-${w}.webp`));
    }
    const qui = s.auteur ? `[${s.auteur.nom}](https://unsplash.com/@${s.auteur.username})` : "—";
    credits.push(`| \`${chemin}\` | ${qui} | [Unsplash](https://unsplash.com/photos/${id}) |`);
    console.log(`${chemin} ← ${id}`);
  }
  writeFileSync(path.join(RACINE, "supabase/fichiers-demo/CREDITS.md"),
    "# Photos de démonstration\n\nPhotos d'[Unsplash](https://unsplash.com), sous la [licence Unsplash](https://unsplash.com/license) (usage libre, y compris commercial). Elles habillent les boutiques de démonstration et ne sont jamais servies comme photos d'un vrai client.\n\n| Fichier | Photographe | Source |\n|---|---|---|\n" +
    credits.join("\n") + "\n");
}

const mode = process.argv[2];
if (mode === "candidats") await candidats();
else if (mode === "final") await final();
else { console.error("usage : photos.mjs candidats|final"); process.exit(1); }
