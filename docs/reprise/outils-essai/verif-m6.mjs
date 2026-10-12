// M6 (diagnostic, fiches réflexes) : souris, clavier, téléphone, en captures.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { nav, connecte, C, S } from "./console-outils.mjs";
const D = `${S}/m3m6-captures`;
mkdirSync(D, { recursive: true });
const bilan = [];
const note = (ok, quoi) => { bilan.push(`${ok ? "✔" : "✘"} ${quoi}`); console.log(`${ok ? "✔" : "✘"} ${quoi}`); };
const sql = (q) => execFileSync("psql", ["-X", "-q", "-t", "-A", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "skanecom", "-c", q]).toString().trim();

const ctx = await nav.newContext({ viewport: { width: 1366, height: 860 }, locale: "fr-FR" });
const p = await ctx.newPage();
const erreursConsole = [];
p.on("console", (m) => { if (m.type() === "error") erreursConsole.push(m.text()); });
await connecte(p);

// ---- M6 : le diagnostic de Maymar ----
await p.goto(C + "/boutiques/maymar", { waitUntil: "networkidle" });
const onglet = p.locator(".onglets").getByRole("link", { name: "Diagnostic" });
await onglet.focus();
await p.keyboard.press("Enter");
await p.waitForURL(/\/boutiques\/maymar\/diagnostic$/);
note(true, "l'onglet « Diagnostic » de la fiche, au clavier");
const liste = p.locator(".dg-liste");
let tl = await liste.innerText();
note(/Sa vitrine[\s\S]*maymar\.localhost répond 200 en [\d\s ]+ ms/.test(tl), "la vitrine essayée à l'instant : « maymar.localhost répond 200 en … ms »");
note(["Son statut", "Ses erreurs", "Ses e-mails de commande", "Son catalogue", "Sa livraison", "Son paiement", "Ses commandes"].every((x) => tl.includes(x)), "chaque point : statut, erreurs, e-mails, catalogue, livraison, paiement, commandes");
const verdict = await p.locator(".et-verdict-titre").innerText();
note(verdict.length > 0, `le verdict : « ${verdict} »`);
await p.screenshot({ path: `${D}/3-diagnostic-maymar.png`, fullPage: true });

// Ce qui bloque : plus aucune zone de livraison active (le décor), puis la vitrine en maintenance.
const zones = sql("select string_agg(id::text, ',') from public.zones_livraison z where z.boutique_id = (select id from plateforme.boutiques where slug = 'maymar') and z.actif");
sql(`update public.zones_livraison set actif = false where id in (${zones.split(",").map((x) => `'${x}'`).join(",")})`);
await p.reload({ waitUntil: "networkidle" });
const premier = p.locator(".dg-liste > li").first();
note((await premier.getAttribute("data-niveau")) === "panne" && (await premier.innerText()).includes("Aucune zone de livraison active"), "plus de zone de livraison : le point « Bloque » passe en tête, avec quoi faire");
note((await p.locator(".et-verdict-titre").innerText()).includes("qui bloque"), `le verdict le dit : « ${await p.locator(".et-verdict-titre").innerText()} »`);
await p.screenshot({ path: `${D}/4-diagnostic-bloque.png`, fullPage: true });
sql(`update public.zones_livraison set actif = true where id in (${zones.split(",").map((x) => `'${x}'`).join(",")})`);

// ---- M6 : les fiches réflexes ----
await p.goto(C + "/etat#t-reflexes", { waitUntil: "networkidle" });
const rf = p.locator('section[aria-labelledby="t-reflexes"]');
await rf.scrollIntoViewIfNeeded();
note((await rf.locator("details.rf").count()) >= 6, `les fiches réflexes : ${await rf.locator("details.rf").count()} symptômes`);
const fiche = rf.locator("details.rf").first();
await fiche.locator("summary").focus();
await p.keyboard.press("Enter");
note(await fiche.evaluate((d) => d.open), "une fiche s'ouvre au clavier");
await fiche.getByRole("link", { name: "mettre en maintenance" }).click();
note(p.url().endsWith("#t-depannage"), "son lien mène au geste (le dépannage)");
await rf.screenshot({ path: `${D}/5-reflexes.png` });
note(!erreursConsole.length, `aucune erreur au navigateur (${erreursConsole.length})`);
await ctx.close();

// ---- Au téléphone ----
const t = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
const q = await t.newPage();
await connecte(q);
await q.goto(C + "/boutiques/maymar/diagnostic", { waitUntil: "networkidle" });
note(!(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "téléphone, le diagnostic : rien ne dépasse");
await q.screenshot({ path: `${D}/6-tel-diagnostic.png`, fullPage: true });
await q.goto(C + "/etat#t-reflexes", { waitUntil: "networkidle" });
note(!(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "téléphone, l'État : rien ne dépasse");
await q.locator('section[aria-labelledby="t-reflexes"]').screenshot({ path: `${D}/8-tel-reflexes.png` });
await t.close();
await nav.close();
console.log("\n" + bilan.join("\n"));
