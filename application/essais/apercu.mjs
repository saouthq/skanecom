/* Aperçu rapide : captures des pages clés des cinq boutiques, sur grand
   écran et sur téléphone. Sert à relire le rendu ; les parcours
   (parcours-humain.mjs) vérifient le comportement.

     cd application && CAPTURES=dossier BASE=http://127.0.0.1:4200 node essais/apercu.mjs [boutique…]
   (par défaut, les captures vont dans .outils/captures/apercu, à la racine
   du dépôt, comme celles des parcours) */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:4200";
const SORTIE = process.env.CAPTURES ?? "../.outils/captures/apercu";
const port = new URL(BASE).port;
mkdirSync(SORTIE, { recursive: true });

const PAGES = {
  mode: ["/", "/catalogue", "/categorie/robes", "/produit/robe-bretelles-terracotta", "/produit/polo-coton-pique"],
  maymar: ["/", "/catalogue", "/produit/valise-rigide-abs-4-roues"],
  quincaillerie: ["/", "/catalogue", "/categorie/outillage", "/produit/perceuse-visseuse-18v", "/produit/scie-circulaire-1400w"],
  beaute: ["/", "/categorie/soins-du-visage", "/produit/huile-figue-de-barbarie", "/produit/vernis-a-ongles"],
  maison: ["/", "/categorie/decoration", "/produit/kilim-tisse-main", "/produit/serviettes-table-lin"],
};
const choix = process.argv.slice(2);
const navigateur = await chromium.launch({ args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"] });
for (const [ecran, options] of [
  ["bureau", { viewport: { width: 1440, height: 900 } }],
  ["mobile", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  const contexte = await navigateur.newContext(options);
  const page = await contexte.newPage();
  for (const [boutique, chemins] of Object.entries(PAGES)) {
    if (choix.length && !choix.includes(boutique)) continue;
    for (const chemin of chemins) {
      await page.goto(`http://${boutique}.localhost:${port}${chemin}`, { waitUntil: "networkidle" });
      // Défiler comme un visiteur : les images hors écran se chargent.
      // (défilement instantané : le défilement doux de la page n'aurait pas
      // fini de remonter au moment de la capture)
      await page.evaluate(async () => {
        document.documentElement.style.scrollBehavior = "auto";
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
        window.scrollTo(0, 0);
        // Tout est posé d'emblée pour la capture (les apparitions au défilement).
        document.documentElement.classList.remove("js-apparitions");
        await new Promise((r) => setTimeout(r, 200));
      });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      const nom = `${ecran}-${boutique}-${chemin.replace(/[/?=]+/g, "_").replace(/^_|_$/g, "") || "accueil"}`;
      await page.screenshot({ path: `${SORTIE}/${nom}.png`, fullPage: true });
      console.log(nom);
    }
  }
  await contexte.close();
}
await navigateur.close();
