/* Le contrôle de l'aperçu EN LIGNE : ce que voit vraiment un visiteur.
   Pour chaque boutique, sur grand écran et sur téléphone, l'accueil, le
   catalogue et la première fiche : les polices chargées (ou en échec), les
   images cassées, les réponses en erreur, les erreurs JavaScript — et une
   capture de chaque page (JPEG, artefact du workflow de l'aperçu).

     SITES="maymar=https://…,selma=https://…" CAPTURES=dossier node essais/controle-en-ligne.mjs

   Le bilan s'écrit aussi dans le résumé du workflow (GITHUB_STEP_SUMMARY).
   Code de sortie 1 au premier défaut constaté. */
import { chromium } from "playwright-core";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";

const SORTIE = process.env.CAPTURES ?? "../.outils/captures/en-ligne";
mkdirSync(SORTIE, { recursive: true });
const sites = (process.env.SITES ?? "").split(",").filter(Boolean).map((s) => s.split("=", 2));
if (!sites.length) { console.error("SITES attendu : nom=https://…,nom=https://…"); process.exit(2); }
const resume = process.env.GITHUB_STEP_SUMMARY;
const ecrire = (ligne) => { console.log(ligne); if (resume) appendFileSync(resume, `${ligne}\n`); };

const chromiumPoste = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
// (*.localhost → 127.0.0.1 : pour essayer le contrôle sur la vitrine locale.)
const navigateur = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? chromiumPoste,
  args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"],
});
let defauts = 0;

ecrire("\n## Ce que voit un visiteur\n");
ecrire("| Page | Écran | Polices | Images | Erreurs |");
ecrire("|---|---|---|---|---|");

for (const [ecran, options] of [
  ["ordinateur", { viewport: { width: 1440, height: 900 } }],
  ["téléphone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  for (const [nom, base] of sites) {
    const contexte = await navigateur.newContext({ ...options, locale: "fr-FR" });
    const page = await contexte.newPage();
    let erreurs = [];
    page.on("response", (r) => { if (r.status() >= 400) erreurs.push(`HTTP ${r.status()} ${r.url()}`); });
    page.on("requestfailed", (r) => erreurs.push(`échec (${r.failure()?.errorText}) ${r.url()}`));
    page.on("pageerror", (e) => erreurs.push(`JavaScript : ${String(e).slice(0, 200)}`));

    const chemins = ["/", "/catalogue"];
    for (let i = 0; i < chemins.length; i++) {
      const chemin = chemins[i];
      erreurs = [];
      const debut = Date.now();
      try {
        await page.goto(base + chemin, { waitUntil: "networkidle", timeout: 60_000 });
      } catch (e) {
        defauts++;
        ecrire(`| ${nom} ${chemin} | ${ecran} | — | — | ne charge pas : ${String(e).slice(0, 120)} |`);
        continue;
      }
      const duree = Date.now() - debut;
      if (chemin === "/catalogue") {
        const fiche = await page.locator("a[href^='/produit/']").first().getAttribute("href").catch(() => null);
        if (fiche) chemins.push(fiche);
      }
      // Défiler comme un visiteur : les images hors écran se chargent.
      const etat = await page.evaluate(async () => {
        document.documentElement.style.scrollBehavior = "auto";
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 150));
        }
        window.scrollTo(0, 0);
        document.documentElement.classList.remove("js-apparitions");
        await document.fonts.ready;
        await new Promise((r) => setTimeout(r, 800));
        const polices = [...document.fonts].map((f) => ({ famille: f.family.replace(/"/g, ""), etat: f.status }));
        const titre = document.querySelector("h1");
        const rendu = (el) => (el ? getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "").trim() : null);
        return {
          enErreur: [...new Set(polices.filter((p) => p.etat === "error").map((p) => p.famille))],
          chargees: [...new Set(polices.filter((p) => p.etat === "loaded").map((p) => p.famille))],
          titre: rendu(titre),
          titreDispo: titre ? document.fonts.check(`32px "${rendu(titre)}"`) : true,
          texte: rendu(document.body),
          texteDispo: document.fonts.check(`16px "${rendu(document.body)}"`),
          images: document.images.length,
          cassees: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc),
          enAttente: [...document.images].filter((i) => !i.complete).length,
        };
      });
      await page.waitForLoadState("networkidle").catch(() => {});
      const fichier = `${SORTIE}/${ecran === "téléphone" ? "telephone" : "ordinateur"}-${nom}-${chemin.replace(/[/?=]+/g, "_").replace(/^_|_$/g, "") || "accueil"}.jpg`;
      await page.screenshot({ path: fichier, type: "jpeg", quality: 72, fullPage: true });

      const policesOk = etat.enErreur.length === 0 && etat.titreDispo && etat.texteDispo;
      const imagesOk = etat.cassees.length === 0;
      const erreursOk = erreurs.length === 0;
      if (!policesOk || !imagesOk || !erreursOk) defauts++;
      ecrire(
        `| ${nom} ${chemin} (${(duree / 1000).toFixed(1)} s) | ${ecran} | ` +
          `${policesOk ? "✓" : "✗"} titres ${etat.titre}, texte ${etat.texte}${etat.enErreur.length ? ` — en échec : ${etat.enErreur.join(", ")}` : ""} | ` +
          `${imagesOk ? "✓" : "✗"} ${etat.images} image(s)${etat.cassees.length ? `, ${etat.cassees.length} cassée(s)` : ""}${etat.enAttente ? `, ${etat.enAttente} en attente` : ""} | ` +
          `${erreursOk ? "✓" : `✗ ${erreurs.length}`} |`,
      );
      for (const x of [...etat.cassees.map((u) => `image cassée ${u}`), ...erreurs].slice(0, 8)) console.log(`    ${x}`);
    }
    await contexte.close();
  }
}
await navigateur.close();
ecrire(defauts ? `\n**${defauts} page(s) avec un défaut** (détail dans le journal de l'étape).` : "\nAucun défaut : polices, images et réponses en ordre.");
process.exit(defauts ? 1 : 0);
