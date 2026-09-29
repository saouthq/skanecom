// Photos de démonstration SkanEcom, depuis Openverse (moteur d'images libres
// de WordPress.org) : images sous CC0 ou dans le domaine public, utilisables
// sans condition. Nous créditons quand même chaque photo.
// Tourne dans GitHub Actions (le poste de développement n'a pas accès à
// Internet) :
//   node outils/photos-demo/photos.mjs candidats → planches contact (candidats.json) dans outils/photos-demo/candidats/
//   node outils/photos-demo/photos.mjs final     → photos retenues (choix.json) en WebP dans supabase/fichiers-demo/
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "../..");
const API = "https://api.openverse.org/v1/images";
const UA = { "user-agent": "SkanEcom-photos-demo/1.0 (+https://github.com/saouthq/skanecom)" };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) {
  for (let essai = 0; essai < 3; essai++) {
    const r = await fetch(url, { headers: { ...UA, accept: "application/json" } });
    if (r.ok) return r.json();
    if (r.status === 429) { await pause(5000 * (essai + 1)); continue; }
    throw new Error(`${url} : HTTP ${r.status}`);
  }
  throw new Error(`${url} : trop de requêtes`);
}

async function telecharge(url, fichier) {
  const r = await fetch(url, { headers: UA, redirect: "follow" });
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  mkdirSync(path.dirname(fichier), { recursive: true });
  writeFileSync(fichier, Buffer.from(await r.arrayBuffer()));
}

async function candidats() {
  const groupes = JSON.parse(readFileSync(path.join(ICI, "candidats.json"), "utf8"));
  const sortie = path.join(ICI, "candidats");
  rmSync(sortie, { recursive: true, force: true });
  mkdirSync(sortie, { recursive: true });
  const tmp = path.join(RACINE, ".outils/photos-tmp");
  rmSync(tmp, { recursive: true, force: true });
  const index = {};
  for (const [groupe, { q, rapport, sources }] of Object.entries(groupes)) {
    if (groupe === "_") continue;
    const params = new URLSearchParams({ q, license: "cc0,pdm", page_size: "20", mature: "false" });
    if (rapport) params.set("aspect_ratio", rapport);
    if (sources) params.set("source", sources);
    let resultats = [];
    try {
      ({ results: resultats } = await json(`${API}/?${params}`));
    } catch (e) {
      console.log(`${groupe} : ${e.message}`);
      continue;
    }
    const vignettes = [];
    for (const [i, p] of resultats.entries()) {
      const f = path.join(tmp, groupe, `${String(i + 1).padStart(2, "0")}.jpg`);
      try {
        await telecharge(p.thumbnail ?? p.url, f);
        vignettes.push({ f, n: i + 1 });
        (index[groupe] ??= []).push({
          n: i + 1, id: p.id, titre: p.title, auteur: p.creator, source: p.source, licence: p.license,
          page: p.foreign_landing_url, largeur: p.width, hauteur: p.height,
        });
      } catch (e) {
        console.log(`${groupe} n°${i + 1} : ${e.message}`);
      }
    }
    if (vignettes.length === 0) continue;
    execFileSync("montage", [
      ...vignettes.flatMap((v) => ["-label", String(v.n), v.f]),
      "-tile", "5x", "-geometry", "300x300>+6+6", "-pointsize", "26", "-background", "#ffffff",
      "-quality", "72", path.join(sortie, `${groupe}.jpg`),
    ]);
    console.log(`${groupe} : ${vignettes.length} candidates`);
  }
  writeFileSync(path.join(sortie, "index.json"), JSON.stringify(index, null, 2) + "\n");
}

async function final() {
  const { photos } = JSON.parse(readFileSync(path.join(ICI, "choix.json"), "utf8"));
  if (photos.length === 0) return console.log("Aucune photo retenue pour l'instant.");
  const credits = [];
  const tmp = path.join(RACINE, ".outils/photos-tmp/originaux");
  for (const { id, chemin, largeurs = [1600, 800, 400], rapport, gravite = "center" } of photos) {
    const p = await json(`${API}/${id}/`);
    const original = path.join(tmp, `${id}`);
    await telecharge(p.url, original);
    for (const w of largeurs) {
      const cible = path.join(RACINE, "supabase/fichiers-demo", `${chemin}-${w}.webp`);
      mkdirSync(path.dirname(cible), { recursive: true });
      // Recadrage au rapport voulu (hauteur / largeur), puis WebP.
      const recadre = rapport ? ["-resize", `${w}x${Math.round(w * rapport)}^`, "-gravity", gravite, "-extent", `${w}x${Math.round(w * rapport)}`] : ["-resize", `${w}x`];
      execFileSync("convert", [original, "-auto-orient", "-strip", ...recadre, "-quality", "78", cible]);
    }
    const qui = p.creator ? (p.creator_url ? `[${p.creator}](${p.creator_url})` : p.creator) : "—";
    credits.push(`| \`${chemin}\` | ${qui} | ${p.license.toUpperCase()} | [${p.source}](${p.foreign_landing_url}) |`);
    console.log(`${chemin} ← ${id}`);
  }
  writeFileSync(path.join(RACINE, "supabase/fichiers-demo/CREDITS.md"),
    "# Photos de démonstration\n\nImages trouvées avec [Openverse](https://openverse.org), sous CC0 ou dans le domaine public : utilisables sans condition, y compris commerciale. Elles habillent les boutiques de démonstration et ne sont jamais présentées comme les photos d'un vrai client.\n\n| Fichier | Auteur | Licence | Source |\n|---|---|---|---|\n" +
    credits.join("\n") + "\n");
}

const mode = process.argv[2];
if (mode === "candidats") await candidats();
else if (mode === "final") await final();
else { console.error("usage : photos.mjs candidats|final"); process.exit(1); }
