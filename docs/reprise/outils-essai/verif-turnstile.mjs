// Turnstile : l'anti-robots de Cloudflare, avec ses clés d'essai officielles (l'une passe toujours, l'autre refuse
// toujours) — le formulaire de contact, la demande d'un code par SMS, le crochet des SMS ; souris, clavier, téléphone.
// Lancer depuis la racine du dépôt, l'API locale démarrée : node docs/reprise/outils-essai/verif-turnstile.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import http from "node:http";
const { chromium } = await import(new URL("../../../application/node_modules/playwright-core/index.mjs", import.meta.url).href);
const R = new URL("../../../", import.meta.url).pathname;
const S = process.env.ESSAIS ?? "/tmp/skanecom-essais";
const D = `${S}/turnstile-captures`;
mkdirSync(D, { recursive: true });
const VARS = `${R}application/.dev.vars`;
const origine = readFileSync(VARS, "utf8");
const bilan = [];
const note = (ok, quoi) => { bilan.push(`${ok ? "✔" : "✘"} ${quoi}`); console.log(`${ok ? "✔" : "✘"} ${quoi}`); };
const sql = (q) => execFileSync("psql", ["-X", "-q", "-t", "-A", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "skanecom", "-c", q]).toString().trim();
const CLES = {
  passe: { site: "1x00000000000000000000AA", secret: "1x0000000000000000000000000000000AA" },
  refuse: { site: "1x00000000000000000000AA", secret: "2x0000000000000000000000000000000AA" },
};
// Les clés dans les secrets locaux du Worker, puis l'application relancée (sans recompiler).
const poser = (cles) => {
  const lignes = origine.split("\n").filter((l) => !/^TURNSTILE_/.test(l));
  if (cles) lignes.push(`TURNSTILE_CLE_SITE=${cles.site}`, `TURNSTILE_SECRET=${cles.secret}`);
  writeFileSync(VARS, lignes.join("\n").replace(/\n+$/, "") + "\n");
  execFileSync(new URL("./redemarre-app.sh", import.meta.url).pathname, { env: { ...process.env, ESSAIS: S } });
};
// Cloudflare se joint par le proxy de sortie du poste (s'il y en a un) ; les vitrines locales, en direct.
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "<-loopback>,*.localhost,127.0.0.1" } : undefined;
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--host-resolver-rules=MAP *.localhost 127.0.0.1"], proxy });

