import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import { strToU8, zipSync } from "fflate";
import { creeTesteur } from "./testeur.mjs";

/* ============================================================================
   PARCOURS HUMAIN DE LA CONSOLE — Skander met une boutique en place.

   Connexion, double authentification (le code est calculé comme le ferait
   son application d'authentification), création d'une boutique et de son
   domaine, vitrine fermée puis ouverte, réglage de la marque avec aperçu,
   journal, import du catalogue, invitation de l'équipe (lien d'accès,
   mot de passe choisi sur téléphone, accès retiré puis rendu) ; puis les portes : mauvais mot de passe, mauvais code, compte qui
   n'est pas administrateur, formulaire posté depuis un autre site.

     cd application && bun run parcours:console
     (base, API et vitrine locales démarrées ; clés dans .outils/api-locale.env)

   Chaque passage crée une boutique neuve (identifiant horodaté) : le
   parcours se rejoue sans réinitialiser la base.
   ========================================================================== */

const t = creeTesteur();
const { pause, note, verifie, capture, clic, tape, etape, envoie } = t;
const CONSOLE = t.adresse("console.localhost");
const ADMIN = { email: "admin@skanecom.test", mdp: "console-locale-skanecom" };
const SUFFIXE = Date.now().toString(36).slice(-5);
const SLUG = `outillage-${SUFFIXE}`;
const HOTE = `outillage-${SUFFIXE}.localhost`;
const VITRINE = t.adresse(HOTE);

/* TOTP (RFC 6238) : ce que calcule une application d'authentification. */
function base32(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const octets = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) octets.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(octets);
}
function totp(secret, decalage = 0) {
  const pas = Buffer.alloc(8);
  pas.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + decalage));
  const h = createHmac("sha1", base32(secret)).update(pas).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
/* Un code faux à coup sûr (différent des codes valides autour de maintenant). */
function codeFaux(secret) {
  const bons = new Set([-1, 0, 1].map((d) => totp(secret, d)));
  for (let i = 0; ; i++) { const c = String(123456 + i * 7919).slice(-6); if (!bons.has(c)) return c; }
}

// Réponses d'erreur provoquées exprès par le parcours.
// (la vitrine fermée répond 404 tant que la boutique est en préparation).
const attendue = (url, texte) => url.includes(HOTE) && texte.includes("404");

/* Un vrai classeur .xlsx, rangé comme Excel le range (chaînes partagées,
   nombres en cellules numériques) : ce que le client enverra. */
function classeur(lignes) {
  const partagees = [];
  const index = new Map();
  const chaine = (t) => { if (!index.has(t)) { index.set(t, partagees.length); partagees.push(t); } return index.get(t); };
  const col = (i) => { let n = i + 1, r = ""; while (n > 0) { const m = (n - 1) % 26; r = String.fromCharCode(65 + m) + r; n = Math.floor((n - 1) / 26); } return r; };
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rangs = lignes.map((l, r) => `<row r="${r + 1}">${l.map((v, c) =>
    v === "" || v === null ? "" : typeof v === "number"
      ? `<c r="${col(c)}${r + 1}"><v>${v}</v></c>`
      : `<c r="${col(c)}${r + 1}" t="s"><v>${chaine(String(v))}</v></c>`).join("")}</row>`).join("");
  const xml = (corps) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${corps}`;
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8(xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>')),
    "_rels/.rels": strToU8(xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')),
    "xl/workbook.xml": strToU8(xml('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Catalogue" sheetId="1" r:id="rId1"/></sheets></workbook>')),
    "xl/_rels/workbook.xml.rels": strToU8(xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>')),
    "xl/worksheets/sheet1.xml": strToU8(xml(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rangs}</sheetData></worksheet>`)),
    "xl/sharedStrings.xml": strToU8(xml(`<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${partagees.length}" uniqueCount="${partagees.length}">${partagees.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join("")}</sst>`)),
  }));
}

const ENTETES = ["Produit", "Référence", "Prix", "Prix barré", "Stock", "Rayon", "Marque", "Description", "Poids (kg)", "Tension", "Conditionnement"];
const CATALOGUE = [
  ["Perceuse à percussion 18 V", "PP18-SEULE", 329, "", 7, "Outillage > Perceuses", "Atelier Pro", "Mandrin 13 mm, deux vitesses.", "1,9", "18 V", "Machine seule"],
  ["Perceuse à percussion 18 V", "PP18-KIT", "529,000", "599,000", 3, "Outillage > Perceuses", "Atelier Pro", "", "3,1", "18 V", "Kit 2 batteries"],
  ["Disque à tronçonner 125 mm", "DT125-U", "4,500", "", 200, "Consommables > Disques", "", "Acier et inox.", "0,05", "", "Unité"],
  ["Disque à tronçonner 125 mm", "DT125-B10", 39, "", 40, "Consommables > Disques", "", "", "0,5", "", "Boîte de 10"],
];

