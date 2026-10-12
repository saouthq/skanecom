// M4 : les fournisseurs, essayés (en local, les simulateurs du relais répondent), souris, clavier, téléphone.
import { mkdirSync } from "node:fs";
import { nav, connecte, C, S } from "./console-outils.mjs";
const D = `${S}/m4-captures`;
mkdirSync(D, { recursive: true });
const bilan = [];
const note = (ok, quoi) => { bilan.push(`${ok ? "✔" : "✘"} ${quoi}`); console.log(`${ok ? "✔" : "✘"} ${quoi}`); };

const ctx = await nav.newContext({ viewport: { width: 1366, height: 860 }, locale: "fr-FR" });
const p = await ctx.newPage();
const erreursConsole = [];
p.on("console", (m) => { if (m.type() === "error") erreursConsole.push(m.text()); });
await connecte(p);
await p.goto(C + "/etat#t-fournisseurs", { waitUntil: "networkidle" });
const carte = p.locator('section[aria-labelledby="t-fournisseurs"]');
await carte.scrollIntoViewIfNeeded();
note((await carte.locator(".et-tete .ui-etat").innerText()) === "Pas encore essayés", "au départ : « Pas encore essayés »");
await carte.screenshot({ path: `${D}/1-avant.png` });
// Au clavier.
await carte.getByRole("button", { name: "Essayer maintenant" }).focus();
await p.keyboard.press("Enter");
await p.waitForURL(/carte=fournisseurs/, { timeout: 60000 });
const msg = await carte.locator(".message").innerText();
note(/^Essayés : \d répond/.test(msg), `au clavier : « ${msg} »`);
const t = await carte.innerText();
note(/E-mails[\s\S]*répond en [\d\s ]+ ms[\s\S]*simulé en local/.test(t), "les e-mails : le simulateur de Resend répond, en … ms");
note(/SkanFact[\s\S]*répond en/.test(t), "SkanFact : le simulateur répond, la clé est lue");
note(/Konnect[\s\S]*répond en/.test(t), "Konnect : l'API répond");
note(/Cloudflare[\s\S]*répond en/.test(t), "Cloudflare : le simulateur répond");
note(/SMS[\s\S]*journal du relais/.test(t), "les SMS : en local, vers le journal du relais (rien à essayer)");
await carte.screenshot({ path: `${D}/2-apres.png` });
await p.goto(C + "/journal", { waitUntil: "networkidle" });
note((await p.locator("main").innerText()).includes("Fournisseurs essayés à la main"), "au journal : « Fournisseurs essayés à la main »");
note(!erreursConsole.length, `aucune erreur au navigateur (${erreursConsole.length})`);
await ctx.close();

const tc = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
const q = await tc.newPage();
await connecte(q);
await q.goto(C + "/etat#t-fournisseurs", { waitUntil: "networkidle" });
const c2 = q.locator('section[aria-labelledby="t-fournisseurs"]');
await c2.getByRole("button", { name: "Essayer maintenant" }).tap();
await q.waitForURL(/carte=fournisseurs/, { timeout: 60000 });
note(!(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "téléphone : rien ne dépasse, essayé d'un toucher");
await c2.screenshot({ path: `${D}/3-tel.png` });
await tc.close();
await nav.close();
console.log("\n" + bilan.join("\n"));