// Le crochet « Send SMS », signé comme Supabase le signe (Standard Webhooks).
const crochetSms = async (telephone) => {
  const secret = /^COURRIELS_CROCHET_SECRET=(.*)$/m.exec(origine)[1].replace(/^v1,whsec_/, "");
  const corps = JSON.stringify({ user: { phone: telephone }, sms: { otp: "123456" } });
  const id = `msg_${randomUUID()}`, ts = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(secret, "base64")).update(`${id}.${ts}.${corps}`).digest("base64");
  // http.request : fetch ne laisse pas choisir l'en-tête Host (la console répond sur console.localhost).
  return new Promise((ok, ko) => {
    const req = http.request({ host: "127.0.0.1", port: 4200, path: "/crochets/sms", method: "POST",
      headers: { host: "console.localhost:4200", "content-type": "application/json", "content-length": Buffer.byteLength(corps),
                 "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${signature}` } }, (r) => { r.resume(); ok(r.statusCode); });
    req.on("error", ko);
    req.end(corps);
  });
};

try {
  // Les essais précédents, depuis ce même poste, ont épuisé la limite de cinq demandes par heure et par visiteur :
  // en base locale, on efface leurs empreintes (la limite elle-même n'est pas l'objet de cet essai).
  sql("update public.demandes_contact set empreinte = null where created_at > now() - interval '1 hour'");
  // ---- Les clés qui passent ----
  poser(CLES.passe);
  const ctx = await nav.newContext({ viewport: { width: 1366, height: 900 }, locale: "fr-FR" });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on("pageerror", (e) => erreurs.push(String(e)));
  const corpsEnvoyes = [];
  p.on("request", (r) => { if (/\/(contact\/envoyer|compte\/code-sms)$/.test(new URL(r.url()).pathname)) corpsEnvoyes.push(r.postData() ?? ""); });

  await p.goto("http://studio.localhost:4200/contact", { waitUntil: "load" });
  note((await p.locator('meta[name="skanecom-turnstile"]').getAttribute("content")) === CLES.passe.site, "la page porte la clé publique du widget");
  // Le widget vit dans une racine fermée (shadow DOM) : son jeton, lui, arrive dans un champ caché du formulaire.
  await p.waitForFunction(() => Boolean(document.querySelector('.controle-robot input[name="cf-turnstile-response"]')?.value), null, { timeout: 20000 });
  note(true, "le widget de Cloudflare se pose dans le formulaire, invisible, et remet son jeton");
  // Invisible, il ne creuse aucun écart : du dernier champ au bouton, l'écart ordinaire du formulaire (18 + 4 px).
  const ecart = await p.evaluate(() => {
    const champs = document.querySelectorAll(".fc-formulaire > .fc-champ");
    return Math.round(document.querySelector(".fc-formulaire .fc-envoyer").getBoundingClientRect().top - champs[champs.length - 1].getBoundingClientRect().bottom);
  });
  note(ecart <= 24, `invisible pour un visiteur ordinaire, sans écart en plus (${ecart} px du dernier champ au bouton)`);
  await p.getByLabel("Votre nom").fill("Essai Turnstile");
  await p.getByLabel("Téléphone").fill("22 345 678");
  const message = `Un essai de l'anti-robots, au clavier (${Date.now()}).`;
  await p.getByLabel("Votre message").fill(message);
  await p.waitForTimeout(2200);
  await p.getByRole("button", { name: "Envoyer ma demande" }).focus();
  await p.keyboard.press("Enter");
  await p.locator(".fc-merci").waitFor({ timeout: 20000 });
  note(/"turnstile":"[^"]{20,}"/.test(corpsEnvoyes.at(-1) ?? ""), "la demande part avec le jeton de Cloudflare");
  note(sql(`select count(*) from public.demandes_contact where message = '${message.replace(/'/g, "''")}'`) === "1", "vérifiée, la demande est enregistrée");
  await p.locator(".vi-contact").screenshot({ path: `${D}/1-contact-passe.png` });

  // Un code par SMS : l'annonce du numéro, vérifiée.
  await p.goto("http://maymar.localhost:4200/compte", { waitUntil: "load" });
  await p.getByLabel(/Numéro de téléphone|Téléphone/).first().fill("20 777 001");
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: "Recevoir le code" }).click();
  await p.getByRole("button", { name: "Valider" }).waitFor({ timeout: 20000 });
  note(/"turnstile":"[^"]{20,}"/.test(corpsEnvoyes.at(-1) ?? ""), "la demande du code part avec le jeton");
  note(sql("select verifiee from plateforme.sms_annonces where empreinte = encode(sha256('21620777001'::bytea), 'hex')") === "t", "l'annonce du numéro est notée vérifiée");
  await p.screenshot({ path: `${D}/2-code-passe.png` });
  // Le crochet des SMS : une annonce vérifiée, le SMS part ; un numéro jamais annoncé (un robot en direct), non.
  sql("select public.vitrine_annoncer_sms((select id from plateforme.boutiques where slug = 'maymar'), '+216 20 777 002', true)");
  note(await crochetSms("21620777002") === 200, "le crochet des SMS : annonce vérifiée, le code part (200)");
  note(await crochetSms("21620777003") === 403, "le crochet des SMS : un numéro jamais annoncé (un robot qui appelle Supabase en direct) ne reçoit rien (403)");
  note(!erreurs.length, `aucune erreur au navigateur (${erreurs.length})`);
  await ctx.close();

  // ---- Les clés qui refusent ----
  poser(CLES.refuse);
  const c2 = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
  const q = await c2.newPage();
  await q.goto("http://studio.localhost:4200/contact", { waitUntil: "load" });
  await q.getByLabel("Votre nom").fill("Robot");
  await q.getByLabel("Téléphone").fill("22 345 679");
  await q.getByLabel("Votre message").fill("Je suis un robot, refusez-moi.");
  await q.waitForTimeout(2200);
  await q.getByRole("button", { name: "Envoyer ma demande" }).tap();
  await q.locator(".fc-erreur-generale").waitFor({ timeout: 20000 });
  note((await q.locator(".fc-erreur-generale").innerText()).startsWith("La vérification anti-robots n'a pas abouti"), `refusé, le formulaire le dit : « ${await q.locator(".fc-erreur-generale").innerText()} »`);
  note(sql("select count(*) from public.demandes_contact where nom = 'Robot'") === "0", "et rien n'est enregistré");
  await q.locator(".fc-formulaire").screenshot({ path: `${D}/3-contact-refuse-tel.png` });
  await q.goto("http://maymar.localhost:4200/compte", { waitUntil: "load" });
  await q.getByLabel(/Numéro de téléphone|Téléphone/).first().fill("20 777 004");
  await q.waitForTimeout(1500);
  await q.getByRole("button", { name: "Recevoir le code" }).tap();
  await q.waitForFunction(() => /anti-robots/.test(document.querySelector(".champ-erreur")?.textContent ?? ""), null, { timeout: 20000 });
  note(true, "la demande d'un code, refusée : le champ le dit, aucun code ne part");
  await q.screenshot({ path: `${D}/4-code-refuse-tel.png` });
  await c2.close();

  // ---- Sans clés : rien ne change ----
  poser(null);
  const c3 = await nav.newContext({ viewport: { width: 1366, height: 900 } });
  const r = await c3.newPage();
  await r.goto("http://studio.localhost:4200/contact", { waitUntil: "load" });
  note((await r.locator('meta[name="skanecom-turnstile"]').count()) === 0 && (await r.locator('.controle-robot input[name="cf-turnstile-response"]').count()) === 0, "sans clés : ni clé dans la page, ni widget");
  note(await crochetSms("21620777005") === 200, "sans clés : le crochet des SMS envoie comme avant");
  await c3.close();
} finally {
  writeFileSync(VARS, origine);
  execFileSync(new URL("./redemarre-app.sh", import.meta.url).pathname, { env: { ...process.env, ESSAIS: S } });
  await nav.close();
}
console.log("\n" + bilan.join("\n"));