/* Les fichiers déposés (relais local, qui tient lieu de R2). */
async function fichierLocal(chemin) {
  const r = await fetch(`http://127.0.0.1:54321/fichiers/${chemin}`);
  return { status: r.status, octets: r.ok ? new Uint8Array(await r.arrayBuffer()) : new Uint8Array() };
}
/* Largeur et hauteur d'un PNG (en-tête IHDR) ou d'un WebP. */
function taille(o) {
  if (o[0] === 0x89) return [(o[16] << 24 | o[17] << 16 | o[18] << 8 | o[19]) >>> 0, (o[20] << 24 | o[21] << 16 | o[22] << 8 | o[23]) >>> 0];
  const quatre = String.fromCharCode(...o.subarray(12, 16));
  if (quatre === "VP8X") return [1 + (o[24] | (o[25] << 8) | (o[26] << 16)), 1 + (o[27] | (o[28] << 8) | (o[29] << 16))];
  if (quatre === "VP8L") { const b = o[21] | (o[22] << 8) | (o[23] << 16) | (o[24] << 24); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
  return [(o[26] | (o[27] << 8)) & 0x3fff, (o[28] | (o[29] << 8)) & 0x3fff];
}
const demo = (chemin) => readFileSync(new URL(`../../supabase/fichiers-demo/${chemin}`, import.meta.url));
/* Un logo vectoriel avec des marges vides (à rogner) : un carré et une barre. */
const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120"><g fill="#111"><rect x="40" y="30" width="60" height="60" rx="6"/><rect x="115" y="45" width="240" height="30" rx="4"/></g></svg>';

/* Une requête brute vers la console, avec les cookies du navigateur : pour
   lire une redirection sans la suivre, ou poster depuis une « autre origine ». */
async function brut(contexte, methode, chemin, { entetes = {}, formulaire } = {}) {
  const cookies = (await contexte.cookies(CONSOLE)).map((c) => `${c.name}=${c.value}`).join("; ");
  const corps = formulaire ? new URLSearchParams(formulaire).toString() : undefined;
  return new Promise((ok, ko) => {
    const req = http.request({
      host: "127.0.0.1", port: Number(t.port), method: methode, path: chemin,
      headers: {
        host: new URL(CONSOLE).host, cookie: cookies, ...entetes,
        ...(corps ? { "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(corps) } : {}),
      },
    }, (r) => { r.resume(); r.on("end", () => ok({ status: r.statusCode, location: r.headers.location ?? "" })); });
    req.on("error", ko);
    req.end(corps);
  });
}

/* Le crochet « Send Email » de Supabase Auth, tel que GoTrue l'appelle :
   Standard Webhooks, signé avec le secret de développement
   (outils/api-locale.sh → application/.dev.vars). */
const SECRET_CROCHET = Buffer.from("secret-de-developpement-skanecom-local-uniquement");
async function crochetCourriel(evenement, { signe = true, decalageS = 0 } = {}) {
  const corps = JSON.stringify(evenement);
  const id = `msg_${Date.now()}`;
  const horodatage = String(Math.floor(Date.now() / 1000) - decalageS);
  const signature = createHmac("sha256", SECRET_CROCHET).update(`${id}.${horodatage}.${corps}`).digest("base64");
  return new Promise((ok, ko) => {
    const req = http.request({
      host: "127.0.0.1", port: Number(t.port), method: "POST", path: "/crochets/courriel",
      headers: {
        host: new URL(CONSOLE).host, "content-type": "application/json", "content-length": Buffer.byteLength(corps),
        "webhook-id": id, "webhook-timestamp": horodatage, "webhook-signature": `v1,${signe ? signature : "pas-la-bonne"}`,
      },
    }, (r) => { let texte = ""; r.on("data", (m) => (texte += m)); r.on("end", () => ok({ status: r.statusCode, texte })); });
    req.on("error", ko);
    req.end(corps);
  });
}
const RELAIS = process.env.RELAIS ?? "http://127.0.0.1:54321";

/* Attend qu'une page réponde comme prévu (l'annuaire de la vitrine
   redemande une boutique fermée toutes les 10 s). */
async function attendsVitrine(p, url, statut, delaiMs = 20_000) {
  const fin = Date.now() + delaiMs;
  for (;;) {
    const r = await p.goto(url, { waitUntil: "networkidle" });
    if (r.status() === statut || Date.now() > fin) return r;
    await pause(1000);
  }
}

/* L'API d'administration de GoTrue (clé service_role, .outils/api-locale.env). */
async function gotrue(methode, chemin, corps) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1${chemin}`, {
    method: methode,
    headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json" },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  if (!r.ok) throw new Error(`GoTrue ${methode} ${chemin} : HTTP ${r.status}`);
  return r.status === 204 ? null : r.json();
}

/* Le parcours commence comme sur un téléphone neuf : on retire les facteurs
   de double authentification de l'administrateur de développement (laissés
   par un passage précédent), pour revoir l'inscription par QR code. */
async function telephoneNeuf() {
  const { users } = await gotrue("GET", "/admin/users?per_page=1000");
  const admin = users.find((u) => u.email === ADMIN.email);
  if (!admin) throw new Error(`${ADMIN.email} introuvable : lancer outils/api-locale.sh demarrer`);
  // (la liste des comptes ne donne pas les facteurs : on les demande à part)
  const facteurs = await gotrue("GET", `/admin/users/${admin.id}/factors`);
  for (const f of facteurs ?? []) await gotrue("DELETE", `/admin/users/${admin.id}/factors/${f.id}`);
}

await telephoneNeuf();
const navigateur = await t.navigateur();
let secret = "";

/* ------------------------------------------------------------------ */
console.log("\n== 1. Première connexion : mot de passe, puis double authentification ==");
const ctx = await navigateur.newContext({ viewport: { width: 1366, height: 860 }, locale: "fr-FR" });
const page = await ctx.newPage();
t.espion(page, "console", attendue);

await etape("la console demande de se connecter", async () => {
  await page.goto(CONSOLE + "/", { waitUntil: "networkidle" });
  verifie(new URL(page.url()).pathname === "/connexion", `sans session, « / » mène à la connexion (${page.url()})`);
  verifie(new URL(page.url()).host === new URL(CONSOLE).host, "la redirection reste sur le domaine de la console");
  await capture(page, "console-connexion");
});

await etape("mauvais mot de passe", async () => {
  await clic(page, page.locator("#email"));
  await tape(page, ADMIN.email);
  await clic(page, page.locator("#mot_de_passe"));
  await tape(page, "pas-le-bon");
  await page.keyboard.press("Enter");
  await page.waitForURL(/erreur=/);
  const message = await page.getByRole("alert").innerText();
  verifie(message.includes("incorrect"), `message : « ${message} »`);
  verifie((await page.locator("#email").inputValue()) === ADMIN.email, "l'adresse saisie est conservée");
  await capture(page, "console-mauvais-mot-de-passe");
});

await etape("bon mot de passe", async () => {
  await clic(page, page.locator("#mot_de_passe"));
  await tape(page, ADMIN.mdp);
  await clic(page, page.getByRole("button", { name: "Se connecter" }));
  await page.waitForURL(/double-authentification/);
  await page.waitForLoadState("networkidle");
  secret = (await page.locator("[data-secret-totp]").textContent()).trim();
  verifie(await page.getByRole("img", { name: /QR code/ }).isVisible(), "première connexion : le QR code à scanner s'affiche");
  verifie(/^[A-Z2-7]{16,}$/.test(secret), `la clé à saisir à la main s'affiche (${secret.length} caractères)`);
  await capture(page, "console-double-authentification-inscription");
});

await etape("sans le code, la console reste fermée", async () => {
  const r = await brut(ctx, "GET", "/");
  verifie(r.status >= 300 && r.status < 400 && r.location.includes("/double-authentification"),
    `après le seul mot de passe, « / » renvoie vers la double authentification (${r.status})`);
});

await etape("mauvais code : le QR code reste", async () => {
  await clic(page, page.locator("#code"));
  await tape(page, codeFaux(secret));
  await page.keyboard.press("Enter");
  await page.getByRole("alert").filter({ hasText: /incorrect/ }).waitFor();
  const secretApres = (await page.locator("[data-secret-totp]").textContent()).trim();
  verifie(secretApres === secret, "après un code faux, la même clé reste à l'écran (rien à rescanner)");
  await capture(page, "console-code-faux");
});

await etape("bon code : la console s'ouvre", async () => {
  await clic(page, page.locator("#code"));
  await tape(page, totp(secret));
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => u.pathname === "/");
  await page.waitForLoadState("networkidle");
  // Le poste de pilotage : une tuile par boutique, à sa couleur, avec sa semaine.
  const tuiles = await page.locator(".pl-tuile .pl-nom").allInnerTexts();
  verifie(tuiles.includes("Maymar") && tuiles.includes("Quincaillerie du Sud"),
    `le poste de pilotage : ${tuiles.length} boutiques en tuiles, dont Maymar et la quincaillerie`);
  const maymar = page.locator(".pl-tuile", { has: page.locator(".pl-nom", { hasText: /^Maymar$/ }) });
  verifie((await maymar.locator(".pl-semaine rect").count()) === 7 && /\d+ commandes? en 7 jours/.test(await maymar.innerText()),
    "chaque tuile a sa semaine : une barre par jour, les commandes des sept jours");
  verifie((await maymar.locator(".pl-attente").innerText()).includes("à confirmer"), "et ce qui attend (Maymar : des commandes à confirmer)");
  const accent = await maymar.evaluate((e) => getComputedStyle(e).getPropertyValue("--pl-accent").trim());
  verifie(/^#[0-9a-f]{6}$/i.test(accent), `à la couleur de sa vitrine (${accent})`);
  verifie((await page.locator(".pl-vigilance").innerText()).includes("Maymar"),
    "« À surveiller » : les commandes de Maymar qui attendent depuis des heures");
  await capture(page, "console-tableau");
  // La même chose en liste, au clavier : le sélecteur d'affichage, puis Entrée.
  await page.getByRole("link", { name: "Liste" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/vue=liste/);
  await page.waitForLoadState("networkidle");
  const lignes = await page.locator("tbody tr").allInnerTexts();
  verifie(lignes.some((l) => l.includes("Maymar")) && lignes.some((l) => l.includes("Quincaillerie")),
    `en liste : ${lignes.length} boutiques, dont Maymar et la quincaillerie`);
  await capture(page, "console-tableau-liste");
});

/* ------------------------------------------------------------------ */
console.log("\n== 2. Mettre une boutique en place ==");

await etape("créer la boutique", async () => {
  await clic(page, page.getByRole("link", { name: "Nouvelle boutique" }).first());
  await page.waitForURL(/nouvelle-boutique/);
  await clic(page, page.locator("#nom")); await tape(page, "Outillage Pro Démo");
  await clic(page, page.locator("#slug")); await tape(page, SLUG);
  await clic(page, page.locator("#hote")); await tape(page, HOTE);
  await clic(page, page.getByLabel(/^Technique/));
  await capture(page, "console-nouvelle-boutique");
  await clic(page, page.getByRole("button", { name: "Créer la boutique" }));
  await page.waitForURL(new RegExp(`/boutiques/${SLUG}`));
  await page.waitForLoadState("networkidle");
  verifie((await page.getByRole("status").innerText()).includes("en préparation"), "la boutique est créée, en préparation");
  await capture(page, "console-boutique-creee");
});

await etape("un identifiant déjà pris est refusé, la saisie gardée", async () => {
  await page.goto(CONSOLE + "/nouvelle-boutique", { waitUntil: "networkidle" });
  await clic(page, page.locator("#nom")); await tape(page, "Doublon");
  await clic(page, page.locator("#slug")); await tape(page, SLUG);
  await clic(page, page.locator("#hote")); await tape(page, `autre-${SUFFIXE}.localhost`);
  await clic(page, page.getByRole("button", { name: "Créer la boutique" }));
  await page.waitForURL(/erreur=/);
  verifie((await page.getByRole("alert").innerText()).includes("Déjà pris"), `message : « ${await page.getByRole("alert").innerText()} »`);
  verifie((await page.locator("#nom").inputValue()) === "Doublon", "le formulaire garde ce qui a été saisi");
});

await etape("la vitrine de la boutique en préparation est fermée", async () => {
  const vitrine = await ctx.newPage();
  const r = await vitrine.goto(VITRINE + "/", { waitUntil: "networkidle" });
  verifie(r.status() === 404 && (await vitrine.locator("h1").innerText()).includes("fermée"), `avant l'ouverture : HTTP ${r.status()}, « ${await vitrine.locator("h1").innerText()} »`);
  await capture(vitrine, "vitrine-fermee");
  await vitrine.close();
});

await etape("ouvrir la boutique", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  await envoie(page, page.getByRole("button", { name: "Ouvrir la boutique" }));
  await page.waitForURL(/ok=/);
  verifie((await page.getByRole("status").innerText()).includes("ouverte"), "la console confirme l'ouverture");
  const vitrine = await ctx.newPage();
  const debut = Date.now();
  const r = await attendsVitrine(vitrine, VITRINE + "/", 200);
  verifie(r.status() === 200 && (await vitrine.title()).includes("Outillage Pro Démo"),
    `après l'ouverture : HTTP ${r.status()}, « ${await vitrine.title()} », servie en ${Math.round((Date.now() - debut) / 1000)} s`);
  await capture(vitrine, "vitrine-ouverte-theme-technique");
  await vitrine.close();
});

await etape("régler la marque, avec aperçu", async () => {
  await clic(page, page.getByRole("link", { name: "Régler la marque" }));
  await page.waitForURL(/\/marque/);
  await page.waitForLoadState("networkidle");
  const apercu = page.locator("[data-apercu]");
  const accentAvant = await apercu.evaluate((e) => getComputedStyle(e).getPropertyValue("--theme-accent").trim());

  const champAccent = page.locator("#c-accent");
  await clic(page, champAccent);
  await champAccent.press("ControlOrMeta+a");
  await tape(page, "#0B6E4F");
  await page.locator("#polices_titres").selectOption("young-serif");
  await clic(page, page.locator("#t-resume_fr"));
  await tape(page, "Outillage électroportatif et consommables, pour les pros du chantier.");
  await pause(200);
  const accentApres = await apercu.evaluate((e) => getComputedStyle(e).getPropertyValue("--theme-accent").trim());
  const police = await apercu.locator(".font-display").first().evaluate((e) => getComputedStyle(e).fontFamily);
  verifie(accentAvant !== accentApres && accentApres.toUpperCase() === "#0B6E4F", `l'aperçu suit la couleur saisie (${accentAvant} → ${accentApres})`);
  verifie(/young/i.test(police), `l'aperçu suit la police choisie (${police.split(",")[0]})`);
  verifie((await apercu.innerText()).includes("pros du chantier"), "l'aperçu montre la présentation saisie");
  await capture(page, "console-marque-apercu", true);

  await clic(page, page.getByRole("button", { name: "Enregistrer la marque" }));
  await page.waitForURL(/ok=/);
  verifie((await page.getByRole("status").innerText()).includes("version 2"), `« ${await page.getByRole("status").innerText()} »`);
});

await etape("la vitrine porte la nouvelle marque", async () => {
  const vitrine = await ctx.newPage();
  // Une page jamais vue : l'accueil, lui, reste en cache cinq minutes.
  await vitrine.goto(VITRINE + "/catalogue", { waitUntil: "networkidle" });
  const accent = await vitrine.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--theme-accent").trim());
  const resume = await vitrine.locator("footer").innerText();
  verifie(accent.toUpperCase() === "#0B6E4F", `accent de la vitrine : ${accent}`);
  verifie(resume.includes("pros du chantier"), "le pied de la vitrine montre la présentation");
  const vide = await vitrine.locator("main").innerText();
  verifie(vide.includes("Le catalogue arrive") && !vide.includes("filtres"),
    "catalogue encore vide : la vitrine dit que le catalogue arrive, sans parler de filtres");
  await capture(vitrine, "vitrine-nouvelle-marque");
  await vitrine.close();
});

await etape("le logo et les images de la marque, téléversés", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}/marque`, { waitUntil: "networkidle" });
  const ligne = (e) => page.locator(`.im-ligne[data-emplacement="${e}"]`);
  // Un geste, puis la réponse de la ligne (son message change, elle n'est plus occupée).
  const geste = async (e, faire) => {
    const l = ligne(e);
    const avant = (await l.locator(".im-message").count()) ? await l.locator(".im-message").innerText() : "";
    await faire(l);
    await page.waitForFunction(([sel, avant]) => {
      const el = document.querySelector(sel);
      const m = el?.querySelector(".im-message");
      return el && !el.hasAttribute("data-occupe") && m && m.textContent.trim() !== avant.trim();
    }, [`.im-ligne[data-emplacement="${e}"]`, avant], { timeout: 20_000 });
    return (await l.locator(".im-message").innerText()).trim();
  };
  const choisir = (e, fichier) => geste(e, (l) => l.locator('input[type="file"]').setInputFiles(fichier));
  // Une image tracée par le navigateur (canvas) : opaque, ou un rond sur fond transparent.
  const png = async (l, h, genre) => Buffer.from(await page.evaluate(async ([l, h, genre]) => {
    const c = document.createElement("canvas");
    c.width = l; c.height = h;
    const x = c.getContext("2d");
    if (genre === "opaque") { x.fillStyle = "#F5C400"; x.fillRect(0, 0, l, h); x.fillStyle = "#111"; x.fillRect(l / 3, h / 3, l / 3, h / 3); }
    else { x.fillStyle = "#111"; x.beginPath(); x.arc(l / 2, h / 2, l / 3, 0, Math.PI * 2); x.fill(); }
    const b = await new Promise((r) => c.toBlob(r, "image/png"));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  }, [l, h, genre]));
  const cheminDe = async (selecteur, attribut) => {
    const v = await page.locator(selecteur).first().evaluate((el, a) => a === "style" ? el.style.maskImage || el.style.webkitMaskImage : el.getAttribute(a), attribut);
    return (v ?? "").match(/fichiers\/([^")]+)/)?.[1] ?? "";
  };

  verifie((await ligne("recit").count()) === 0 && (await ligne("ouverture_portrait").count()) === 0,
    "gabarit technique : pas de photo du récit à poser, et le cadrage pour téléphone attend la photo d'ouverture");

  // Le logo : un SVG, converti en PNG par le navigateur, marges rognées.
  let m = await choisir("logo", { name: "logo-outillage.svg", mimeType: "image/svg+xml", buffer: Buffer.from(LOGO_SVG) });
  const logo = await cheminDe(".im-ligne[data-emplacement=logo] .im-masque", "style");
  const f = await fichierLocal(logo);
  const [l, h] = f.status === 200 ? taille(f.octets) : [0, 0];
  verifie(m === "Logo enregistré." && /\/marque\/logo-[a-z0-9]+\.png$/.test(logo) && f.status === 200 && f.octets[0] === 0x89,
    `« ${m} » — le SVG est déposé converti en PNG (${logo})`);
  verifie(Math.abs(l / h - 5.25) < 0.02, `ses marges vides rognées : ${l} × ${h} px, proportion ${(l / h).toFixed(2)} (le dessin fait 315 × 60)`);
  verifie((await page.locator('input[name="logo_mode"][value="masque"]').isChecked()), "un logo à fond transparent s'affiche en monochrome");
  verifie((await page.locator("[data-apercu] .apercu-marque").count()) === 2, "l'aperçu le montre en tête et dans le pied");
  m = await geste("logo", (l) => l.getByLabel("Avec ses propres couleurs").check());
  verifie(m === "Logo affiché avec ses couleurs." && (await page.locator("[data-apercu] img[alt='Outillage Pro Démo']").count()) === 2,
    `« ${m} » — l'aperçu le montre en couleurs`);
  m = await geste("logo", (l) => l.getByLabel(/Monochrome/).check());
  verifie(m === "Logo affiché en monochrome.", `« ${m} »`);

  // Le monogramme : un filigrane, il lui faut de la transparence.
  m = await choisir("monogramme", { name: "carre-jaune.png", mimeType: "image/png", buffer: await png(400, 400, "opaque") });
  verifie(/fond transparent/.test(m) && (await ligne("monogramme").locator(".im-message-erreur").count()) === 1, `image opaque refusée : « ${m} »`);
  m = await choisir("monogramme", { name: "rond.png", mimeType: "image/png", buffer: await png(400, 400, "rond") });
  verifie(m === "Monogramme enregistré." && (await page.locator("[data-apercu] .apercu-filigrane").count()) === 1,
    `« ${m} » — le filigrane paraît sur le produit de l'aperçu`);

  // L'icône d'onglet : une image en largeur est complétée en carré.
  m = await choisir("favicon", { name: "icone-large.png", mimeType: "image/png", buffer: await png(300, 200, "opaque") });
  const icone = await cheminDe(".im-onglet-icone img", "src");
  const fi = await fichierLocal(icone);
  verifie(m === "Icône enregistrée." && fi.status === 200 && taille(fi.octets).join("×") === "256×256",
    `« ${m} » — 300 × 200 px devenue ${taille(fi.octets).join(" × ")} px`);

  // La photo d'ouverture : trop petite, puis la bonne.
  m = await choisir("ouverture", { name: "chantier-1000.webp", mimeType: "image/webp", buffer: demo("quincaillerie-demo/accueil/chantier-1000.webp") });
  verifie(/Image trop petite \(1000 × 667 px\).*1\s200 px/.test(m), `photo trop petite refusée avant l'envoi : « ${m} »`);
  m = await choisir("ouverture", { name: "chantier-2000.webp", mimeType: "image/webp", buffer: demo("quincaillerie-demo/accueil/chantier-2000.webp") });
  verifie(m === "Photo d'ouverture enregistrée." && (await page.locator("[data-apercu] .apercu-ouverture-image").count()) === 1,
    `« ${m} » — l'aperçu s'ouvre sur elle`);
  await ligne("ouverture_portrait").waitFor();
  m = await choisir("ouverture_portrait", { name: "chantier-2000.webp", mimeType: "image/webp", buffer: demo("quincaillerie-demo/accueil/chantier-2000.webp") });
  verifie(/plus large que haute/.test(m), `le cadrage pour téléphone est en hauteur : « ${m} »`);
  // Glissée sur sa ligne, comme depuis le bureau.
  const octets = Array.from(demo("maison-selma/accueil/hero-portrait-1200.webp"));
  m = await geste("ouverture_portrait", async (l) => {
    const transfert = await page.evaluateHandle((o) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(o)], "portrait.webp", { type: "image/webp" }));
      return dt;
    }, octets);
    await l.dispatchEvent("dragover", { dataTransfer: transfert });
    await l.dispatchEvent("drop", { dataTransfer: transfert });
  });
  verifie(m === "Cadrage pour téléphone enregistré.", `glissée sur la ligne : « ${m} »`);
  await clic(page, page.locator("#alt-ouverture"));
  m = await geste("ouverture", async () => { await tape(page, "Gerbe d'étincelles sur un chantier"); await page.keyboard.press("Enter"); });
  verifie(m === "Description enregistrée." && page.url().endsWith("/marque"), `Entrée dans la description l'enregistre, sans quitter la page : « ${m} »`);
  await page.locator(".im-carte").scrollIntoViewIfNeeded();
  await pause(300);
  await capture(page, "console-marque-images", true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".im-carte").scrollIntoViewIfNeeded();
  await pause(300);
  await capture(page, "console-marque-images-telephone");
  await page.setViewportSize({ width: 1366, height: 860 });

  // Retirer : le fichier quitte le dépôt.
  const monogramme = await cheminDe(".im-ligne[data-emplacement=monogramme] .im-masque", "style");
  m = await geste("monogramme", (l) => l.getByRole("button", { name: /Retirer/ }).click());
  verifie(m === "Monogramme retiré." && (await fichierLocal(monogramme)).status === 404, `« ${m} » — et son fichier quitte le dépôt`);

  // Le formulaire de marque suit la version : il s'enregistre encore.
  await clic(page, page.locator("#t-origine_fr"));
  await tape(page, "Sfax");
  await clic(page, page.getByRole("button", { name: "Enregistrer la marque" }));
  await page.waitForURL(/ok=/);
  const statut = await page.getByRole("status").first().innerText();
  verifie(/Marque enregistrée \(version \d+\)/.test(statut), `après les images, la marque s'enregistre toujours : « ${statut} »`);

  // La vitrine : une page jamais servie (l'accueil reste en cache cinq minutes).
  const vitrine = await ctx.newPage();
  await vitrine.goto(VITRINE + "/mentions-legales", { waitUntil: "networkidle" });
  const variable = await vitrine.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--theme-logo"));
  const favicon = await vitrine.locator('link[rel="icon"]').first().getAttribute("href");
  verifie(variable.includes(logo) && (await vitrine.locator("header .marque").count()) >= 1, "la vitrine porte le logo, en tête de page");
  verifie((favicon ?? "").includes(icone), `et son icône d'onglet (${favicon})`);
  await capture(vitrine, "vitrine-logo-televerse");
  await vitrine.close();
});

