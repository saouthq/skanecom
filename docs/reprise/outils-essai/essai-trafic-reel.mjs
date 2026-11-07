// Le trafic lu pour de vrai chez Cloudflare depuis le moteur des Workers (workerd, en local), avec une
// clé donnée (CLE=compte:<id>:<jeton>, par défaut une fausse : Cloudflare doit la refuser sur-le-champ,
// pas laisser attendre). « Relire maintenant » au clavier ; le message et la durée.
// Lancer depuis la racine du dépôt, l'API locale démarrée : node docs/reprise/outils-essai/essai-trafic-reel.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { nav, connecte, C, S } from "./console-outils.mjs";
const VARS = new URL("../../../application/.dev.vars", import.meta.url).pathname;
const origine = readFileSync(VARS, "utf8");
const cle = process.env.CLE ?? "compte:00000000000000000000000000000000:fausse-cle-essai";
const relance = () => execFileSync(new URL("./redemarre-app.sh", import.meta.url).pathname, { env: { ...process.env, ESSAIS: S } });
try {
  writeFileSync(VARS, origine.replace(/^CLOUDFLARE_TRAFIC=.*$/m, `CLOUDFLARE_TRAFIC=${cle}`));
  relance();
  const p = await (await nav.newContext({ viewport: { width: 1366, height: 860 }, locale: "fr-FR" })).newPage();
  await connecte(p);
  await p.goto(C + "/etat#t-trafic", { waitUntil: "networkidle" });
  const carte = p.locator('section[aria-labelledby="t-trafic"]');
  await carte.getByRole("button", { name: "Relire maintenant" }).focus();
  const debut = Date.now();
  await p.keyboard.press("Enter");
  await p.waitForURL(/carte=trafic/, { timeout: 90000 });
  console.log(`« ${(await carte.locator(".message").first().innerText()).trim()} » en ${((Date.now() - debut) / 1000).toFixed(1)} s`);
  console.log(`l'état : ${(await carte.locator(".et-tete").innerText()).replace(/\s+/g, " ").trim()}`);
} finally {
  writeFileSync(VARS, origine);
  relance();
  await nav.close();
}
