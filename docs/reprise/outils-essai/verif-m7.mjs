// M7 : le trafic, lu chez Cloudflare (en local, le simulateur du relais répond) : souris, clavier, téléphone, en captures.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { nav, connecte, C, S } from "./console-outils.mjs";
const D = `${S}/m7-captures`;
mkdirSync(D, { recursive: true });
const bilan = [];
const note = (ok, quoi) => { bilan.push(`${ok ? "✔" : "✘"} ${quoi}`); console.log(`${ok ? "✔" : "✘"} ${quoi}`); };
const sql = (q) => execFileSync("psql", ["-X", "-q", "-t", "-A", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", process.env.BASE_LOCALE_NOM ?? "skanecom", "-c", q]).toString().trim();

const ctx = await nav.newContext({ viewport: { width: 1366, height: 860 }, locale: "fr-FR" });
const p = await ctx.newPage();
const erreurs = [];
p.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
await connecte(p);
await p.goto(C + "/etat#t-trafic", { waitUntil: "networkidle" });
const carte = p.locator('section[aria-labelledby="t-trafic"]');
await carte.scrollIntoViewIfNeeded();
note(/Pas encore lu|Normal|À regarder/.test(await carte.locator(".et-tete").innerText()), `au départ : « ${(await carte.locator(".et-tete .ui-etat").innerText()).trim()} »`);
await carte.screenshot({ path: `${D}/1-avant.png` });

// Au clavier : « Relire maintenant », Entrée.
await carte.getByRole("button", { name: "Relire maintenant" }).focus();
await p.keyboard.press("Enter");
await p.waitForURL(/carte=trafic/, { timeout: 60000 });
const msg = await carte.locator(".message").innerText();
note(msg === "Relu : le trafic des dernières 24 heures est à jour.", `au clavier : « ${msg} »`);
note((await carte.locator(".tr-barres > li").count()) === 24, "vingt-quatre barres, une par heure");
const chiffres = await carte.locator(".tr-chiffres").innerText();
note(/Requêtes, 24 heures\s+[\d  ]+/.test(chiffres) && /Erreurs, 24 heures/.test(chiffres) && /Calcul, médiane\s+[\d,]+ ms/.test(chiffres), "les chiffres : requêtes, erreurs et leur taux, calcul");
note(sql("select count(*) from plateforme.trafic_heures where principal") >= 24, "en base : les heures de l'application");
await carte.screenshot({ path: `${D}/2-apres.png` });

// À la souris : survoler une barre, sa bulle dit l'heure et ses chiffres.
const barre = carte.locator(".tr-barres > li").nth(14);
await barre.hover();
const bulle = barre.locator(".tr-bulle");
note(await bulle.isVisible() && /^\d+ h \d[\d  ]* requêtes?/.test((await bulle.innerText()).replace(/\s+/g, " ")), `au survol : « ${(await bulle.innerText()).replace(/\s+/g, " ")} »`);
await carte.locator(".tr-graphique").screenshot({ path: `${D}/3-survol.png` });

// Le tableau, au clavier.
await carte.locator(".tr-tableau summary").focus();
await p.keyboard.press("Enter");
note((await carte.locator(".tr-tableau tbody tr").count()) === 24, "le tableau heure par heure s'ouvre au clavier");

// Un taux d'erreur qui monte : le verdict le dit.
sql("update plateforme.trafic_heures set erreurs = requetes / 4 where principal and heure > now() - interval '24 hours'");
await p.reload({ waitUntil: "networkidle" });
note((await carte.locator(".et-tete .ui-etat").innerText()).trim() === "Trop d'erreurs" || (await carte.locator(".et-tete .ui-etat").innerText()).trim() === "À regarder", `des erreurs : « ${(await carte.locator(".et-tete .ui-etat").innerText()).trim()} »`);
note((await p.locator(".et-verdict").getByRole("link", { name: "Trafic" }).count()) === 1, "le verdict en tête de l'État y mène (« Trafic »)");
await p.locator(".et-verdict").screenshot({ path: `${D}/4-verdict.png` });

await p.goto(C + "/journal", { waitUntil: "networkidle" });
note((await p.locator("main").innerText()).includes("Trafic relu à la main"), "au journal : « Trafic relu à la main »");
note(!erreurs.length, `aucune erreur au navigateur (${erreurs.length})`);
await ctx.close();

// Au téléphone.
const t = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
const q = await t.newPage();
await connecte(q);
await q.goto(C + "/etat#t-trafic", { waitUntil: "networkidle" });
note(!(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "téléphone : rien ne dépasse");
await q.locator('section[aria-labelledby="t-trafic"]').screenshot({ path: `${D}/5-tel.png` });
await t.close();
await nav.close();
console.log("\n" + bilan.join("\n"));