await etape("les modules de la boutique", async () => {
  await clic(page, page.getByRole("link", { name: /^Modules/ }));
  await page.waitForURL(/\/modules$/);
  const lignes = page.locator(".md-module");
  verifie((await lignes.count()) === 8 && (await page.locator(".md-module[data-actif]").count()) === 0,
    `${await lignes.count()} modules, aucun actif pour une boutique neuve`);
  const aVenir = page.locator('.md-module[data-module="paiement_en_ligne"]');
  verifie((await aVenir.innerText()).includes("À venir") && (await aVenir.getByRole("button").count()) === 0,
    "un module pas encore construit est « à venir », sans bouton");
  await envoie(page, page.getByRole("button", { name: "Activer : Demander conseil (WhatsApp)" }));
  await page.waitForURL(/ok=/);
  const conseil = page.locator('.md-module[data-module="conseil_whatsapp"]');
  verifie((await page.getByRole("status").innerText()).includes("activé") && (await conseil.getAttribute("data-actif")) === ""
    && (await conseil.innerText()).includes(ADMIN.email),
    `« ${await page.getByRole("status").innerText()} » — avec qui l'a activé`);
  verifie((await page.locator(".onglets a", { hasText: "Modules" }).innerText()).includes("1"), "l'onglet compte le module actif");
  await capture(page, "console-modules", true);
  // Une activation postée à la main pour un module à venir : la base refuse.
  const refus = await brut(ctx, "POST", `/boutiques/${SLUG}/modules/changer`, {
    entetes: { origin: CONSOLE },
    formulaire: { boutique_id: await page.locator('input[name="boutique_id"]').first().inputValue(), module: "paiement_en_ligne", actif: "true" },
  });
  verifie(refus.status === 303 && decodeURIComponent(refus.location.replace(/\+/g, " ")).includes("à venir"), "un module à venir, posté à la main : la base refuse");
  await envoie(page, page.getByRole("button", { name: "Couper : Demander conseil (WhatsApp)" }));
  await page.waitForURL(/ok=/);
  verifie((await page.getByRole("status").innerText()).includes("coupé") && (await page.locator(".md-module[data-actif]").count()) === 0,
    `« ${await page.getByRole("status").innerText()} »`);
});

