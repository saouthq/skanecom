// Préchauffer une version de l'application, boutique par boutique, avant de
// lui donner le trafic (déploiement en deux temps, docs/DEPLOIEMENT.md).
//
// vinext-cloudflare sait préchauffer UNE adresse (--warm-cache-target) ; une
// plateforme en sert plusieurs, chacune sous son domaine. Ce script fait le
// reste : pour chaque boutique, il lit son plan du site (/sitemap.xml) puis
// ouvre chaque page en visant la version déposée à 0 % du trafic — l'en-tête
// Cloudflare-Workers-Version-Overrides, qui passe aussi par les routeurs de
// l'aperçu (liaison de service, la requête d'origine est transmise).
//
//   WORKER=skanecom-application VERSION=<id> \
//   CIBLES="https://maymar.tn https://dar-alia.tn" node outils/prechauffer.mjs
//
// Variables : WORKER, VERSION, CIBLES (adresses https, séparées par des espaces
// ou des virgules), PAGES_MAX (par boutique, 150), PARALLELE (6), DELAI_MS (15000).
// Sortie en erreur si l'accueil d'une boutique ne répond pas 200 : la version
// n'est alors pas promue (la précédente garde 100 % du trafic).

const WORKER = process.env.WORKER ?? "skanecom-application";
const VERSION = process.env.VERSION ?? "";
const CIBLES = (process.env.CIBLES ?? "").split(/[\s,]+/).filter(Boolean);
const PAGES_MAX = Number(process.env.PAGES_MAX ?? 150);
const PARALLELE = Number(process.env.PARALLELE ?? 6);
const DELAI_MS = Number(process.env.DELAI_MS ?? 15000);

if (!/^[0-9a-f-]{36}$/i.test(VERSION)) {
  console.error("VERSION attendue : l'identifiant de la version déposée (wrangler versions upload).");
  process.exit(2);
}
if (CIBLES.length === 0) {
  console.error("CIBLES attendues : les adresses https des boutiques à préchauffer.");
  process.exit(2);
}

const ENTETES = {
  "Cloudflare-Workers-Version-Overrides": `${WORKER}="${VERSION}"`,
  "User-Agent": "skanecom-prechauffage",
  Accept: "text/html,application/xhtml+xml",
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function ouvre(url) {
  const minuterie = AbortSignal.timeout(DELAI_MS);
  try {
    const r = await fetch(url, { headers: ENTETES, redirect: "manual", signal: minuterie });
    await r.arrayBuffer();
    return r.status;
  } catch {
    return 0;
  }
}

/** Le plan du site de la boutique, lu sur la version déposée. Une version
 *  toute neuve met quelques secondes à se propager : on réessaie. */
async function planDuSite(origine) {
  for (let essai = 1; essai <= 30; essai++) {
    try {
      const r = await fetch(`${origine}/sitemap.xml`, { headers: ENTETES, signal: AbortSignal.timeout(DELAI_MS) });
      if (r.ok) {
        // Le plan donne les adresses sous le domaine canonique de la boutique
        // (le sien, ou celui de l'annuaire) : il vient d'elle, on en garde
        // les chemins, ouverts sous l'adresse visée.
        const xml = await r.text();
        const chemins = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
          .map((m) => { try { return new URL(m[1]); } catch { return null; } })
          .filter(Boolean)
          .map((u) => u.pathname + u.search);
        return [...new Set(["/", ...chemins])].slice(0, PAGES_MAX);
      }
    } catch { /* réessayé */ }
    await pause(2000);
  }
  return ["/"];
}

async function prechauffe(origine) {
  const chemins = await planDuSite(origine);
  const resultats = new Map();
  let suivant = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLELE, chemins.length) }, async () => {
    while (suivant < chemins.length) {
      const chemin = chemins[suivant++];
      let statut = await ouvre(origine + chemin);
      if (statut === 0 || statut >= 500) statut = await ouvre(origine + chemin); // une seconde chance
      resultats.set(chemin, statut);
    }
  }));
  const ok = [...resultats.values()].filter((s) => s >= 200 && s < 400).length;
  const echecs = [...resultats].filter(([, s]) => s === 0 || s >= 500);
  return { origine, pages: chemins.length, ok, echecs, accueil: resultats.get("/") };
}

const bilans = [];
for (const origine of CIBLES) {
  const b = await prechauffe(origine.replace(/\/$/, ""));
  bilans.push(b);
  console.log(`${b.origine} : ${b.ok}/${b.pages} pages préchauffées, accueil HTTP ${b.accueil}` +
    (b.echecs.length ? ` ; en échec : ${b.echecs.slice(0, 5).map(([c, s]) => `${c} (${s || "délai"})`).join(", ")}` : ""));
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    "", `### Préchauffage de la version ${VERSION}`, "", "| Boutique | Pages | Accueil |", "|---|---|---|",
    ...bilans.map((b) => `| ${b.origine} | ${b.ok}/${b.pages} | HTTP ${b.accueil} |`), "",
  ].join("\n"));
}

const enPanne = bilans.filter((b) => b.accueil !== 200);
if (enPanne.length) {
  console.error(`Accueil injoignable sur la version déposée : ${enPanne.map((b) => b.origine).join(", ")}. Pas de promotion.`);
  process.exit(1);
}
