// Photos de démonstration SkanEcom, depuis Unsplash (licence Unsplash :
// usage libre, commercial compris ; nous créditons quand même chaque photo).
// Tourne dans GitHub Actions (le poste de développement n'a pas accès à
// Internet) :
//   node outils/photos-demo/photos.mjs candidats   → planches contact dans outils/photos-demo/candidats/
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

async function candidats() {
  const requetes = JSON.parse(readFileSync(path.join(ICI, "requetes.json"), "utf8"));
  const sortie = path.join(ICI, "candidats");
  rmSync(sortie, { recursive: true, force: true });
  const tmp = path.join(RACINE, ".outils/photos-tmp");
  rmSync(tmp, { recursive: true, force: true });
  const index = {};
  for (const [boutique, liste] of Object.entries(requetes)) {
    if (boutique === "_") continue;
    for (const { cle, q, orientation } of liste) {
      const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(q)}&per_page=30${orientation ? `&orientation=${orientation}` : ""}`;
      const { results } = await json(url);
      const libres = results.filter((p) => !p.premium && !p.plus && p.urls?.raw).slice(0, 12);
      const vignettes = [];
      for (const [i, p] of libres.entries()) {
        const f = path.join(tmp, boutique, cle, `${String(i + 1).padStart(2, "0")}.jpg`);
        await telecharge(`${p.urls.raw}&w=360&h=360&fit=crop&q=70&fm=jpg`, f);
        vignettes.push(f);
        (index[`${boutique}/${cle}`] ??= []).push({
          n: i + 1, id: p.id, slug: p.slug, alt: p.alt_description, largeur: p.width, hauteur: p.height,
          auteur: p.user?.name, profil: p.user?.links?.html, lien: p.links?.html,
        });
      }
      if (vignettes.length === 0) continue;
      mkdirSync(path.join(sortie, boutique), { recursive: true });
      // Planche contact : 4 colonnes, chaque vignette numérotée.
      execFileSync("montage", [
        ...vignettes.flatMap((v, i) => ["-label", String(i + 1), v]),
        "-tile", "4x", "-geometry", "360x360+6+6", "-pointsize", "28", "-background", "#ffffff",
        "-quality", "72", path.join(sortie, boutique, `${cle}.jpg`),
      ]);
      console.log(`${boutique}/${cle} : ${vignettes.length} candidats`);
    }
  }
  writeFileSync(path.join(sortie, "index.json"), JSON.stringify(index, null, 2) + "\n");
}

async function final() {
  const { photos } = JSON.parse(readFileSync(path.join(ICI, "choix.json"), "utf8"));
  if (photos.length === 0) return console.log("Aucune photo retenue pour l'instant.");
  const credits = [];
  for (const { id, chemin, largeurs = [1600, 800, 400], recadrage } of photos) {
    const p = await json(`https://unsplash.com/napi/photos/${id}`);
    for (const w of largeurs) {
      const crop = recadrage ? `&h=${Math.round(w * recadrage)}&fit=crop&crop=entropy` : "";
      await telecharge(`${p.urls.raw}&w=${w}${crop}&q=78&fm=webp`, path.join(RACINE, "supabase/fichiers-demo", `${chemin}-${w}.webp`));
    }
    credits.push(`| \`${chemin}\` | [${p.user?.name}](${p.user?.links?.html}) | [Unsplash](${p.links?.html}) |`);
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