await etape("le journal garde tout", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  const journal = await page.locator("section:has(#t-journal) tbody tr").allInnerTexts();
  const actions = ["Boutique créée", "Statut changé", "Marque modifiée", "Image de la marque", "Module activé", "Module coupé"];
  verifie(actions.every((a) => journal.some((l) => l.includes(a))) && journal.every((l) => l.includes(ADMIN.email)),
    `journal : ${journal.length} actions (${actions.join(", ")}), chacune avec l'administrateur`);
  await capture(page, "console-fiche-journal", true);
});

await etape("importer un catalogue : un fichier avec des erreurs", async () => {
  await clic(page, page.getByRole("link", { name: "Importer un catalogue" }));
  await page.waitForURL(/\/import$/);
  await capture(page, "console-import");
  const fautif = CATALOGUE.map((l) => [...l]);
  fautif[1][1] = "PP18-SEULE";          // référence en double
  fautif[3][2] = "trente-neuf";        // prix illisible
  await page.locator("#fichier").setInputFiles({
    name: "catalogue-outillage.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: classeur([ENTETES, ...fautif]),
  });
  await clic(page, page.getByRole("button", { name: "Vérifier le fichier" }));
  await page.waitForURL(/\/import\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  const erreurs = await page.locator("#t-erreurs").locator("..").locator("tbody tr").allInnerTexts();
  verifie(erreurs.some((e) => e.startsWith("3") && e.includes("en double")) && erreurs.some((e) => e.startsWith("5") && e.includes("Prix illisible")),
    `le rapport cite chaque erreur avec la ligne du tableur : ${erreurs.map((e) => e.replace(/\s+/g, " ")).join(" | ")}`);
  verifie(await page.getByRole("button", { name: /^Importer/ }).count() === 0, "avec des erreurs, aucun bouton pour importer");
  await capture(page, "console-import-erreurs", true);
});

await etape("importer un catalogue : le fichier corrigé", async () => {
  await clic(page, page.getByRole("link", { name: "vérifiez-le de nouveau" }));
  await page.waitForURL(/\/import$/);
  await page.locator("#fichier").setInputFiles({
    name: "catalogue-outillage.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: classeur([ENTETES, ...CATALOGUE]),
  });
  await clic(page, page.getByRole("button", { name: "Vérifier le fichier" }));
  await page.waitForURL(/\/import\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  const texte = await page.locator("main").innerText();
  verifie(/2\s+produits nouveaux/.test(texte) && texte.includes("Rayons créés : Consommables, Disques, Outillage, Perceuses"),
    "le rapport annonce 2 produits nouveaux et les 4 rayons à créer");
  verifie(texte.includes("529,000") && texte.includes("Kit 2 batteries"), "l'aperçu montre les prix et les axes lus dans le fichier");
  await capture(page, "console-import-rapport", true);
  await envoie(page, page.getByRole("button", { name: /^Importer 2 produits \(4 variantes\)/ }));
  await page.waitForURL(new RegExp(`/boutiques/${SLUG}\\?ok=`));
  verifie((await page.getByRole("status").innerText()).includes("Catalogue importé : 2 produits, 4 variantes"), "la console confirme l'import");
  verifie(/Produits 2 Publiés 2 Variantes 4 Rayons 4/.test((await page.locator("section:has(#t-catalogue)").innerText()).replace(/\s+/g, " ")),
    "la fiche de la boutique compte le nouveau catalogue");
});

await etape("la vitrine montre le catalogue importé", async () => {
  const vitrine = await ctx.newPage();
  await vitrine.goto(VITRINE + "/categorie/perceuses", { waitUntil: "networkidle" });
  const texte = await vitrine.locator("main").innerText();
  verifie(texte.includes("Perceuse à percussion 18 V") && texte.includes("329,000"), "le rayon Perceuses montre la perceuse, à partir de 329,000 TND");
  await capture(vitrine, "vitrine-catalogue-importe");
  await clic(vitrine, vitrine.locator(".te-carte-lien").first());
  await vitrine.waitForURL(/\/produit\//);
  await vitrine.waitForLoadState("networkidle");
  await clic(vitrine, vitrine.getByRole("button", { name: /^Kit 2 batteries/ }));
  const fiche = await vitrine.locator("main").innerText();
  verifie(fiche.includes("529,000") && fiche.includes("599,000") === false, "la fiche : le kit à 529,000 TND (prix barré masqué : réglage de la boutique)");
  verifie(/3 pièces/.test(fiche), "la fiche montre le stock importé du kit (3 pièces)");
  await capture(vitrine, "vitrine-fiche-importee");
  await vitrine.close();
});

/* Le dossier de photos d'un fournisseur, zippé : nommées d'après les
   références, une sans référence, et le fichier caché que laisse macOS. */
const photo = (nom) => demo(`quincaillerie-demo/produits/${nom}-1000.webp`);
const ZIP_PHOTOS = Buffer.from(zipSync({
  "photos-fournisseur/PP18-KIT.webp": photo("perceuse-percussion"),
  "photos-fournisseur/PP18-KIT-2.webp": photo("perceuse-visseuse"),
  "photos-fournisseur/PP18-SEULE.webp": photo("perceuse-percussion"),
  "photos-fournisseur/DT125-U.webp": photo("lame-scie-circulaire"),
  "photos-fournisseur/sans-reference.webp": photo("casque-chantier"),
  "__MACOSX/photos-fournisseur/._PP18-KIT.webp": strToU8("métadonnées"),
}));
const deposeZip = (p) => p.locator(".pi-entree").setInputFiles({ name: "photos-fournisseur.zip", mimeType: "application/zip", buffer: ZIP_PHOTOS });

await etape("les photos à l'import : le rapport avant l'envoi", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}/import`, { waitUntil: "networkidle" });
  await clic(page, page.getByRole("link", { name: "Déposer les photos" }));
  await page.waitForURL(new RegExp(`/boutiques/${SLUG}/import/photos$`));
  await page.waitForLoadState("networkidle");
  verifie((await page.locator(".sous-tete").innerText()).includes("2 produits, dont 2 sans photo"), "la page compte les produits sans photo");
  await deposeZip(page);
  await page.locator(".pi-bilan").waitFor();
  const bilan = (await page.locator(".pi-bilan-texte").innerText()).replace(/\s+/g, " ");
  verifie(bilan.includes("4 photos pour 2 produits") && bilan.includes("1 fichier sans produit"),
    `le .zip lu dans le navigateur, rapproché par les références : « ${bilan} »`);
  const perceuse = (await page.locator(".pi-groupe", { hasText: "Perceuse" }).innerText()).replace(/\s+/g, " ");
  verifie(perceuse.includes("3 photos") && perceuse.includes("Kit 2 batteries") && perceuse.includes("Machine seule"),
    `chaque photo attitrée à sa déclinaison : « ${perceuse} »`);
  await page.locator(".pi-details summary", { hasText: "sans produit" }).click();
  verifie((await page.locator(".pi-details", { hasText: "sans produit" }).innerText()).includes("sans-reference.webp"),
    "le fichier sans produit est nommé, avec de quoi le renommer");
  verifie(!(await page.locator(".pi-rapport").innerText()).includes("._PP18-KIT"), "le fichier caché de macOS est écarté");
  await capture(page, "console-photos-rapport", true);
});

await etape("les photos à l'import : l'envoi, puis la vitrine", async () => {
  await clic(page, page.getByRole("button", { name: "Envoyer 4 photos" }));
  await page.locator("#t-pi-fin").waitFor({ timeout: 60_000 });
  verifie((await page.locator("#t-pi-fin").innerText()).includes("4 photos ajoutées à 2 produits"), "4 photos ajoutées à 2 produits");
  await page.waitForLoadState("networkidle");
  verifie((await page.locator(".pi-lot").first().innerText()).includes("4 photos · 2 produits"), "l'envoi figure dans les envois précédents, compté");
  const vitrine = await ctx.newPage();
  await vitrine.goto(VITRINE + "/categorie/disques", { waitUntil: "networkidle" });
  const src = await vitrine.locator("main img").first().getAttribute("src");
  verifie(Boolean(src) && decodeURIComponent(src).includes("/produits/"), "la vitrine montre le disque avec sa photo");
  await capture(vitrine, "vitrine-photos-importees");
  await vitrine.close();
});

await etape("les photos à l'import : renvoyer le même dossier ne double rien ; retirer l'envoi", async () => {
  await clic(page, page.getByRole("button", { name: "Déposer d'autres photos" }));
  await deposeZip(page);
  await page.locator(".pi-bilan").waitFor();
  verifie((await page.locator(".pi-bilan-texte").innerText()).includes("2 produits ont déjà des photos")
    && await page.getByRole("button", { name: "Rien à envoyer" }).isDisabled(), "le même dossier une seconde fois : rien à envoyer");
  await clic(page, page.locator(".pi-completer input"));
  verifie(await page.getByRole("button", { name: "Envoyer 4 photos" }).count() === 1, "« compléter aussi » les proposerait de nouveau, en connaissance de cause");
  await clic(page, page.getByRole("button", { name: "Tout retirer" }));
  await clic(page, page.locator(".pi-lot").first().locator("summary"));
  await envoie(page, page.getByRole("button", { name: "Oui, retirer" }));
  await page.waitForURL(/ok=/);
  verifie((await page.getByRole("status").innerText()).includes("4 photos retirées de 2 produits"), `« ${await page.getByRole("status").innerText()} »`);
  verifie((await page.locator(".pi-lot").first().innerText()).includes("Retiré"), "l'envoi est marqué retiré, avec son auteur");
  verifie((await page.locator(".sous-tete").innerText()).includes("dont 2 sans photo"), "les deux produits sont de nouveau sans photo");
  // Le dossier, de nouveau : la boutique garde ses photos pour la suite.
  await deposeZip(page);
  await page.locator(".pi-bilan").waitFor();
  await clic(page, page.getByRole("button", { name: "Envoyer 4 photos" }));
  await page.locator("#t-pi-fin").waitFor({ timeout: 60_000 });
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  const journal = await page.locator("section:has(#t-journal) tbody tr").allInnerTexts();
  verifie(journal.filter((l) => l.includes("Photos importées")).length === 2 && journal.some((l) => l.includes("Photos d'un import retirées")),
    "au journal : un envoi, une ligne ; le retrait aussi");
});

await etape("la liste de mise en place", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  const carte = page.locator("section:has(#t-mise-en-place)");
  const fait = async (cle) => (await carte.locator(`[data-etape="${cle}"]`).getAttribute("data-fait")) === "";
  const faites = await carte.locator(".mp-etape[data-fait]").count();
  verifie(await fait("marque") && await fait("catalogue") && await fait("domaine") && await fait("mise_en_ligne"),
    "constatées d'office : la marque, le catalogue, le domaine, la mise en ligne");
  verifie(!(await fait("equipe")) && (await carte.locator('[data-etape="equipe"]').getByRole("link", { name: "Aller à l'étape : équipe" }).count()) === 1,
    "l'équipe reste à faire, avec le chemin pour la faire");
  verifie(/J\+0/.test(await carte.locator('[data-etape="marque"]').innerText()), "chaque étape faite est datée depuis la création (J+0)");
  await envoie(page, carte.getByRole("button", { name: "Recueil : faite" }));
  await page.waitForURL(/ok=/);
  verifie((await page.getByRole("status").innerText()).includes("« Recueil » : faite") && await fait("recueil")
    && (await carte.locator('[data-etape="recueil"]').innerText()).includes(ADMIN.email),
    "le recueil se coche à la main, avec son auteur");
  verifie((await carte.locator(".mp-compte").innerText()).includes(`${faites + 1} sur 10`), `l'avancement : ${faites + 1} sur 10`);
  await capture(page, "console-mise-en-place", true);
  await page.goto(`${CONSOLE}/`, { waitUntil: "networkidle" });
  const tuile = page.locator(".pl-tuile", { has: page.locator(".pl-nom", { hasText: "Outillage Pro Démo" }) }).last();
  verifie((await tuile.locator(".pl-mise-tete").innerText()).includes(`${faites + 1}/10`) && (await tuile.locator(".pl-mise-suite").innerText()).startsWith("Prochaine"),
    "le poste de pilotage montre l'avancement de chacune, et sa prochaine étape");
  await page.goto(`${CONSOLE}/?vue=liste`, { waitUntil: "networkidle" });
  const ligne = page.locator("tr", { hasText: "Outillage Pro Démo" }).last();
  verifie((await ligne.locator(".mp-mini").innerText()).includes(`${faites + 1}/10`), "la liste aussi");
});

/* ------------------------------------------------------------------ */
console.log("\n== 3. L'équipe de la boutique : inviter, choisir son mot de passe, retirer l'accès ==");

const GERANT = `gerant-${SUFFIXE}@outillage.test`;
const APPELS = `appels-${SUFFIXE}@outillage.test`;
const TELEPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" };
const lienAffiche = async () => (await page.locator("#lien-acces").inputValue()).trim();
const ligneDe = (email) => page.locator(".membre", { hasText: email });

/* La personne invitée ouvre son lien sur son téléphone et choisit son mot de
   passe. Rend la page (dans un contexte neuf : son téléphone à elle). */
async function ouvreLien(lien, motDePasse, nom) {
  const tel = await navigateur.newContext(TELEPHONE);
  const p = await tel.newPage();
  t.espion(p, nom, attendue);
  await p.goto(lien, { waitUntil: "networkidle" });
  await p.locator("#mot_de_passe").fill(motDePasse);
  await p.locator("#confirmation").fill(motDePasse);
  await clic(p, p.getByRole("button", { name: "Enregistrer et entrer" }));
  return { tel, p };
}

await etape("la fiche de la boutique invite à nommer son propriétaire", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  verifie((await page.locator("section:has(#t-equipe)").innerText()).includes("Personne n'entre encore dans son backoffice"),
    "une boutique neuve n'a personne dans son équipe");
  await clic(page, page.getByRole("link", { name: "Inviter le propriétaire" }));
  await page.waitForURL(new RegExp(`/boutiques/${SLUG}/equipe$`));
  await page.waitForLoadState("networkidle");
  await capture(page, "console-equipe-vide", true);
});

let lienGerant = "";
let lienAppels = "";
await etape("inviter le propriétaire : la console rend un lien à lui envoyer", async () => {
  await page.locator("#email").fill(GERANT);
  await clic(page, page.locator(".role-choix", { hasText: "Propriétaire" }));
  await envoie(page, page.getByRole("button", { name: "Inviter" }));
  await page.waitForURL(new RegExp(`/equipe\\?ok=`));
  await page.waitForLoadState("networkidle");
  lienGerant = await lienAffiche();
  verifie(new URL(lienGerant).pathname === "/bienvenue" && new URL(lienGerant).searchParams.get("jeton")?.length > 40,
    `un lien d'invitation à usage unique : ${lienGerant.slice(0, 60)}…`);
  const wa = await page.getByRole("link", { name: "Envoyer par WhatsApp" }).getAttribute("href");
  verifie(wa.startsWith("https://wa.me/?text=") && decodeURIComponent(wa).includes(lienGerant) && decodeURIComponent(wa).includes(GERANT),
    "« Envoyer par WhatsApp » prépare le message avec le lien et l'identifiant");
  verifie((await ligneDe(GERANT).innerText()).includes("Invitation en attente"), "dans la liste : invitation en attente");
  await capture(page, "console-equipe-lien");
});

await etape("inviter une personne pour confirmer les commandes", async () => {
  await page.locator("#email").fill(APPELS);
  await clic(page, page.locator(".role-choix", { hasText: "Confirmation" }));
  await envoie(page, page.getByRole("button", { name: "Inviter" }));
  await page.waitForURL(new RegExp(`/equipe\\?ok=`));
  await page.waitForLoadState("networkidle");
  lienAppels = await lienAffiche();
  verifie(lienAppels !== lienGerant && (await page.locator("#t-lien").innerText()).includes(APPELS), "un autre lien, le sien");
});

await etape("une personne déjà dans l'équipe n'est pas réinvitée", async () => {
  await page.locator("#email").fill(APPELS.toUpperCase());
  await clic(page, page.locator(".role-choix", { hasText: "Lecture seule" }));
  await envoie(page, page.getByRole("button", { name: "Inviter" }));
  await page.waitForURL(/erreur=/);
  verifie((await page.getByRole("alert").innerText()).includes("fait déjà partie de l'équipe"), `refusé : « ${await page.getByRole("alert").innerText()} »`);
  verifie(await lienAffiche() === lienAppels, "son lien d'invitation reste valable (aucun nouveau jeton)");
});

await etape("une personne qui a déjà un compte entre avec son mot de passe, sans lien", async () => {
  const email = `ancien-${SUFFIXE}@outillage.test`;
  await gotrue("POST", "/admin/users", { email, password: "mot-de-passe-habituel", email_confirm: true });
  await page.locator("#email").fill(email);
  await clic(page, page.locator(".role-choix", { hasText: "Préparation" }));
  await envoie(page, page.getByRole("button", { name: "Inviter" }));
  await page.waitForURL(/ok=/);
  verifie((await page.getByRole("status").innerText()).includes("se connecte avec son mot de passe habituel"),
    `« ${await page.getByRole("status").innerText()} »`);
  verifie((await ligneDe(email).innerText()).includes("Actif"), "elle est dans l'équipe, active");
});

await etape("l'aperçu que fabrique WhatsApp ne grille pas le lien", async () => {
  const u = new URL(lienAppels);
  const r = await brut(await navigateur.newContext(), "GET", u.pathname + u.search);
  verifie(r.status === 200, `ouvrir le lien sans rien envoyer : HTTP ${r.status}, le jeton n'est pas consommé`);
});

await etape("sur son téléphone, elle choisit son mot de passe et entre dans le backoffice", async () => {
  const tel = await navigateur.newContext(TELEPHONE);
  const p = await tel.newPage();
  t.espion(p, "bienvenue", attendue);
  await p.goto(lienAppels, { waitUntil: "networkidle" });
  verifie((await p.locator("h1").innerText()) === "Bienvenue" && (await p.locator("#email").inputValue()) === APPELS,
    "la page d'accueil montre son identifiant");
  await capture(p, "console-bienvenue-telephone");
  await p.locator("#mot_de_passe").fill("court");
  await p.locator("#confirmation").fill("court");
  await p.locator("form").evaluate((f) => f.noValidate = true);
  await clic(p, p.getByRole("button", { name: "Enregistrer et entrer" }));
  await p.waitForURL(/erreur=/);
  verifie((await p.getByRole("alert").innerText()).includes("10 caractères"), "un mot de passe trop court est refusé, sans griller le lien");
  await p.locator("#mot_de_passe").fill("le colis part demain");
  await p.locator("#confirmation").fill("le colis part demain");
  await clic(p, p.getByRole("button", { name: "Enregistrer et entrer" }));
  await p.waitForURL(new RegExp(`/gestion/${SLUG}`));
  await p.waitForLoadState("networkidle");
  verifie((await p.locator(".app-haut .app-marque-nom").innerText()).includes("Outillage Pro Démo") && (await p.locator("h1").innerText()) === "Commandes",
    "elle arrive dans le backoffice de la boutique, sur ses commandes");
  await capture(p, "console-bienvenue-backoffice");
  await tel.close();
});

await etape("un lien qui a servi ne marche plus", async () => {
  const { tel, p } = await ouvreLien(lienAppels, "une autre phrase secrète", "lien-servi");
  await p.waitForURL(/perime=1/);
  verifie((await p.locator("h1").innerText()) === "Ce lien ne marche plus", "le même lien, une seconde fois : « Ce lien ne marche plus »");
  await capture(p, "console-bienvenue-perime");
  await tel.close();
});

await etape("le propriétaire, lui, passe d'abord par la double authentification", async () => {
  const { tel, p } = await ouvreLien(lienGerant, "la valise est prête", "bienvenue-gerant");
  await p.waitForURL(/double-authentification/);
  verifie(await p.locator("[data-secret-totp]").count() === 1, "le propriétaire enregistre son application d'authentification avant d'entrer");
  await tel.close();
});

let appels;
await etape("la liste de l'équipe suit : invitations acceptées, journal", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}/equipe`, { waitUntil: "networkidle" });
  const ligne = await ligneDe(APPELS).innerText();
  verifie(ligne.includes("Actif") && /vu le \d/.test(ligne), `elle est active, avec sa dernière connexion (${ligne.match(/vu le [^·\n]+/)?.[0]})`);
  verifie((await ligneDe(GERANT).innerText()).includes("double authentification pas encore activée"),
    "le propriétaire : double authentification pas encore activée");
  verifie(await page.locator("#lien-acces").count() === 0, "les liens qui ont servi ne sont plus affichés");
  await capture(page, "console-equipe-liste", true);
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  const journal = await page.locator("section:has(#t-journal) tbody tr").allInnerTexts();
  verifie(journal.filter((l) => l.includes("Membre invité")).length === 3 && journal.filter((l) => l.includes("Lien d'accès remis")).length === 2,
    "le journal garde les trois invitations et les deux liens remis");
  // Sa session à elle, pour la suite (un nouveau téléphone, connexion ordinaire).
  appels = await navigateur.newContext(TELEPHONE);
  const p = await appels.newPage();
  t.espion(p, "appels", attendue);
  await p.goto(CONSOLE + "/connexion", { waitUntil: "networkidle" });
  await p.locator("#email").fill(APPELS);
  await p.locator("#mot_de_passe").fill("le colis part demain");
  await p.keyboard.press("Enter");
  await p.waitForURL(new RegExp(`/gestion/${SLUG}`));
  verifie(true, "elle se reconnecte avec le mot de passe qu'elle a choisi");
});

await etape("le seul propriétaire ne peut pas perdre son accès", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}/equipe`, { waitUntil: "networkidle" });
  await envoie(page, ligneDe(GERANT).getByRole("button", { name: "Retirer l'accès" }));
  await page.waitForURL(/erreur=/);
  verifie((await page.getByRole("alert").innerText()).includes("au moins un propriétaire actif"), `refusé : « ${await page.getByRole("alert").innerText()} »`);
});

await etape("retirer l'accès : elle est dehors aussitôt ; le rendre", async () => {
  await envoie(page, ligneDe(APPELS).getByRole("button", { name: "Retirer l'accès" }));
  await page.waitForURL(/ok=/);
  verifie((await ligneDe(APPELS).innerText()).includes("Accès retiré"), "la liste la montre sans accès");
  const r = await brut(appels, "GET", `/gestion/${SLUG}`);
  verifie(r.status === 307 || r.status === 303 ? r.location.includes("/refuse") : false, `sa session ouverte ne mène plus qu'à /refuse (${r.status} → ${r.location})`);
  await envoie(page, ligneDe(APPELS).getByRole("button", { name: "Rendre l'accès" }));
  await page.waitForURL(/ok=/);
  const r2 = await brut(appels, "GET", `/gestion/${SLUG}`);
  verifie(r2.status === 200, `accès rendu : son backoffice s'ouvre de nouveau (HTTP ${r2.status})`);
});

await etape("mot de passe oublié : un nouveau lien, le même compte", async () => {
  await envoie(page, ligneDe(APPELS).getByRole("button", { name: "Lien de mot de passe" }));
  await page.waitForURL(/ok=/);
  await page.waitForLoadState("networkidle");
  const lien = await lienAffiche();
  verifie(new URL(lien).searchParams.get("type") === "recovery" && (await page.locator("#t-lien").innerText()).includes("choisir un mot de passe"),
    "un lien pour choisir un nouveau mot de passe");
  const { tel, p } = await ouvreLien(lien, "nouvelle phrase du mardi", "nouveau-mdp");
  await p.waitForURL(new RegExp(`/gestion/${SLUG}`));
  verifie(true, "nouveau mot de passe enregistré, elle est dans le backoffice");
  await tel.close();
  await appels.close();
});

/* ------------------------------------------------------------------ */
console.log("\n== 3 bis. Le support : entrer dans le backoffice du client ==");

const MOTIF_REGARDER = "Le propriétaire ne trouve pas où régler ses frais de livraison";
const MOTIF_AGIR = "Débloquer une commande restée en attente";

await etape("la page Support de la boutique", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  await clic(page, page.getByRole("link", { name: "Support" }));
  await page.waitForURL(new RegExp(`/boutiques/${SLUG}/support$`));
  await page.waitForLoadState("networkidle");
  verifie((await page.locator("#t-sp-entrer").innerText()).includes("Entrer dans son backoffice"), "un formulaire pour entrer dans son backoffice");
  verifie((await page.locator("section:has(#t-sp-historique)").innerText()).includes("Personne de SkanEcom n'est encore entré"),
    "personne n'y est encore entré");
  verifie(await page.locator("input[name=role][value=lecture]").isChecked(), "« Regarder » est proposé d'abord");
});

await etape("sans motif, ou pour devenir propriétaire : refusé par la base", async () => {
  const erreurDe = (r) => new URL(r.location, CONSOLE).searchParams.get("erreur") ?? "";
  const r = await brut(ctx, "POST", `/boutiques/${SLUG}/support/ouvrir`, { entetes: { origin: CONSOLE }, formulaire: { motif: "ok", role: "lecture", minutes: "60" } });
  verifie(r.status === 303 && erreurDe(r).includes("pourquoi vous entrez"), `motif trop court : « ${erreurDe(r)} »`);
  const r2 = await brut(ctx, "POST", `/boutiques/${SLUG}/support/ouvrir`, { entetes: { origin: CONSOLE }, formulaire: { motif: MOTIF_REGARDER, role: "proprietaire", minutes: "60" } });
  verifie(r2.status === 303 && erreurDe(r2).includes("regarder, ou agir"), "mode « propriétaire » posté à la main : refusé");
  const r3 = await brut(ctx, "POST", `/boutiques/${SLUG}/support/ouvrir`, { entetes: { origin: CONSOLE }, formulaire: { motif: MOTIF_REGARDER, role: "lecture", minutes: "1440" } });
  verifie(r3.status === 303 && erreurDe(r3).includes("15 minutes à 4 heures"), "une journée entière : refusée");
});

await etape("regarder : le backoffice du client, avec son bandeau", async () => {
  await page.locator("#sp-motif").fill(MOTIF_REGARDER);
  await page.locator("#sp-duree").selectOption("60");
  await clic(page, page.getByRole("button", { name: "Entrer dans son backoffice" }));
  await page.waitForURL(new RegExp(`/gestion/${SLUG}$`));
  await page.waitForLoadState("networkidle");
  const bandeau = await page.locator(".sp-bandeau").innerText();
  verifie(bandeau.includes("Accès support") && bandeau.includes("regarder seulement") && bandeau.includes(MOTIF_REGARDER),
    `le bandeau rappelle l'accès : « ${bandeau.replace(/\s+/g, " ").slice(0, 110)}… »`);
  verifie(/jusqu.à \d{2}:\d{2}/.test(bandeau), "et son heure de fin");
  verifie((await page.locator(".app-cote .app-compte-role").innerText()).includes("Support"), "le compte se présente comme le support");
  verifie(await page.getByRole("link", { name: "Équipe" }).count() === 0, "en mode « regarder », pas d'onglet Équipe");
  await capture(page, "backoffice-support-regarder", true);
  await page.goto(`${CONSOLE}/gestion/${SLUG}/reglages`, { waitUntil: "networkidle" });
  verifie((await page.locator(".message", { hasText: "Lecture seule" }).count()) === 1, "les réglages se lisent, sans se changer");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${CONSOLE}/gestion/${SLUG}`, { waitUntil: "networkidle" });
  const boite = await page.locator(".sp-bandeau").boundingBox();
  verifie(boite && boite.width <= 390 && boite.x >= 0, `sur téléphone, le bandeau tient dans l'écran (${Math.round(boite?.width ?? 0)} px)`);
  await capture(page, "backoffice-support-telephone");
  await page.setViewportSize({ width: 1366, height: 860 });
});

await etape("fermer l'accès depuis le bandeau : retour à la console, porte refermée", async () => {
  await page.goto(`${CONSOLE}/gestion/${SLUG}`, { waitUntil: "networkidle" });
  await clic(page, page.locator(".sp-bandeau").getByRole("button", { name: "Fermer l'accès" }));
  await page.waitForURL(new RegExp(`/boutiques/${SLUG}/support\\?ok=`));
  verifie((await page.getByRole("status").innerText()).includes("Accès support fermé"), `« ${await page.getByRole("status").innerText()} »`);
  const r = await brut(ctx, "GET", `/gestion/${SLUG}`);
  verifie((r.status === 307 || r.status === 303) && r.location.includes(`/boutiques/${SLUG}/support?fin=1`),
    `le backoffice ne s'ouvre plus : ${r.status} → ${r.location}`);
  verifie((await page.locator(".sp-acces").first().innerText()).includes("fermé à"), "l'accès passe dans l'historique, fermé");
});

await etape("agir comme un administrateur, et ce que voit le propriétaire", async () => {
  await page.locator("#sp-motif").fill(MOTIF_AGIR);
  await clic(page, page.locator(".choix-carte", { hasText: "Agir comme un administrateur" }));
  await page.locator("#sp-duree").selectOption("30");
  await clic(page, page.getByRole("button", { name: "Entrer dans son backoffice" }));
  await page.waitForURL(new RegExp(`/gestion/${SLUG}$`));
  verifie((await page.locator(".sp-bandeau").innerText()).includes("agir comme administrateur"), "le bandeau dit le mode");
  await clic(page, page.locator(".app-cote").getByRole("link", { name: "Équipe" }));
  await page.waitForURL(new RegExp(`/gestion/${SLUG}/equipe$`));
  await page.waitForLoadState("networkidle");
  verifie((await page.locator(".message", { hasText: "le propriétaire de la boutique gère son équipe" }).count()) === 1,
    "l'équipe se voit, sans se changer : elle reste au propriétaire");
  const acces = await page.locator("section:has(#t-support) .sp-acces").allInnerTexts();
  verifie(acces.length === 2 && acces[0].includes(MOTIF_AGIR) && acces[1].includes(MOTIF_REGARDER) && acces[0].includes(ADMIN.email),
    "dans son backoffice, le propriétaire lit qui est entré, dans quel mode et pourquoi");
  await page.locator("section:has(#t-support)").scrollIntoViewIfNeeded();
  await capture(page, "backoffice-equipe-support");
});

await etape("le support définit une caractéristique ; l'import remplit la fiche technique", async () => {
  // Au backoffice du client (accès « agir ») : la puissance, en watts, pour les perceuses.
  await page.goto(`${CONSOLE}/gestion/${SLUG}/produits/caracteristiques`, { waitUntil: "networkidle" });
  const form = page.locator("section:has(#t-nouvel-attribut) form");
  await form.locator("#label-nouveau").fill("Puissance");
  await form.locator("#unite-nouveau").fill("W");
  await clic(page, form.locator(".opt", { hasText: "Perceuses" }).first());
  await envoie(page, form.getByRole("button", { name: "Ajouter la caractéristique" }));
  await page.waitForURL(/ok=/);
  verifie((await page.getByRole("status").innerText()).includes("« Puissance » ajoutée"), "« Puissance » définie par le support, au nom de l'administrateur");
  // Puis, dans la console, le même fichier avec la colonne « Puissance (W) ».
  await page.goto(`${CONSOLE}/boutiques/${SLUG}/import`, { waitUntil: "networkidle" });
  const puissances = { "PP18-SEULE": "710 W", "PP18-KIT": "710" };
  await page.locator("#fichier").setInputFiles({
    name: "catalogue-outillage-puissance.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: classeur([[...ENTETES, "Puissance (W)"], ...CATALOGUE.map((l) => [...l, puissances[l[1]] ?? ""])]),
  });
  await clic(page, page.getByRole("button", { name: "Vérifier le fichier" }));
  await page.waitForURL(/\/import\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  const texte = await page.locator("main").innerText();
  verifie(/Fiche technique : Puissance · 1 produit/.test(texte), "le rapport reconnaît la colonne comme la fiche technique, pas comme un axe");
  verifie(/710\sW/.test(await page.locator("section:has(#t-apercu)").innerText()), "l'aperçu montre la puissance avec son unité");
  await envoie(page, page.getByRole("button", { name: /^Importer 2 produits/ }));
  await page.waitForURL(new RegExp(`/boutiques/${SLUG}\\?ok=`));
  const vitrine = await ctx.newPage();
  await vitrine.goto(`${VITRINE}/categorie/perceuses/puissance=710`, { waitUntil: "networkidle" });
  const liste = await vitrine.locator("main").innerText();
  verifie(liste.includes("Perceuse à percussion 18 V") && /Puissance/i.test(liste) && /710\sW/.test(liste),
    "la vitrine filtre sur la puissance importée");
  await vitrine.close();
});

await etape("la console montre l'accès ouvert", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}/support`, { waitUntil: "networkidle" });
  const carte = await page.locator(".sp-actif").innerText();
  verifie(carte.includes("Vous êtes dans le backoffice") && carte.includes("Agir comme un administrateur") && /encore \d+ min/.test(carte),
    `« ${carte.replace(/\s+/g, " ").slice(0, 100)}… »`);
  verifie((await page.locator("#t-sp-entrer").innerText()).includes("Changer de mode ou prolonger"), "le formulaire propose de changer de mode ou de prolonger");
  await capture(page, "console-support", true);
});

await etape("le propriétaire ferme lui-même l'accès du support", async () => {
  const bureau = await navigateur.newContext({ viewport: { width: 1366, height: 860 }, locale: "fr-FR" });
  const p = await bureau.newPage();
  t.espion(p, "proprietaire", attendue);
  await p.goto(CONSOLE + "/connexion", { waitUntil: "networkidle" });
  await p.locator("#email").fill(GERANT);
  await p.locator("#mot_de_passe").fill("la valise est prête");
  await p.keyboard.press("Enter");
  await p.waitForURL(/double-authentification/);
  await p.waitForLoadState("networkidle");
  const secretGerant = (await p.locator("[data-secret-totp]").textContent()).trim();
  await clic(p, p.locator("#code"));
  await tape(p, totp(secretGerant));
  await p.keyboard.press("Enter");
  await p.waitForURL(new RegExp(`/gestion/${SLUG}`));
  verifie(await p.locator(".sp-bandeau").count() === 0, "chez lui, pas de bandeau : il est de l'équipe");
  await p.goto(`${CONSOLE}/gestion/${SLUG}/equipe`, { waitUntil: "networkidle" });
  const ouvert = p.locator("section:has(#t-support) .sp-acces[data-ouvert]");
  verifie((await ouvert.innerText()).includes(MOTIF_AGIR), "il voit l'accès du support ouvert, avec son motif");
  await ouvert.scrollIntoViewIfNeeded();
  await capture(p, "backoffice-proprietaire-support");
  await clic(p, ouvert.getByRole("button", { name: "Fermer cet accès" }));
  await p.waitForURL(/ok=/);
  verifie((await p.getByRole("status").innerText()).includes("SkanEcom n'est plus dans votre backoffice"), `« ${await p.getByRole("status").innerText()} »`);
  verifie(await p.locator("section:has(#t-support) .sp-acces[data-ouvert]").count() === 0, "l'accès passe dans l'historique");
  await bureau.close();

  const r = await brut(ctx, "GET", `/gestion/${SLUG}`);
  verifie((r.status === 307 || r.status === 303) && r.location.includes("/support?fin=1"), `le support est dehors aussitôt : ${r.status} → ${r.location}`);
  await page.goto(`${CONSOLE}/boutiques/${SLUG}/support`, { waitUntil: "networkidle" });
  verifie(await page.locator(".sp-actif").count() === 0, "dans la console, la carte de l'accès ouvert disparaît");
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  const journal = await page.locator("section:has(#t-journal) tbody tr").allInnerTexts();
  verifie(journal.filter((l) => l.includes("Accès support ouvert")).length === 2
    && journal.filter((l) => l.includes("Accès support fermé")).length === 2
    && journal.some((l) => l.includes("Accès support fermé") && l.includes(GERANT)),
  "le journal garde les deux ouvertures et les deux fermetures, dont celle du propriétaire");
});

/* ------------------------------------------------------------------ */
console.log("\n== 4. Les portes ==");

await etape("un formulaire posté depuis un autre site est refusé", async () => {
  const r = await brut(ctx, "POST", "/nouvelle-boutique/creer", {
    entetes: { origin: "https://site-pirate.example" },
    formulaire: { nom: "Pirate", slug: `pirate-${SUFFIXE}`, hote: `pirate-${SUFFIXE}.localhost`, theme: "editorial" },
  });
  verifie(r.status === 403, `origine étrangère, même avec la session de l'administrateur : HTTP ${r.status}`);
  const r2 = await brut(ctx, "POST", "/nouvelle-boutique/creer", {
    formulaire: { nom: "Sans origine", slug: `sans-origine-${SUFFIXE}`, hote: `sans-origine-${SUFFIXE}.localhost`, theme: "editorial" },
  });
  verifie(r2.status === 403, `sans en-tête Origin : HTTP ${r2.status}`);
});

await etape("se déconnecter", async () => {
  await clic(page, page.getByRole("button", { name: "Se déconnecter" }));
  await page.waitForURL(/connexion/);
  await page.goto(CONSOLE + "/", { waitUntil: "networkidle" });
  verifie(new URL(page.url()).pathname === "/connexion", "après déconnexion, la console redemande de se connecter");
});

await etape("deuxième connexion : seulement le code, plus de QR code", async () => {
  await page.locator("#email").fill(ADMIN.email);
  await page.locator("#mot_de_passe").fill(ADMIN.mdp);
  await page.keyboard.press("Enter");
  await page.waitForURL(/double-authentification/);
  verifie(await page.locator("[data-secret-totp]").count() === 0, "le facteur existe : aucun QR code, juste le code");
  await capture(page, "console-double-authentification-code");
  // Un nouveau pas de 30 s : un code déjà servi ne doit pas l'être deux fois.
  await pause(((30 - (Math.floor(Date.now() / 1000) % 30)) + 1) * 1000);
  await clic(page, page.locator("#code"));
  await tape(page, totp(secret));
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => u.pathname === "/");
  verifie(true, "le code de l'application ouvre la console");
});

/* ------------------------------------------------------------------ */
console.log("\n== 5. Les e-mails ==");

await etape("la galerie des e-mails, aux couleurs de la boutique choisie", async () => {
  await clic(page, page.locator(".app-cote").getByRole("link", { name: "E-mails" }));
  await page.waitForURL(/\/courriels/);
  // Pas « networkidle » : les cadres des aperçus (srcdoc, sans script) ne
  // signalent jamais leur chargement à Playwright, qui attendrait sans fin.
  await page.locator(".crl-cadre").nth(3).waitFor({ timeout: 15_000 }).catch(() => {});
  await pause(600);
  verifie(await page.locator(".crl-cadre").count() === 4, "quatre e-mails : le code, la nouvelle adresse, l'invitation, le mot de passe");
  const sujet = await page.locator(".crl-sujet").first().innerText();
  verifie(/^Votre code de connexion — .+/.test(sujet), `le sujet dit qui écrit : « ${sujet} »`);
  await capture(page, "console-courriels", true);
  await page.goto(CONSOLE + "/courriels?boutique=quincaillerie-demo&vue=telephone", { waitUntil: "load" });
  await page.locator(".crl-cadre").nth(3).waitFor({ timeout: 15_000 }).catch(() => {});
  await pause(600);
  verifie((await page.locator(".crl-sujet").first().innerText()).includes("Quincaillerie du Sud"), "une autre boutique : son nom dans le sujet");
  await capture(page, "console-courriels-quincaillerie-telephone", true);
});

await etape("le crochet de Supabase : l'e-mail de la boutique, signé ou rien", async () => {
  const adresse = `acheteuse-${SUFFIXE}@exemple.tn`;
  const evenement = {
    user: { email: adresse },
    email_data: { token: "246810", email_action_type: "magiclink", redirect_to: "http://mode.localhost:4200/compte", site_url: CONSOLE },
  };
  const sans = await crochetCourriel(evenement, { signe: false });
  verifie(sans.status === 401, `sans la bonne signature : refusé (HTTP ${sans.status})`);
  const vieux = await crochetCourriel(evenement, { decalageS: 3600 });
  verifie(vieux.status === 401, `signé il y a une heure (rejoué) : refusé (HTTP ${vieux.status})`);
  const r = await crochetCourriel(evenement);
  verifie(r.status === 200, `signé : accepté (HTTP ${r.status} ${r.texte})`);
  const rendu = await (await fetch(`${RELAIS}/email-dev/rendu/dernier?email=${encodeURIComponent(adresse)}`)).json();
  verifie(rendu.nom === "Maison Selma" && rendu.sujet === "Votre code de connexion — Maison Selma",
    `au nom de la boutique du lien de retour : « ${rendu.nom} », « ${rendu.sujet} »`);
  verifie(rendu.html.includes("246810") && rendu.texte.includes("246810"), "le code, dans l'e-mail et dans sa version texte");
  const vue = await navigateur.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await vue.setContent(rendu.html, { waitUntil: "load" });
  await capture(vue, "courriel-code-selma-telephone", true);
  await vue.close();
  const inconnu = await crochetCourriel({ user: { email: adresse }, email_data: { email_action_type: "inconnu" } });
  verifie(inconnu.status === 400, `un type d'e-mail inconnu : rien ne part (HTTP ${inconnu.status})`);
});
await ctx.close();

await etape("un compte qui n'est pas administrateur est refusé avant la double authentification", async () => {
  const email = `membre-${SUFFIXE}@skanecom.test`;
  await gotrue("POST", "/admin/users", { email, password: "mot-de-passe-du-membre", email_confirm: true });
  const autre = await navigateur.newContext({ viewport: { width: 1366, height: 860 }, locale: "fr-FR" });
  const p = await autre.newPage();
  t.espion(p, "console-membre", attendue);
  await p.goto(CONSOLE + "/connexion", { waitUntil: "networkidle" });
  await p.locator("#email").fill(email);
  await p.locator("#mot_de_passe").fill("mot-de-passe-du-membre");
  await p.keyboard.press("Enter");
  await p.waitForURL(/refuse/);
  verifie((await p.locator("h1").innerText()) === "Accès refusé", `compte ordinaire : « ${await p.locator("h1").innerText()} »`);
  const r2 = await brut(autre, "GET", "/");
  verifie(r2.location.includes("/refuse"), `et la console reste fermée pour lui (« / » → ${r2.location})`);
  await capture(p, "console-acces-refuse");
  await autre.close();
});

await navigateur.close();
note("INFO  ", `boutique d'essai : ${SLUG} (${HOTE})`);
process.exit(t.bilan());
