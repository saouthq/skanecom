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
async function crochetCourriel(evenement, { signe = true, decalageS = 0, chemin = "/crochets/courriel" } = {}) {
  const corps = JSON.stringify(evenement);
  const id = `msg_${Date.now()}`;
  const horodatage = String(Math.floor(Date.now() / 1000) - decalageS);
  const signature = createHmac("sha256", SECRET_CROCHET).update(`${id}.${horodatage}.${corps}`).digest("base64");
  return new Promise((ok, ko) => {
    const req = http.request({
      host: "127.0.0.1", port: Number(t.port), method: "POST", path: chemin,
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

/* La vitrine annonce le numéro avant de demander un code par SMS
   (components/Connexion.tsx → /compte/code-sms), comme le ferait son navigateur. */
async function annonceSms(hoteVitrine, telephone) {
  const corps = JSON.stringify({ telephone });
  const vitrine = new URL(t.adresse(hoteVitrine));
  return new Promise((ok, ko) => {
    const req = http.request({
      host: "127.0.0.1", port: Number(t.port), method: "POST", path: "/compte/code-sms",
      headers: { host: vitrine.host, origin: vitrine.origin, "content-type": "application/json", "content-length": Buffer.byteLength(corps) },
    }, (r) => { r.resume(); r.on("end", () => ok(r.statusCode)); });
    req.on("error", ko);
    req.end(corps);
  });
}

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
  // Facultative par défaut (réglage de la plateforme) : conseillée, avec « Plus tard ».
  verifie((await page.locator(".porte").innerText()).includes("Conseillée"), "elle est conseillée, pas exigée (réglage par défaut)");
  verifie(await page.getByRole("button", { name: "Plus tard" }).isVisible(), "« Plus tard » permet de la reporter");
  await capture(page, "console-double-authentification-inscription");
});

await etape("proposée, pas exigée : la console s'ouvrirait déjà", async () => {
  const r = await brut(ctx, "GET", "/");
  verifie(r.status === 200, `sans application enregistrée, « / » répond déjà (${r.status}) : on peut passer et l'activer plus tard`);
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
  // Une première activation mène aux codes de secours, avant le reste.
  await page.waitForURL((u) => u.pathname === "/compte");
  verifie((await page.locator("#secours").innerText()).includes("Créez maintenant vos codes de secours"),
    "activée : « Mon compte » propose aussitôt les codes de secours");
  await page.goto(`${CONSOLE}/`, { waitUntil: "networkidle" });
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
  await page.getByRole("link", { name: "Liste", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/vue=liste/);
  await page.waitForLoadState("networkidle");
  const lignes = await page.locator("tbody tr").allInnerTexts();
  verifie(lignes.some((l) => l.includes("Maymar")) && lignes.some((l) => l.includes("Quincaillerie")),
    `en liste : ${lignes.length} boutiques, dont Maymar et la quincaillerie`);
  await capture(page, "console-tableau-liste");
});

await etape("les boutiques de démonstration à part : la synthèse ne compte que les clientes", async () => {
  await page.goto(CONSOLE + "/", { waitUntil: "networkidle" });
  const groupes = (await page.locator(".pl-groupe").allInnerTexts()).map((g) => g.replace(/\s+/g, " ").trim());
  verifie(groupes.length === 2 && groupes[0].startsWith("Clientes") && groupes[1].startsWith("Démonstrations"),
    `deux groupes de tuiles : ${groupes.join(" | ")}`);
  const demos = await page.locator(".pl-tuile", { has: page.locator(".pl-demo") }).locator(".pl-nom").allInnerTexts();
  verifie(["Maison Selma", "Dar Alia", "Yasmine Beauté", "Quincaillerie du Sud"].every((n) => demos.includes(n)) && !demos.includes("Maymar"),
    `marquées « Démonstration » : ${demos.join(", ")} ; Maymar est une cliente`);
  const synthese = (await page.locator(".pl-synthese").innerText()).replace(/\s+/g, " ");
  verifie(/Clientes \d+/.test(synthese) && synthese.includes("de démonstration à part") && synthese.includes("clientes seules"), `les chiffres : « ${synthese} »`);
  // Dar Alia passe cliente depuis sa page, puis redevient une démonstration.
  await page.goto(CONSOLE + "/boutiques/dar-alia", { waitUntil: "networkidle" });
  verifie((await page.locator("h1").first().innerText()).includes("Démonstration"), "sa page le dit, à côté de son statut");
  const carte = page.locator("section:has(#t-demonstration)");
  await envoie(page, carte.getByRole("button", { name: "C'est une boutique cliente" }));
  verifie((await page.getByRole("status").first().innerText()).includes("Boutique cliente"), "« C'est une boutique cliente » : dit, enregistré");
  verifie(!(await page.locator("h1").first().innerText()).includes("Démonstration"), "l'étiquette quitte l'en-tête");
  verifie((await page.locator("section:has(#t-journal)").innerText()).includes("Cliente ou démonstration"), "le journal de la boutique trace le geste");
  await page.goto(CONSOLE + "/", { waitUntil: "networkidle" });
  const clientes = await page.locator(".pl-grille").first().locator(".pl-nom").allInnerTexts();
  verifie(clientes.includes("Dar Alia"), `elle rejoint les clientes : ${clientes.join(", ")}`);
  await page.goto(CONSOLE + "/boutiques/dar-alia", { waitUntil: "networkidle" });
  await envoie(page, page.locator("section:has(#t-demonstration)").getByRole("button", { name: "C'est une boutique de démonstration" }));
  verifie((await page.locator("h1").first().innerText()).includes("Démonstration"), "et redevient une démonstration");
});

await etape("« À surveiller » rangé : ce qui presse, à plus tard d'un geste ; les informations repliées", async () => {
  await page.goto(CONSOLE + "/", { waitUntil: "networkidle" });
  const pressants = page.locator(".pl-vigilance-liste > li");
  const avant = await pressants.count();
  verifie(avant > 0 && (await pressants.first().getAttribute("data-niveau")) !== "info", `ce qui presse d'abord : ${avant} ligne(s), sans les simples informations`);
  const badge = Number(await page.locator(".app-cote .app-nav-compte").innerText());
  verifie(badge === avant, `la navigation compte ce qui presse (${badge})`);
  const infos = page.locator(".pl-infos");
  verifie((await infos.getAttribute("open")) === null && (await infos.locator("summary").innerText()).includes("sans formule"),
    `les informations, repliées : « ${(await infos.locator("summary").innerText()).replace(/\s+/g, " ")} »`);
  await clic(page, infos.locator("summary"));
  verifie(await infos.locator(".pl-puce", { hasText: "Maymar" }).first().isVisible(), "dépliées : un genre par ligne, ses boutiques en pastilles");
  // Mettre la ligne des commandes à confirmer à plus tard, au clavier.
  const ligne = pressants.filter({ hasText: "à confirmer" }).first();
  await clic(page, ligne.locator(".pl-plus-tard > summary"));
  await page.keyboard.press("Tab");
  verifie((await page.evaluate(() => document.activeElement?.textContent)) === "Jusqu'à demain", "Tab entre dans le menu : « Jusqu'à demain »");
  await envoie(page, () => page.keyboard.press("Enter"));
  verifie((await page.locator(".pl-vigilance-retour").innerText()).includes("il reviendra"), `« ${await page.locator(".pl-vigilance-retour").innerText()} »`);
  verifie(await pressants.count() === avant - 1 && (await page.locator(".pl-reportes summary").innerText()).includes("1 mis à plus tard"),
    "la ligne quitte ce qui presse et passe dans « mis à plus tard »");
  const compteur = page.locator(".app-cote .app-nav-compte");
  verifie((await compteur.count() ? Number(await compteur.innerText()) : 0) === avant - 1, "le compteur de la navigation suit");
  await capture(page, "console-accueil-plus-tard");
  await clic(page, page.locator(".pl-reportes > summary"));
  await envoie(page, page.locator(".pl-reportes").getByRole("button", { name: "Reprendre" }));
  verifie(await pressants.count() === avant && await page.locator(".pl-reportes").count() === 0, "« Reprendre » : elle revient, tout de suite");
});

await etape("trier les boutiques, exporter ce qu'on voit", async () => {
  await page.locator("#pl-tri").selectOption("nom");
  await page.waitForURL(/tri=nom/);
  await page.waitForLoadState("networkidle");
  const noms = await page.locator(".pl-grille").first().locator(".pl-nom").allInnerTexts();
  verifie(noms.join("|") === [...noms].sort((a, b) => a.localeCompare(b, "fr")).join("|"), `changer le tri suffit (sans « Filtrer ») : ${noms.join(", ")}`);
  const csv = await page.evaluate(async () => (await fetch(document.querySelector(".pl-exporter").href)).text());
  const lignes = csv.replace(/^\uFEFF/, "").trim().split("\r\n");
  verifie(lignes[0].startsWith("Boutique;Identifiant;Domaine;Statut") && lignes.length > 3 && lignes.some((l) => l.startsWith("Maymar;maymar;")),
    `l'export : ${lignes.length - 1} boutiques, dans l'ordre choisi`);
  await page.goto(CONSOLE + "/", { waitUntil: "networkidle" });
});

await etape("la galerie des modèles : chaque structure, sa démonstration en aperçu vivant", async () => {
  const stats = [];
  const compte = (r) => { if (new URL(r.url()).pathname === "/stats") stats.push(r.url()); };
  page.context().on("request", compte);
  await clic(page, page.locator(".app-cote, nav").getByRole("link", { name: "Modèles" }).first());
  await page.waitForURL(/\/modeles$/);
  await page.waitForLoadState("networkidle");
  const titres = await page.locator(".mo-modele h2").allInnerTexts();
  verifie(titres.length === 6 && titres.slice(0, 4).every((x) => ["Bento", "Immersif", "Commerce", "Monoproduit"].includes(x)),
    `six structures, celles qui ont leur démonstration d'abord : ${titres.join(", ")}`);
  verifie((await page.locator(".mo-cadre iframe").count()) === 4 && (await page.locator(".mo-sans-demo").count()) === 2,
    "quatre aperçus vivants ; l'Éditorial et la Technique disent qu'ils n'ont pas encore de démonstration");
  const bento = page.locator(".mo-modele", { has: page.locator("h2", { hasText: /^Bento$/ }) });
  await bento.scrollIntoViewIfNeeded();
  // Les aperçus se chargent à l'approche (loading="lazy") : on attend que chacun ait son titre.
  const charge = async (hote) => {
    for (let i = 0; i < 40; i++) {
      const f = page.frames().find((x) => x.url().includes(hote));
      if (f && await f.title().catch(() => "")) return;
      await page.waitForTimeout(500);
    }
  };
  await charge("maison.localhost");
  await charge("mode.localhost");
  const cadre = page.frames().find((f) => f.url().includes("maison.localhost"));
  verifie(Boolean(cadre) && (await cadre.title()).startsWith("Dar Alia"), "Bento : la vraie vitrine de Dar Alia, en réduction");
  verifie((await page.frames().find((f) => f.url().includes("mode.localhost"))?.locator(".pub-consentement").count()) === 0,
    "dans le cadre, Maison Selma ne demande pas l'accord pour ses pixels");
  // Au clavier : de « Ordinateur », Tab puis Entrée sur « Téléphone ».
  await bento.getByRole("button", { name: "Ordinateur" }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  verifie(await bento.getByRole("button", { name: "Téléphone" }).getAttribute("aria-pressed") === "true", "au clavier, l'aperçu passe au format téléphone");
  const r = await bento.locator(".mo-cadre").boundingBox();
  const f = await bento.locator(".mo-cadre iframe").boundingBox();
  verifie(f.height <= r.height && Math.abs(f.x + f.width / 2 - (r.x + r.width / 2)) < 2, "le téléphone tient dans le cadre, centré");
  await capture(page, "console-modeles");
  verifie(stats.length === 0, "les aperçus ne comptent aucune visite dans les statistiques des démonstrations");
  page.context().off("request", compte);
  const [onglet] = await Promise.all([page.context().waitForEvent("page"), bento.locator(".mo-ouvrir").click()]);
  await onglet.waitForLoadState("domcontentloaded");
  verifie(new URL(onglet.url()).host.startsWith("maison.localhost"), `un geste sur l'aperçu ouvre la vitrine dans un onglet (${onglet.url()})`);
  await onglet.close();
  await clic(page, bento.getByRole("link", { name: "Créer une boutique sur ce modèle" }));
  await page.waitForURL(/nouvelle-boutique\?theme=bento/);
  verifie(await page.locator('input[name="theme"]:checked').getAttribute("value") === "bento", "« Créer une boutique sur ce modèle » : la structure Bento déjà choisie");
});

/* ------------------------------------------------------------------ */
console.log("\n== 2. Mettre une boutique en place ==");

/* L'assistant de création : quatre étapes, une à la fois ; « Continuer »
   (ou Entrée dans un champ) passe à la suivante, après vérification. */
const etapeVisible = () => page.locator(".nb-etape:not([hidden]) .nb-etape-titre").innerText();
const continuer = async (n = 1) => {
  for (let i = 0; i < n; i++) await clic(page, page.locator(".nb-etape:not([hidden]) [data-suivant]"));
};

await etape("créer la boutique : l'assistant en cinq étapes", async () => {
  // « Nouvelle boutique » : le bouton de l'accueil (ce n'est plus une rubrique du menu).
  await page.goto(CONSOLE + "/", { waitUntil: "networkidle" });
  verifie(await page.locator(".app-cote").getByRole("link", { name: "Nouvelle boutique" }).count() === 0, "le menu ne la répète pas : c'est un bouton de l'accueil");
  await clic(page, page.getByRole("link", { name: "Nouvelle boutique" }).first());
  await page.waitForURL(/nouvelle-boutique/);
  await page.waitForLoadState("networkidle");
  verifie((await etapeVisible()) === "1. Le client" && (await page.locator(".nb-tete-etape").count()) === 5, "cinq étapes, la première à l'écran");
  // « Continuer » sans nom : l'étape ne passe pas.
  await continuer();
  verifie((await etapeVisible()) === "1. Le client", "sans nom, l'assistant reste sur l'étape");
  await clic(page, page.locator("#nom")); await tape(page, "Outillage Pro Démo");
  verifie((await page.locator("#slug").inputValue()) === "outillage-pro-demo", "l'identifiant suit le nom (sans accents, en tirets)");
  await clic(page, page.locator("#slug")); await page.keyboard.press("ControlOrMeta+a"); await tape(page, SLUG);
  await clic(page, page.locator("#contact_nom")); await tape(page, "Karim, le gérant");
  await clic(page, page.locator("#contact_telephone")); await tape(page, "20 123 456");
  await capture(page, "console-nouvelle-boutique");
  // Entrée dans un champ : l'étape suivante (le formulaire ne part pas).
  await page.keyboard.press("Enter");
  verifie((await etapeVisible()) === "2. Le domaine" && page.url().includes("/nouvelle-boutique"), "Entrée : l'étape du domaine, rien n'est créé");
  verifie(await page.getByLabel(/Il a déjà son domaine/).isChecked(), "par défaut : il a déjà son domaine");
  await continuer();
  verifie((await etapeVisible()) === "2. Le domaine", "sans son domaine, l'étape ne passe pas");
  await clic(page, page.locator("#hote")); await tape(page, HOTE);
  await page.keyboard.press("Enter");
  verifie((await etapeVisible()) === "3. Le métier", "son domaine donné : l'étape du métier");
  await continuer();
  verifie((await etapeVisible()) === "4. L'apparence" && await page.locator(".mt-gabarit").isVisible(), "sans métier, la structure se choisit");
  await clic(page, page.getByLabel(/^Technique/));
  await continuer();
  const recap = await page.locator("[data-recap]").innerText();
  verifie((await etapeVisible()) === "5. L'offre" && recap.includes("Outillage Pro Démo") && recap.includes(HOTE) && recap.includes("Karim, le gérant") && /Technique/.test(recap),
    `« Avant de créer » récapitule : ${recap.replace(/\s+/g, " ").slice(0, 120)}…`);
  await capture(page, "console-nouvelle-boutique-recap");
  await clic(page, page.locator(".nb-tete-etape").nth(0));
  verifie((await etapeVisible()) === "1. Le client" && (await page.locator("#nom").inputValue()) === "Outillage Pro Démo", "la rangée ramène à une étape, la saisie gardée");
  await clic(page, page.locator(".nb-tete-etape").nth(4));
  await clic(page, page.getByRole("button", { name: "Créer la boutique" }));
  await page.waitForURL(new RegExp(`/boutiques/${SLUG}`));
  await page.waitForLoadState("networkidle");
  verifie((await page.getByRole("status").innerText()).includes("en préparation"), "la boutique est créée, en préparation");
  verifie((await page.locator("#client").innerText()).includes("Karim, le gérant") && (await page.locator("#client").innerText()).includes("20 123 456"),
    "la personne à appeler, notée à la création, est sur sa fiche");
  await capture(page, "console-boutique-creee");
});

await etape("un identifiant déjà pris est refusé, la saisie gardée", async () => {
  await page.goto(CONSOLE + "/nouvelle-boutique", { waitUntil: "networkidle" });
  await clic(page, page.locator("#nom")); await tape(page, "Doublon");
  await clic(page, page.locator("#slug")); await page.keyboard.press("ControlOrMeta+a"); await tape(page, SLUG);
  await continuer();
  await clic(page, page.locator("#hote")); await tape(page, `autre-${SUFFIXE}.localhost`);
  await continuer(3);
  await clic(page, page.getByRole("button", { name: "Créer la boutique" }));
  await page.waitForURL(/erreur=/);
  await page.waitForLoadState("networkidle");
  verifie((await page.getByRole("alert").innerText()).includes("Déjà pris"), `message : « ${await page.getByRole("alert").innerText()} »`);
  verifie((await etapeVisible()) === "1. Le client" && (await page.locator("#nom").inputValue()) === "Doublon",
    "retour à l'étape du client, avec ce qui a été saisi");
});

await etape("un domaine qui mène déjà à une boutique ramène à l'étape du domaine, la saisie gardée", async () => {
  await page.goto(CONSOLE + "/nouvelle-boutique", { waitUntil: "networkidle" });
  await clic(page, page.locator("#nom")); await tape(page, `Doublon de domaine ${SUFFIXE}`);
  await continuer();
  await clic(page, page.locator("#hote")); await tape(page, "maymar.localhost");
  await continuer(3);
  await clic(page, page.getByRole("button", { name: "Créer la boutique" }));
  await page.waitForURL(/erreur=/);
  await page.waitForLoadState("networkidle");
  const alerte = await page.getByRole("alert").innerText();
  verifie(alerte.includes("Le domaine maymar.localhost mène déjà à une autre boutique"), `la base dit lequel : « ${alerte} »`);
  verifie((await etapeVisible()) === "2. Le domaine" && (await page.locator("#hote").inputValue()) === "maymar.localhost",
    "retour à l'étape du domaine, avec ce qui a été saisi");
});

await etape("un métier pose rayons, caractéristiques, palette et accueil d'un geste", async () => {
  // Les préréglages (…_metiers.sql) : une boutique de bijoux.
  await page.goto(CONSOLE + "/nouvelle-boutique", { waitUntil: "networkidle" });
  await clic(page, page.locator("#nom")); await tape(page, "Bijoux Démo");
  await clic(page, page.locator("#slug")); await page.keyboard.press("ControlOrMeta+a"); await tape(page, `bijoux-${SUFFIXE}`);
  await continuer();
  // Pas encore de domaine : l'adresse provisoire de la plateforme (en local, <identifiant>.localhost).
  await clic(page, page.getByLabel(/Une adresse pour commencer/));
  verifie((await page.locator("[data-adresse-provisoire]").innerText()) === `bijoux-${SUFFIXE}.localhost` && await page.locator("#hote").isDisabled(),
    "une adresse pour commencer : elle suit l'identifiant, son domaine n'est plus demandé");
  await capture(page, "console-nouvelle-boutique-domaine");
  await continuer();
  verifie((await page.locator(".mt-carte").count()) === 9, "neuf choix : aucun, et huit métiers");
  await clic(page, page.getByLabel(/^Bijoux et montres/));
  await capture(page, "console-nouvelle-boutique-metier");
  await continuer();
  verifie(!(await page.locator(".mt-gabarit").isVisible()) && (await page.locator("[data-structure-metier]").innerText()).includes("Bijoux et montres"),
    "un métier choisi règle la structure : l'étape le dit, sans choix à faire");
  await continuer();
  verifie((await page.locator("[data-recap]").innerText()).includes("Bijoux et montres"), "le récapitulatif reprend le métier");
  await clic(page, page.getByRole("button", { name: "Créer la boutique" }));
  await page.waitForURL(new RegExp(`/boutiques/bijoux-${SUFFIXE}`));
  await page.waitForLoadState("networkidle");
  verifie((await page.getByRole("status").first().innerText()).includes("les rayons, les caractéristiques, la palette et l'accueil de son métier"),
    "créée avec son métier, la page le dit");
  const rayons = await page.locator("section[aria-labelledby='t-catalogue'] dt:text-is('Rayons') + dd").innerText();
  verifie(rayons === "5", `ses cinq rayons sont posés (${rayons})`);
  verifie((await page.getByText("Partir du préréglage d'un métier").count()) === 0, "une boutique qui a des rayons ne reçoit plus de préréglage");
  await capture(page, "console-boutique-metier");
});

await etape("le domaine : en acheter un d'un geste (vérifié au registre, confirmé avec son prix), puis le brancher", async () => {
  const CUIR = `cuir-${SUFFIXE}`;
  await page.goto(CONSOLE + "/nouvelle-boutique", { waitUntil: "networkidle" });
  await clic(page, page.locator("#nom")); await tape(page, "Maroquinerie Démo");
  await clic(page, page.locator("#slug")); await page.keyboard.press("ControlOrMeta+a"); await tape(page, CUIR);
  await continuer();
  await clic(page, page.getByLabel(/En acheter un/));
  const etat = page.locator("[data-achat-etat]");
  // Un .tn : Cloudflare ne le vend pas, l'écran dit où l'acheter.
  await clic(page, page.locator("#achat")); await tape(page, `${CUIR}.tn`); await page.keyboard.press("Enter");
  await page.waitForFunction(() => /registrar tunisien/.test(document.querySelector("[data-achat-etat]")?.textContent ?? ""));
  verifie(!(await page.locator("[data-achat-confirme]").isVisible()), `un .tn : « ${await etat.innerText()} », rien à confirmer`);
  // Déjà pris.
  await clic(page, page.locator("#achat")); await page.keyboard.press("ControlOrMeta+a"); await tape(page, `${CUIR}-pris.com`);
  await clic(page, page.getByRole("button", { name: "Vérifier" }));
  await page.waitForFunction(() => /déjà pris/.test(document.querySelector("[data-achat-etat]")?.textContent ?? ""));
  verifie(true, `pris : « ${await etat.innerText()} »`);
  // Libre : son prix, puis la confirmation en toutes lettres.
  await clic(page, page.locator("#achat")); await page.keyboard.press("ControlOrMeta+a"); await tape(page, `${CUIR}.com`); await page.keyboard.press("Enter");
  await page.waitForFunction(() => /est libre/.test(document.querySelector("[data-achat-etat]")?.textContent ?? ""));
  const confirme = page.locator("[data-achat-confirme]");
  verifie((await etat.innerText()).includes("10,44 $") && (await confirme.innerText()).includes(`J'achète ${CUIR}.com pour 10,44 $ par an.`),
    `libre : « ${await etat.innerText()} », l'achat se confirme avec son prix`);
  await continuer();
  verifie((await etapeVisible()) === "2. Le domaine", "sans la case cochée, l'étape ne passe pas");
  await clic(page, confirme.locator("input"));
  await capture(page, "console-nouvelle-boutique-achat");
  await continuer(3);
  verifie((await page.locator("[data-recap]").innerText()).includes(`${CUIR}.com, acheté à la création (10,44 $ par an)`), "le récapitulatif dit l'achat et son prix");
  await clic(page, page.getByRole("button", { name: "Créer la boutique" }));
  await page.waitForURL(new RegExp(`/boutiques/${CUIR}`));
  await page.waitForLoadState("networkidle");
  const bloc = page.locator(".bt-branchement", { hasText: `${CUIR}.com` });
  verifie((await bloc.innerText()).includes("À poser chez le registrar") && (await bloc.locator(".ce-dns tbody tr").count()) === 2,
    "acheté puis branché chez Cloudflare : le CNAME et le TXT à poser, prêts à copier");
  await capture(page, "console-domaine-a-poser");
  await clic(page, bloc.getByRole("button", { name: "Relire chez Cloudflare" }));
  await page.waitForURL(/carte=domaines/);
  verifie((await page.locator("section[aria-labelledby='t-domaines'] .message").innerText()).includes("est branché") && (await page.locator(".bt-branchement").count()) === 0,
    "relu : branché, certificat émis — il quitte la liste à poser");
  await page.goto(`${CONSOLE}/journal?boutique=${CUIR}`, { waitUntil: "networkidle" });
  const journal = await page.locator(".tableau tbody").innerText();
  verifie(journal.includes("10.44 USD") || /achet/i.test(journal), "l'achat est au journal, avec son prix");
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

  // Une palette prête, d'un clic ; puis la couleur exacte, dans « Les treize couleurs, une à une ».
  const olivier = page.locator(".mq-palette", { hasText: "Olivier" });
  await clic(page, olivier);
  verifie(await olivier.getAttribute("aria-pressed") === "true", "une palette prête s'applique d'un clic");
  verifie((await page.locator(".mq-lisibilite").innerText()).includes("lisible"), "la lisibilité se mesure aussitôt");
  await clic(page, page.locator(".mq-fins > summary"));
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
  verifie((await lignes.count()) === 11 && (await page.locator(".md-module[data-actif]").count()) === 0,
    `${await lignes.count()} modules, aucun actif pour une boutique neuve`);
  // Le paiement en ligne est construit (migration …_konnect) : il s'active, sur le compte Konnect de la boutique.
  const enLigne = page.locator('.md-module[data-module="paiement_en_ligne"]');
  verifie((await enLigne.innerText()).includes("Konnect") && !(await enLigne.innerText()).includes("À venir")
    && (await enLigne.getByRole("button").count()) === 1,
    "le paiement en ligne n'est plus « à venir » : il s'active (Konnect, sur le compte de la boutique)");
  await envoie(page, page.getByRole("button", { name: "Activer : Demander conseil (WhatsApp)" }));
  await page.waitForURL(/ok=/);
  const conseil = page.locator('.md-module[data-module="conseil_whatsapp"]');
  verifie((await page.getByRole("status").innerText()).includes("activé") && (await conseil.getAttribute("data-actif")) === ""
    && (await conseil.innerText()).includes(ADMIN.email),
    `« ${await page.getByRole("status").innerText()} » — avec qui l'a activé`);
  verifie((await page.locator(".onglets a", { hasText: "Modules" }).innerText()).includes("1"), "l'onglet compte le module actif");
  await capture(page, "console-modules", true);
  // Une activation postée à la main pour un module qui n'existe pas : la base refuse.
  const refus = await brut(ctx, "POST", `/boutiques/${SLUG}/modules/changer`, {
    entetes: { origin: CONSOLE },
    formulaire: { boutique_id: await page.locator('input[name="boutique_id"]').first().inputValue(), module: "teleportation", actif: "true" },
  });
  verifie(refus.status === 303 && decodeURIComponent(refus.location.replace(/\+/g, " ")).includes("Module inconnu"), "un module inconnu, posté à la main : la base refuse");
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
  // Une boutique ouverte replie sa mise en place : on la déplie pour la lire.
  const deplie = async () => { if (await carte.locator(".mp-pli:not([open])").count()) await clic(page, carte.locator(".mp-pli > summary")); };
  verifie(await carte.locator(".mp-pli:not([open])").count() === 1, "boutique ouverte : la liste est repliée sous l'avancement");
  await deplie();
  const fait = async (cle) => (await carte.locator(`[data-etape="${cle}"]`).getAttribute("data-fait")) === "";
  const faites = await carte.locator(".mp-etape[data-fait]").count();
  verifie(await fait("marque") && await fait("catalogue") && await fait("domaine") && await fait("mise_en_ligne"),
    "constatées d'office : la marque, le catalogue, le domaine, la mise en ligne");
  verifie(!(await fait("equipe")) && (await carte.locator('[data-etape="equipe"]').getByRole("link", { name: "Aller à l'étape : équipe" }).count()) === 1,
    "l'équipe reste à faire, avec le chemin pour la faire");
  verifie(/J\+0/.test(await carte.locator('[data-etape="marque"]').innerText()), "chaque étape faite est datée depuis la création (J+0)");
  await envoie(page, carte.getByRole("button", { name: "Recueil des éléments : faite" }));
  await page.waitForURL(/ok=/);
  await deplie();
  verifie((await page.getByRole("status").innerText()).includes("« Recueil des éléments » : faite") && await fait("recueil")
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
  // Chercher une boutique : par son identifiant, sans tenir compte des majuscules
  // (le suffixe seul en trouverait deux : la boutique de bijoux le porte aussi).
  await clic(page, page.locator("#pl-q")); await tape(page, `OUTILLAGE-${SUFFIXE.toUpperCase()}`);
  await envoie(page, () => page.keyboard.press("Enter"));
  const lignesTrouvees = await page.locator(".tableau tbody tr").allInnerTexts();
  verifie(lignesTrouvees.length === 1 && lignesTrouvees[0].includes("Outillage Pro Démo") && (await page.locator(".pl-filtres-compte").innerText()).includes("1 sur"),
    `la recherche « OUTILLAGE-${SUFFIXE.toUpperCase()} » ne garde que la boutique d'essai`);
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

await etape("au propriétaire, la double authentification est proposée d'abord", async () => {
  const { tel, p } = await ouvreLien(lienGerant, "la valise est prête", "bienvenue-gerant");
  await p.waitForURL(/double-authentification/);
  verifie(await p.locator("[data-secret-totp]").count() === 1, "le propriétaire peut enregistrer son application d'authentification avant d'entrer");
  verifie(await p.getByRole("button", { name: "Plus tard" }).isVisible(), "ou la reporter : « Plus tard » (la boutique ne l'exige pas)");
  await capture(p, "console-bienvenue-double-authentification");
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

let secretGerant = "";
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
  secretGerant = (await p.locator("[data-secret-totp]").textContent()).trim();
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
console.log("\n== 3 ter. Les accès de chacun : Mon compte, codes de secours, mot de passe oublié ==");

/* Se connecter (mot de passe, puis le code de l'application) dans un
   contexte neuf. Un code déjà donné dans la même demi-minute peut être
   refusé : on attend alors le suivant. */
async function entreAvecApplication(contexte, email, mdp, secretTotp, nom) {
  const p = await contexte.newPage();
  t.espion(p, nom, attendue);
  await p.goto(CONSOLE + "/connexion", { waitUntil: "networkidle" });
  await p.locator("#email").fill(email);
  await p.locator("#mot_de_passe").fill(mdp);
  await p.keyboard.press("Enter");
  await p.waitForURL(/double-authentification/);
  await p.waitForLoadState("networkidle");
  for (let essai = 0; essai < 2; essai++) {
    await p.locator("#code").fill(totp(secretTotp));
    await p.keyboard.press("Enter");
    const entre = await p.waitForURL(new RegExp(`/gestion/${SLUG}`), { timeout: 8000 }).then(() => true, () => false);
    if (entre) return p;
    await pause(31_000);
  }
  throw new Error(`${email} : la double authentification ne passe pas`);
}
const dernierCourriel = async (adresse) =>
  (await fetch(`${RELAIS}/email-dev/rendu/dernier?email=${encodeURIComponent(adresse)}`)).json().catch(() => null);
const jetonDe = (texte) => (texte ?? "").match(/jeton=([0-9a-f]+)/)?.[1] ?? null;

await etape("la console : son nom, en bas de la barre, ouvre « Mon compte »", async () => {
  await page.goto(CONSOLE + "/", { waitUntil: "networkidle" });
  await clic(page, page.locator(".app-cote .app-compte-lien"));
  await page.waitForURL((u) => u.pathname === "/compte");
  await page.waitForLoadState("networkidle");
  verifie((await page.locator("h1").innerText()) === "Mon compte" && (await page.locator(".cp-email").innerText()) === ADMIN.email,
    "« Mon compte » : son adresse, son rôle");
  verifie((await page.locator("#secours").innerText()).includes("Aucun code de secours"), "pas encore de codes de secours : la carte le signale");
  await capture(page, "console-mon-compte", true);
});

let codesGerant = [];
let bureauGerant;
await etape("Mon compte du propriétaire : dix codes de secours, montrés une fois", async () => {
  bureauGerant = await navigateur.newContext({ viewport: { width: 1366, height: 860 }, locale: "fr-FR" });
  const p = await entreAvecApplication(bureauGerant, GERANT, "la valise est prête", secretGerant, "compte-proprietaire");
  await p.waitForLoadState("networkidle");
  await clic(p, p.locator(".app-cote .app-compte-lien"));
  await p.waitForURL(new RegExp(`/gestion/${SLUG}/compte$`));
  await p.waitForLoadState("networkidle");
  verifie((await p.locator(".cp-qui").innerText()).includes("Propriétaire"), "au backoffice, « Mon compte » dit son rôle dans la boutique");
  await envoie(p, p.getByRole("button", { name: "Créer mes codes de secours" }));
  codesGerant = await p.locator(".cp-codes code").allInnerTexts();
  verifie(codesGerant.length === 10 && codesGerant.every((c) => /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/.test(c)) && new Set(codesGerant).size === 10,
    `dix codes distincts, lisibles (${codesGerant[0]}…), ni I, L, O, 0 ni 1`);
  verifie((await p.locator(".cp-codes-neufs .message-attention").innerText()).includes("ne seront plus montrés"), "« Notez-les maintenant : ils ne seront plus montrés »");
  await capture(p, "backoffice-codes-de-secours");
  await envoie(p, p.getByRole("button", { name: "C'est noté" }));
  verifie(await p.locator(".cp-codes").count() === 0 && (await p.locator("#secours").innerText()).includes("10 codes encore valables"),
    "« C'est noté » : les codes disparaissent, la carte dit qu'il en reste dix");
});

let secretNeuf = "";
await etape("téléphone perdu : un code de secours remplace l'application", async () => {
  const tel = await navigateur.newContext(TELEPHONE);
  const p = await tel.newPage();
  t.espion(p, "code-de-secours", attendue);
  await p.goto(CONSOLE + "/connexion", { waitUntil: "networkidle" });
  await p.locator("#email").fill(GERANT);
  await p.locator("#mot_de_passe").fill("la valise est prête");
  await p.keyboard.press("Enter");
  await p.waitForURL(/double-authentification/);
  await p.waitForLoadState("networkidle");
  await clic(p, p.getByText("Téléphone perdu ? Utiliser un code de secours"));
  await p.locator("#code_secours").fill("AAAAA-BBBBB");
  await clic(p, p.getByRole("button", { name: "Utiliser ce code" }));
  await p.waitForURL(/secours=1/);
  verifie((await p.getByRole("alert").innerText()).includes("inconnu"), `un code inventé : « ${await p.getByRole("alert").innerText()} »`);
  verifie(await p.evaluate(() => document.activeElement?.id) === "code_secours", "le curseur revient dans le champ du code de secours");
  // Tapé comme on le lit, en minuscules et sans tiret.
  await p.locator("#code_secours").fill(codesGerant[0].toLowerCase().replace("-", ""));
  await p.keyboard.press("Enter");
  await p.waitForURL(/remplace=1/);
  await p.waitForLoadState("networkidle");
  verifie((await p.getByRole("status").first().innerText()).includes("Il vous en reste 9"), "code accepté : la page dit combien il en reste (9)");
  secretNeuf = (await p.locator("[data-secret-totp]").textContent()).trim();
  verifie(secretNeuf.length >= 16 && secretNeuf !== secretGerant, "l'ancienne application est retirée : un nouveau QR code à enregistrer");
  await capture(p, "console-code-de-secours-accepte");
  await p.locator("#code").fill(totp(secretNeuf));
  await p.keyboard.press("Enter");
  await p.waitForURL(new RegExp(`/gestion/${SLUG}`));
  verifie(true, "la nouvelle application enregistrée, il est dans son backoffice");
  secretGerant = secretNeuf;

  // Le même code, une seconde fois : refusé.
  const autre = await navigateur.newContext({ viewport: { width: 1366, height: 860 }, locale: "fr-FR" });
  const q = await autre.newPage();
  t.espion(q, "code-servi", attendue);
  await q.goto(CONSOLE + "/connexion", { waitUntil: "networkidle" });
  await q.locator("#email").fill(GERANT);
  await q.locator("#mot_de_passe").fill("la valise est prête");
  await q.keyboard.press("Enter");
  await q.waitForURL(/double-authentification/);
  await clic(q, q.getByText("Téléphone perdu ? Utiliser un code de secours"));
  await q.locator("#code_secours").fill(codesGerant[0]);
  await q.keyboard.press("Enter");
  await q.waitForURL(/secours=1/);
  verifie((await q.getByRole("alert").innerText()).includes("déjà utilisé"), "le même code une seconde fois : refusé");
  await autre.close();
  await tel.close();
});

await etape("Mon compte : changer son mot de passe (l'actuel d'abord)", async () => {
  const p = bureauGerant.pages()[0];
  await p.goto(`${CONSOLE}/gestion/${SLUG}/compte`, { waitUntil: "networkidle" });
  await p.locator("#cp-actuel").fill("pas le bon du tout");
  await p.locator("#cp-nouveau").fill("la valise est partie");
  await p.locator("#cp-confirmation").fill("la valise est partie");
  await envoie(p, p.getByRole("button", { name: "Changer le mot de passe" }));
  verifie((await p.locator("#mot-de-passe [role=alert]").innerText()).includes("n'est pas le bon"), "un mot de passe actuel faux : refusé, à sa place");
  await p.locator("#cp-actuel").fill("la valise est prête");
  await p.locator("#cp-nouveau").fill("la valise est partie");
  await p.locator("#cp-confirmation").fill("la valise est partie");
  await envoie(p, p.getByRole("button", { name: "Changer le mot de passe" }));
  verifie((await p.locator("#mot-de-passe [role=status]").innerText()).includes("Mot de passe changé"), "le bon : « Mot de passe changé »");
});

await etape("se déconnecter de tous les appareils : les autres sessions tombent", async () => {
  const tel = await navigateur.newContext(TELEPHONE);
  const p = await entreAvecApplication(tel, GERANT, "la valise est partie", secretGerant, "deconnexion-partout");
  verifie(true, "le nouveau mot de passe ouvre le backoffice, sur le téléphone");
  const bureau = bureauGerant.pages()[0];
  await bureau.goto(`${CONSOLE}/gestion/${SLUG}/compte`, { waitUntil: "networkidle" });
  await clic(bureau, bureau.getByRole("button", { name: "Se déconnecter de tous les appareils" }));
  await clic(bureau, bureau.getByRole("button", { name: "Tout déconnecter" }));
  await bureau.waitForURL(/\/connexion\?/);
  verifie((await bureau.getByRole("status").innerText()).includes("Déconnecté de tous vos appareils"), "sur l'ordinateur : retour à la connexion, qui le dit");
  const r = await brut(tel, "GET", `/gestion/${SLUG}`);
  verifie((r.status === 307 || r.status === 303) && r.location.includes("/connexion"), `le téléphone aussi est dehors (${r.status} → ${r.location})`);
  await p.close();
  await tel.close();
  await bureauGerant.close();
});

await etape("« Mot de passe oublié ? » : l'adresse tapée suit, le lien part par e-mail", async () => {
  const autre = await navigateur.newContext({ viewport: { width: 1366, height: 860 }, locale: "fr-FR" });
  const p = await autre.newPage();
  t.espion(p, "mot-de-passe-oublie", attendue);
  const avant = jetonDe((await dernierCourriel(APPELS))?.texte);
  await p.goto(CONSOLE + "/connexion", { waitUntil: "networkidle" });
  await clic(p, p.locator("#email"));
  await tape(p, APPELS);
  await clic(p, p.getByRole("link", { name: "Mot de passe oublié ?" }));
  await p.waitForURL(/mot-de-passe-oublie/);
  verifie((await p.locator("#email").inputValue()) === APPELS, "l'adresse tapée à la connexion est déjà dans le champ");
  await clic(p, p.getByRole("button", { name: "Recevoir le lien" }));
  await p.waitForURL(/envoye=1/);
  verifie((await p.getByRole("status").innerText()).includes(`Si un compte existe pour ${APPELS}`), "la réponse ne dit pas si le compte existe");
  await capture(p, "console-mot-de-passe-oublie");
  const courriel = await dernierCourriel(APPELS);
  const jeton = jetonDe(courriel?.texte);
  verifie(courriel?.sujet?.startsWith("Nouveau mot de passe") && jeton && jeton !== avant, `l'e-mail part : « ${courriel?.sujet} »`);
  // Une seconde demande, aussitôt : rien ne repart (une toutes les deux minutes).
  await p.goto(`${CONSOLE}/mot-de-passe-oublie?email=${encodeURIComponent(APPELS)}`, { waitUntil: "networkidle" });
  await clic(p, p.getByRole("button", { name: "Recevoir le lien" }));
  await p.waitForURL(/envoye=1/);
  verifie(jetonDe((await dernierCourriel(APPELS))?.texte) === jeton, "une seconde demande aussitôt : la même réponse, mais aucun e-mail de plus");
  // Le lien de l'e-mail : choisir le mot de passe, entrer.
  await p.goto(courriel.texte.match(/https?:\/\/\S+bienvenue\S+/)[0], { waitUntil: "networkidle" });
  await p.locator("#mot_de_passe").fill("oubli du jeudi matin");
  await p.locator("#confirmation").fill("oubli du jeudi matin");
  await clic(p, p.getByRole("button", { name: "Enregistrer et entrer" }));
  await p.waitForURL(new RegExp(`/gestion/${SLUG}`));
  verifie(true, "le lien de l'e-mail : un nouveau mot de passe, et le backoffice");
  await autre.close();
});

await etape("le lien remis s'envoie aussi par e-mail, au nom de la boutique", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}/equipe`, { waitUntil: "networkidle" });
  await envoie(page, ligneDe(APPELS).getByRole("button", { name: "Lien de mot de passe" }));
  const lien = await lienAffiche();
  await envoie(page, page.getByRole("button", { name: "Envoyer par e-mail" }));
  verifie((await page.getByRole("status").first().innerText()).includes(`Lien envoyé par e-mail à ${APPELS}`), "« Lien envoyé par e-mail »");
  const courriel = await dernierCourriel(APPELS);
  verifie(courriel?.nom === "Outillage Pro Démo" && courriel.texte.includes(lien),
    `au nom de la boutique (« ${courriel?.nom} »), avec le lien affiché`);
});

/* ------------------------------------------------------------------ */
console.log("\n== 3 ter (suite). La double authentification : proposée, ou exigée par un réglage ==");

await etape("la boutique : son propriétaire l'exige de qui a la main, puis revient à « proposée »", async () => {
  const bureau = await navigateur.newContext({ viewport: { width: 1366, height: 860 }, locale: "fr-FR" });
  const p = await entreAvecApplication(bureau, GERANT, "la valise est partie", secretGerant, "double-auth-boutique");
  await p.goto(`${CONSOLE}/gestion/${SLUG}/equipe`, { waitUntil: "networkidle" });
  const carte = p.locator("#double-auth");
  verifie(await carte.locator('input[name="obligatoire"][value=""]').isChecked(), "par défaut : proposée");
  // Au clavier : la flèche passe de « Proposée » à « Exigée ».
  await carte.locator('input[name="obligatoire"][value=""]').focus();
  await p.keyboard.press("ArrowDown");
  verifie(await carte.locator('input[name="obligatoire"][value="1"]').isChecked(), "la flèche choisit « Exigée »");
  await envoie(p, carte.getByRole("button", { name: "Enregistrer" }));
  verifie((await p.locator("#double-auth [role=status]").innerText()).startsWith("Exigée"), `« ${await p.locator("#double-auth [role=status]").innerText()} », dans la carte`);
  verifie((await p.locator("section:has(#t-membres)").innerText()).includes("la boutique l'exige"), "la liste des membres le dit");
  await p.locator("#double-auth").scrollIntoViewIfNeeded();
  await capture(p, "backoffice-double-auth-exigee");
  await clic(p, p.locator("#double-auth label.choix-carte", { hasText: "Proposée" }));
  await envoie(p, p.locator("#double-auth").getByRole("button", { name: "Enregistrer" }));
  verifie((await p.locator("#double-auth [role=status]").innerText()).startsWith("Proposée"), "revenue à « proposée »");
  await bureau.close();
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  const journal = await page.locator("section:has(#t-journal) tbody tr").allInnerTexts();
  verifie(journal.filter((l) => l.includes("Double authentification de l'équipe de la boutique")).length === 2,
    "le journal de la boutique garde les deux changements");
});

await etape("l'équipe SkanEcom : exigée, une recrue l'enregistre avant d'entrer ; proposée, elle passe, puis l'active depuis « Mon compte »", async () => {
  const email = `recrue-${SUFFIXE}@skanecom.test`;
  await page.goto(`${CONSOLE}/equipe-plateforme`, { waitUntil: "networkidle" });
  await page.locator("#ep-email").fill(email);
  await envoie(page, page.getByRole("button", { name: "Inviter", exact: true }));
  const lien = (await page.locator(".ep-lien code").innerText()).trim();
  verifie(lien.includes("/bienvenue?"), "le lien de la recrue");
  const securite = page.locator("#securite");
  verifie(await securite.locator('input[name="obligatoire"][value=""]').isChecked(), "par défaut, la console la propose sans l'exiger");
  await clic(page, securite.locator("label.choix-carte", { hasText: "Exigée de toute l'équipe" }));
  await envoie(page, page.locator("#securite").getByRole("button", { name: "Enregistrer" }));
  verifie((await page.locator("#securite [role=status]").innerText()).startsWith("Exigée"), `« ${await page.locator("#securite [role=status]").innerText()} »`);
  verifie((await page.locator("header").first().innerText() + await page.locator("main").innerText()).includes("Tous passent par la double authentification"),
    "l'en-tête de l'équipe le dit");
  await page.locator("#securite").scrollIntoViewIfNeeded();
  await capture(page, "console-equipe-double-auth-exigee", true);

  const { tel, p } = await ouvreLien(lien, "recrue du lundi matin", "recrue");
  await p.waitForURL(/double-authentification/);
  await p.waitForLoadState("networkidle");
  verifie((await p.locator(".porte").innerText()).includes("Exigée") && await p.getByRole("button", { name: "Plus tard" }).count() === 0,
    "exigée : la recrue l'enregistre, sans « Plus tard »");
  const r = await brut(tel, "GET", "/");
  verifie(r.status >= 300 && r.status < 400 && r.location.includes("/double-authentification"), `et la console lui reste fermée (${r.status})`);
  await capture(p, "console-double-auth-exigee-recrue");

  await clic(page, page.locator("#securite label.choix-carte", { hasText: "Proposée" }));
  await envoie(page, page.locator("#securite").getByRole("button", { name: "Enregistrer" }));
  verifie((await page.locator("#securite [role=status]").innerText()).startsWith("Proposée"), "revenue à « proposée »");

  await p.reload({ waitUntil: "networkidle" });
  verifie(await p.getByRole("button", { name: "Plus tard" }).isVisible(), "proposée : « Plus tard » paraît");
  await capture(p, "console-double-auth-plus-tard");
  await clic(p, p.getByRole("button", { name: "Plus tard" }));
  await p.waitForURL((u) => u.pathname === "/");
  await p.waitForLoadState("networkidle");
  verifie(await p.locator(".pl-synthese").isVisible(), "« Plus tard » : la recrue est dans la console");
  const r2 = await brut(tel, "GET", "/double-authentification");
  verifie(r2.status >= 300 && r2.status < 400 && new URL(r2.location, CONSOLE).pathname === "/", `la proposition se tait ensuite (${r2.status} → ${r2.location})`);

  await p.goto(`${CONSOLE}/compte`, { waitUntil: "networkidle" });
  verifie((await p.locator("#double-auth").innerText()).includes("Pas encore activée"), "« Mon compte » : pas encore activée, et le bouton pour le faire");
  await capture(p, "console-mon-compte-activer");
  await clic(p, p.getByRole("link", { name: "Activer la double authentification" }));
  await p.waitForURL(/activer=1/);
  await p.waitForLoadState("networkidle");
  const secretRecrue = (await p.locator("[data-secret-totp]").textContent()).trim();
  verifie(await p.getByRole("link", { name: "Annuler" }).isVisible() && await p.getByRole("button", { name: "Plus tard" }).count() === 0,
    "demandée : « Annuler » ramène à Mon compte (pas de « Plus tard »)");
  await p.locator("#code").fill(totp(secretRecrue));
  await p.keyboard.press("Enter");
  await p.waitForURL(/\/compte\?ok=/);
  await p.waitForLoadState("networkidle");
  verifie((await p.locator("#secours").innerText()).includes("Double authentification activée") && await p.locator("#double-auth").count() === 0,
    "activée : retour à « Mon compte », qui propose aussitôt les codes de secours");
  await capture(p, "console-mon-compte-active");
  await tel.close();

  await page.goto(`${CONSOLE}/equipe-plateforme`, { waitUntil: "networkidle" });
  const ligne = page.locator(".ep-liste > li", { hasText: email });
  await envoie(page, ligne.getByRole("button", { name: `Retirer ${email} de l'équipe SkanEcom` }));
  verifie(await page.locator(".ep-liste > li", { hasText: email }).count() === 0, "la recrue retirée de l'équipe");
});

/* ------------------------------------------------------------------ */
console.log("\n== 3 quater. La fiche d'une boutique : à faire maintenant, le client, suspendre en le disant ==");

await etape("la fiche : ce qu'il y a à faire maintenant, en une ligne", async () => {
  await page.goto(`${CONSOLE}/boutiques/maymar`, { waitUntil: "networkidle" });
  const ligne = page.locator(".fb-maintenant");
  verifie((await ligne.innerText()).startsWith("À faire maintenant") && ["urgent", "attention"].includes(await ligne.getAttribute("data-niveau")),
    `« ${(await ligne.innerText()).replace(/\s+/g, " ")} »`);
  verifie(await page.locator(".mp .mp-pli").count() === 1 && (await page.locator(".mp .mp-pli").getAttribute("open")) === null,
    "boutique ouverte : la mise en place se replie sous son avancement");
});

await etape("le client : ses coordonnées notées, puis appelé d'un geste", async () => {
  const carte = page.locator("#client");
  verifie((await carte.innerText()).includes("Personne à joindre"), "rien de noté : la carte le dit");
  await clic(page, carte.locator("summary", { hasText: "Noter ses coordonnées" }));
  await page.locator("#cl-nom").fill("Sami Ben Ali, gérant");
  await page.locator("#cl-telephone").fill("20 123 456");
  await page.locator("#cl-matricule").fill("1234567/a/m/000");
  await envoie(page, carte.getByRole("button", { name: "Enregistrer" }));
  verifie((await page.locator("#client [role=status]").innerText()).includes("Coordonnées enregistrées"), "« Coordonnées enregistrées. »");
  verifie(await page.locator('#client a[href="tel:+21620123456"]').isVisible(), "« Appeler » : le numéro au format international");
  verifie((await page.locator("#client").getByRole("link", { name: "WhatsApp" }).getAttribute("href")) === "https://wa.me/21620123456",
    "« WhatsApp » : sans autre numéro, celui du téléphone");
  verifie((await carte.innerText()).includes("1234567/A/M/000"), "le matricule, en capitales");
  await capture(page, "console-fiche-client", true);
});

await etape("suspendre en disant pourquoi : l'équipe de la boutique le lit", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  await clic(page, page.locator("summary", { hasText: "Suspendre la boutique" }));
  await page.locator("#su-motif").selectOption("impaye");
  await page.locator("#su-message").fill("Votre abonnement d'octobre reste à régler : appelez-nous pour rouvrir.");
  await envoie(page, page.getByRole("button", { name: "Suspendre maintenant" }));
  verifie((await page.locator(".fb-suspension").innerText()).includes("Abonnement impayé") && (await page.locator(".fb-suspension").innerText()).includes("appelez-nous"),
    "la fiche dit la suspension, son motif et le message");
  const tel = await navigateur.newContext(TELEPHONE);
  const p = await tel.newPage();
  t.espion(p, "suspendue", attendue);
  await p.goto(CONSOLE + "/connexion", { waitUntil: "networkidle" });
  await p.locator("#email").fill(APPELS);
  await p.locator("#mot_de_passe").fill("oubli du jeudi matin");
  await p.keyboard.press("Enter");
  await p.waitForURL(new RegExp(`/gestion/${SLUG}`));
  await p.waitForLoadState("networkidle");
  const bandeau = await p.locator(".ann-suspension").innerText();
  verifie(bandeau.includes("suspendue par SkanEcom") && bandeau.includes("Abonnement impayé") && bandeau.includes("appelez-nous"),
    `au backoffice, en tête : « ${bandeau.replace(/\s+/g, " ").slice(0, 110)}… »`);
  await capture(p, "backoffice-suspendu-telephone");
  await envoie(page, page.getByRole("button", { name: "Ouvrir la boutique" }));
  await p.reload({ waitUntil: "networkidle" });
  verifie(await p.locator(".ann-suspension").count() === 0, "rouverte : le bandeau s'en va");
  await tel.close();
});

/* ------------------------------------------------------------------
   La facturation de la boutique, lue dans SkanFact (cadrage 06) — SkanFact
   simulé par le relais (outils/skanfact-dev.mjs) : le client retrouvé par
   son matricule, relié, sa situation lue ; une facture émise dans SkanFact
   arrive par son avis signé ; un avis mal signé ne passe pas. */
const SKANFACT = `${RELAIS}/skanfact-dev`;
const gesteSkanFact = async (nom, corps = {}) =>
  (await fetch(`${SKANFACT}/${nom}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) })).json();
async function avisSkanFact(corps, signature) {
  return new Promise((ok, ko) => {
    const req = http.request({
      host: "127.0.0.1", port: Number(t.port), method: "POST", path: "/crochets/skanfact",
      headers: { host: new URL(CONSOLE).host, "content-type": "application/json", "skanfact-signature": signature },
    }, (r) => { r.resume(); r.on("end", () => ok(r.statusCode)); });
    req.on("error", ko);
    req.end(corps);
  });
}

await etape("facturation : retrouver le client SkanFact par son matricule, et le relier", async () => {
  await gesteSkanFact("reinitialiser");
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  await clic(page, page.getByRole("link", { name: "Facturation" }));
  await page.waitForURL(new RegExp(`/boutiques/${SLUG}/facturation$`));
  await page.locator("#fa-identifiant").waitFor();
  await clic(page, page.locator("#fa-identifiant"));
  await tape(page, "7654321 b/a/000");
  await page.keyboard.press("Enter");
  await page.waitForURL(/identifiant=/);
  await page.locator(".fa-client").first().waitFor();
  const trouves = await page.locator(".fa-client").allInnerTexts();
  verifie(trouves.length === 1 && trouves[0].includes("Atelier d'essai SARL"), "le matricule tapé en minuscules, avec des espaces, retrouve le client");
  await clic(page, page.getByRole("button", { name: "Relier à ce client" }));
  await page.getByText("est reliée à « Atelier d'essai SARL » dans SkanFact.", { exact: false }).waitFor();
  const texte = await page.locator("body").innerText();
  verifie(/À jour/.test(texte) && /Rien à payer/.test(texte), "sa situation est lue : à jour, rien à payer");
  verifie(/Dernier règlement : 250,000\s*DT/.test(texte), "avec son dernier règlement (250,000 DT)");
  await capture(page, "console-facturation-reliee");
});

await etape("facturation : une facture émise dans SkanFact arrive par son avis signé", async () => {
  const emise = await gesteSkanFact("emettre", { identifiant: "7654321B/A/000", montant: "89.000", echeance: 15, objet: "Abonnement mensuel" });
  verifie(emise.avis?.[0]?.statut === 200, `l'avis « facture émise » est reçu par la console (HTTP ${emise.avis?.[0]?.statut})`);
  const d = await (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/console_facturation`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ p_boutique_id: await page.locator("form[action$='/statut'] input[name=boutique_id]").inputValue() }),
  })).json();
  verifie(d.factures?.some((f) => f.numero === emise.numero && f.reste === "89.000"), `la console a relu et gardé la facture ${emise.numero}, sans qu'on ouvre la page`);
  const corps = JSON.stringify({ id: `faux-${SUFFIXE}`, evenement: "facture.reglee", entreprise: "00000000-0000-4000-8888-00000000e000", donnees: {} });
  const t0 = Math.floor(Date.now() / 1000);
  verifie(await avisSkanFact(corps, `t=${t0},v1=${"0".repeat(64)}`) === 401, "un avis mal signé est refusé (401)");
  const vieux = t0 - 3600;
  verifie(await avisSkanFact(corps, `t=${vieux},v1=${createHmac("sha256", "whsec_dev_local_skanecom").update(`${vieux}.${corps}`).digest("hex")}`) === 401,
    "un avis signé il y a une heure est refusé (401)");
  await page.reload({ waitUntil: "networkidle" });
  const texte = await page.locator("body").innerText();
  verifie(texte.includes(emise.numero) && /89,000\s*DT/.test(texte) && /dans 15 j/.test(texte), `la page montre ${emise.numero} : 89,000 DT, échéance dans 15 j`);
});

await etape("facturation : l'abonnement — le contrat déjà fait à l'écran, puis un contrat « Émise seule »", async () => {
  const abonnement = page.locator("section:has(#t-fa-abonnement)");
  verifie((await abonnement.innerText()).includes("Ce client a déjà un contrat dans SkanFact"), "le contrat fait à l'écran de SkanFact est proposé");
  await clic(page, abonnement.getByRole("button", { name: "C'est son abonnement" }));
  await page.getByText("La console suit maintenant le contrat", { exact: false }).waitFor();
  verifie(/Brouillon : à chaque échéance/.test(await abonnement.innerText()), "un contrat sans « Émise seule » : la console dit qu'une personne émet ses factures");
  await abonnement.locator(".fa-delier > summary").click();
  await clic(page, abonnement.getByRole("button", { name: "Ne plus suivre ce contrat" }));
  await page.getByText("La console ne suit plus ce contrat", { exact: false }).waitFor();
  await clic(page, abonnement.locator(".fa-creer > summary"));
  await clic(page, page.locator("#fa-prix"));
  await tape(page, "89");
  verifie(await page.locator("input[name=emettre_seul]").isChecked(), "« Émise seule » est proposé");
  await clic(page, page.getByRole("button", { name: "Créer l'abonnement dans SkanFact" }));
  await page.getByText("Abonnement créé dans SkanFact", { exact: false }).waitFor();
  verifie(/89,000\s*DT HT · TVA 19 %/.test(await abonnement.innerText()), "le contrat créé : 89,000 DT HT, TVA 19 %");
  const boutiqueId = await page.locator("form[action$='/statut'] input[name=boutique_id]").inputValue();
  const lien = (await (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/console_facturation`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ p_boutique_id: boutiqueId }),
  })).json()).lien;
  const e = await gesteSkanFact("echoir", { contrat: lien.contrat });
  verifie(e.emise && e.netAPayer === "105.910" && e.avis?.[0]?.statut === 200, `l'échéance passe : SkanFact émet ${e.numero} (${e.netAPayer} DT TTC), l'avis est reçu`);
  await page.reload({ waitUntil: "networkidle" });
  verifie((await page.locator("body").innerText()).includes(e.numero), `la facture ${e.numero} se lit dans l'onglet`);
  await capture(page, "console-facturation-abonnement");
  await clic(page, abonnement.getByRole("button", { name: "Suspendre l'abonnement" }));
  await page.getByText("Abonnement suspendu", { exact: false }).waitFor();
  verifie((await gesteSkanFact("echoir", { contrat: lien.contrat })).emise === false, "suspendu : SkanFact n'émet plus rien");
});

await etape("facturation : délier, et le journal le garde", async () => {
  await clic(page, page.locator("section:has(#t-fa-client) .fa-delier > summary"));
  await page.getByRole("button", { name: "Délier ce client" }).waitFor();
  await clic(page, page.getByRole("button", { name: "Délier ce client" }));
  await page.getByText("n'est plus reliée à SkanFact.", { exact: false }).waitFor();
  verifie(await page.locator("#fa-identifiant").isVisible(), "déliée : la recherche du client revient");
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  const journal = await page.locator("section:has(#t-journal) tbody tr").allInnerTexts();
  verifie(journal.some((l) => l.includes("Reliée à son client SkanFact") && l.includes("Atelier d'essai SARL"))
    && journal.some((l) => l.includes("Déliée de son client SkanFact")), "le journal garde le lien et la fin du lien, avec le client");
});

/* ------------------------------------------------------------------ */
console.log("\n== 3 bis. Ce que la console vend, et comment elle suit ses clients ==");

const CLONE = `clone-${SUFFIXE}`;

await etape("les formules : la matrice, et ce qu'une formule ferme à la boutique", async () => {
  await clic(page, page.getByRole("link", { name: "Formules" }).first());
  await page.waitForURL(/\/formules$/);
  const noms = await page.locator(".fo-tete .fo-nom").evaluateAll((l) => l.map((e) => e.value));
  verifie(["Essentiel", "Pro", "Complète"].every((n) => noms.includes(n)), `trois formules de départ : ${noms.join(", ")}`);
  const prix = await page.locator('.fo-tete input[name^="prix__"]').evaluateAll((l) => l.map((e) => e.value));
  verifie(prix.length === 3 && prix.every((p) => p === ""), "aucun prix inventé : chacune « Prix à fixer »");
  await capture(page, "console-formules", true);
  // Un seul enregistrement, en bas de l'écran ; rien de changé, rien de réécrit.
  await envoie(page, page.getByRole("button", { name: "Enregistrer les formules" }));
  verifie((await page.locator(".message-succes").innerText()).includes("Rien n'a changé"), "un seul « Enregistrer » ; rien de changé, rien n'est réécrit");
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  await page.locator("#bt-formule").selectOption("essentiel");
  await envoie(page, page.locator("#formule").getByRole("button", { name: "Changer" }));
  const retour = await page.locator("#formule .bt-retour").innerText();
  verifie(retour.includes("Essentiel") && (await page.locator("#bt-formule").inputValue()) === "essentiel",
    `dans la carte : « ${retour} », et le choix reste affiché`);
  await page.goto(`${CONSOLE}/boutiques/${SLUG}/modules`, { waitUntil: "networkidle" });
  verifie((await page.locator(".md-hors-formule").count()) > 0, "les modules hors formule le disent, avec la formule qui les ouvre");
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  await page.locator("#bt-formule").selectOption("");
  await envoie(page, page.locator("#formule").getByRole("button", { name: "Changer" }));
  verifie((await page.locator("#bt-formule").inputValue()) === "", "de retour « sur mesure » : tout est ouvert");
});

await etape("le tableau de bord de la plateforme, sur 30 puis 7 jours", async () => {
  await clic(page, page.getByRole("link", { name: "Tableau de bord" }).first());
  await page.waitForURL(/\/tableau/);
  verifie((await page.locator(".tbp-chiffres > li").count()) === 4 && (await page.locator(".tbp-graphe > li").count()) === 30,
    "quatre chiffres, et la courbe des 30 derniers jours");
  await clic(page, page.getByRole("link", { name: "7 jours" }));
  await page.waitForURL(/jours=7/);
  await page.waitForLoadState("networkidle");
  verifie((await page.locator(".tbp-graphe > li").count()) === 7, "sur 7 jours : sept barres");
  verifie(await page.locator(".tbp-tableau").getByRole("link", { name: "Outillage Pro Démo" }).isVisible(), "la boutique d'essai dans le tableau par boutique");
  await capture(page, "console-tableau", true);
});

await etape("une note de suivi sur la boutique, épinglée", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  await clic(page, page.locator("#bt-note")); await tape(page, "Appelé : le propriétaire veut le retrait en magasin.");
  await clic(page, page.getByLabel("Épingler en tête"));
  await envoie(page, page.getByRole("button", { name: "Garder la note" }));
  const premiere = page.locator(".bt-notes li").first();
  verifie((await premiere.innerText()).includes("retrait en magasin") && (await premiere.getAttribute("data-epinglee")) === ""
    && (await premiere.innerText()).includes(ADMIN.email), "la note est gardée, épinglée, avec son auteur");
  verifie((await page.locator("#notes .bt-retour").innerText()).includes("Note gardée") && (await page.locator("#bt-note").inputValue()) === "",
    "le message dans la carte ; le champ se vide");
});

await etape("une note avec un rappel : le jour venu, elle passe devant et remonte dans « À surveiller »", async () => {
  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());
  await clic(page, page.locator("#bt-note")); await tape(page, "Rappeler le propriétaire pour les photos du catalogue.");
  await page.locator("#bt-note-rappel").fill(aujourdhui);
  await envoie(page, page.getByRole("button", { name: "Garder la note" }));
  const due = page.locator(".bt-notes li[data-rappel]");
  verifie((await due.count()) === 1 && (await due.innerText()).includes("À rappeler aujourd'hui"), "le rappel du jour est marqué");
  verifie((await page.locator(".bt-notes li").nth(1).getAttribute("data-rappel")) === "", "il passe devant les autres notes (l'épinglée reste en tête)");
  await page.goto(`${CONSOLE}/`, { waitUntil: "networkidle" });
  verifie((await page.locator(".pl-vigilance").innerText()).includes("Rappeler le propriétaire pour les photos"), "« À surveiller » le rappelle");
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  await envoie(page, page.locator(".bt-notes li[data-rappel]").getByRole("button", { name: "C'est fait" }));
  verifie((await page.locator(".bt-notes li[data-rappel]").count()) === 0 && (await page.locator("#notes .bt-retour").innerText()).includes("Rappel fait"),
    "dit fait, il ne remonte plus");
});

await etape("le journal : une période, et l'export de ce qu'elle montre", async () => {
  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());
  await page.goto(`${CONSOLE}/journal?du=${aujourdhui}&au=${aujourdhui}`, { waitUntil: "networkidle" });
  verifie((await page.locator(".tableau tbody tr").count()) > 0, "les gestes du jour");
  // (depuis la page : sa session, et console.localhost que seul le navigateur résout)
  const r = await page.evaluate(async () => {
    const reponse = await fetch(document.querySelector(".jr-export").href);
    return { ok: reponse.ok, type: reponse.headers.get("content-type") ?? "", csv: await reponse.text() };
  });
  verifie(r.ok && r.type.startsWith("text/csv") && r.csv.includes("Quand;Geste;Boutique;Détail;Par;IP") && r.csv.includes("Rappel fait"),
    "l'export : un CSV de ces gestes");
});

await etape("une annonce aux commerçants : publiée, puis arrêtée", async () => {
  await clic(page, page.getByRole("link", { name: "Annonces" }).first());
  await page.waitForURL(/\/annonces/);
  await clic(page, page.getByLabel(/^Nouveauté/));
  await clic(page, page.locator("#an-titre")); await tape(page, `Essai ${SUFFIXE}`);
  await clic(page, page.locator("#an-texte")); await tape(page, "Une fonction arrive : voici où la trouver.");
  await envoie(page, page.getByRole("button", { name: "Publier" }));
  const enCours = page.locator("section:has(#t-an-en_cours) .an-liste > li", { hasText: `Essai ${SUFFIXE}` });
  verifie((await enCours.count()) === 1 && (await enCours.innerText()).includes("toutes les boutiques"), "en cours, pour toutes les boutiques");
  await capture(page, "console-annonces", true);
  await envoie(page, enCours.getByRole("button", { name: "Arrêter" }));
  await page.waitForFunction((t) => [...document.querySelectorAll("section:has(#t-an-finie) .an-liste > li")].some((l) => l.textContent.includes(t)),
    `Essai ${SUFFIXE}`, { timeout: 10_000 }).catch(() => {});
  verifie((await page.locator("section:has(#t-an-finie) .an-liste > li", { hasText: `Essai ${SUFFIXE}` }).count()) === 1, "arrêtée : elle passe dans les finies");
});

await etape("le cycle de vie : renommer, cloner la configuration, fermer", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  await clic(page, page.locator("#bt-nom"));
  await page.keyboard.press("ControlOrMeta+a");
  await tape(page, "Outillage Pro Démo Sud");
  await envoie(page, page.getByRole("button", { name: "Renommer", exact: true }));
  verifie((await page.locator("h1").innerText()).includes("Outillage Pro Démo Sud") && (await page.locator("#vie .bt-retour").innerText()).includes("ne change pas"),
    `renommée : « ${await page.locator("h1").innerText()} », l'adresse reste`);
  await clic(page, page.getByRole("link", { name: "Nouvelle boutique à partir de celle-ci" }));
  await page.waitForURL(/modele=/);
  await page.waitForLoadState("networkidle");
  await clic(page, page.locator("#nom")); await tape(page, "Outillage Clone");
  await clic(page, page.locator("#slug")); await page.keyboard.press("ControlOrMeta+a"); await tape(page, CLONE);
  await continuer();
  await clic(page, page.locator("#hote")); await tape(page, `${CLONE}.localhost`);
  await continuer();
  verifie((await page.locator(".nb-modele").innerText()).includes("Outillage Pro Démo Sud"), "le formulaire dit de quelle boutique on part");
  await continuer(2);
  verifie((await page.locator("[data-recap]").innerText()).includes("celle du modèle"), "le récapitulatif : la structure du modèle");
  await clic(page, page.getByRole("button", { name: "Créer la boutique" }));
  await page.waitForURL(new RegExp(`/boutiques/${CLONE}`));
  await page.waitForLoadState("networkidle");
  verifie((await page.getByRole("status").first().innerText()).includes("avec l'apparence, les réglages, la livraison et les rayons"),
    "le clone naît avec la configuration de sa source");
  await clic(page, page.getByRole("button", { name: "Fermer la boutique" }));
  verifie(page.url().includes(`/boutiques/${CLONE}`) && !page.url().includes("ok="), "sans la case cochée, rien ne part");
  await clic(page, page.getByLabel("Le contrat est fini : fermer la boutique"));
  await envoie(page, page.getByRole("button", { name: "Fermer la boutique" }));
  verifie((await page.locator(".statut-fermee").innerText()).includes("Fermée"), "fermée : son statut le dit");
  await capture(page, "console-boutique-fermee");
});

await etape("l'équipe SkanEcom : inviter au support, puis retirer", async () => {
  const email = `support-${SUFFIXE}@skanecom.test`;
  await clic(page, page.getByRole("link", { name: "Équipe SkanEcom" }));
  await page.waitForURL(/equipe-plateforme/);
  await clic(page, page.locator("#ep-email")); await tape(page, email);
  verifie(await page.getByLabel(/^Support/).isChecked(), "le rôle proposé d'abord : support");
  await envoie(page, page.getByRole("button", { name: "Inviter", exact: true }));
  verifie((await page.locator(".ep-lien code").innerText()).includes("/bienvenue?"), "la console rend le lien à envoyer");
  const ligne = page.locator(".ep-liste > li", { hasText: email });
  verifie((await ligne.innerText()).includes("invitation en attente"), "la personne est listée, invitation en attente");
  await capture(page, "console-equipe-plateforme", true);
  await envoie(page, ligne.getByRole("button", { name: `Retirer ${email} de l'équipe SkanEcom` }));
  verifie((await page.locator(".ep-liste > li", { hasText: email }).count()) === 0 && (await page.locator(".ep-lien").count()) === 0,
    "retirée : plus dans la liste, et son lien n'est plus montré");
});

await etape("le journal de la plateforme : les gestes, filtrés ; les envois", async () => {
  await clic(page, page.getByRole("link", { name: "Journal" }).first());
  await page.waitForURL(/\/journal/);
  await page.locator("#jr-genre").selectOption("administrateur");
  await envoie(page, page.getByRole("button", { name: "Filtrer" }));
  const lignes = await page.locator(".tableau tbody tr").allInnerTexts();
  verifie(lignes.some((l) => l.includes("Entrée dans l'équipe SkanEcom")) && lignes.some((l) => l.includes("Sortie de l'équipe SkanEcom")),
    `filtré sur l'équipe : ${lignes.length} gestes, l'entrée et la sortie`);
  verifie(lignes.filter((l) => l.includes("Double authentification de l'équipe SkanEcom")).length >= 2, "et les changements du réglage de la double authentification");
  await clic(page, page.getByRole("link", { name: "Envois" }));
  await page.waitForURL(/vue=envois/);
  verifie((await page.locator(".jr-resume").innerText()).startsWith("Sur 7 jours"), `les envois : « ${await page.locator(".jr-resume").innerText()} »`);
});

/* ------------------------------------------------------------------ */
console.log("\n== 3 quinquies. Les prospects : qui appeler, où l'on en est, gagné ou perdu ==");

await etape("un prospect noté au clavier, à relancer aujourd'hui", async () => {
  await clic(page, page.locator(".app-cote").getByRole("link", { name: "Prospects" }));
  await page.waitForURL(/\/prospects$/);
  await page.waitForLoadState("networkidle");
  await clic(page, page.locator("#pr-nom-neuf")); await tape(page, `Parfumerie ${SUFFIXE}`);
  await page.keyboard.press("Tab"); await tape(page, "Yasmine, gérante");
  await page.keyboard.press("Tab"); await tape(page, "20 555 111");
  await page.keyboard.press("Tab"); await tape(page, "Sfax");
  await page.locator("#pr-metier-neuf").selectOption("beaute");
  await clic(page, page.locator("#pr-action-neuf")); await tape(page, "Montrer la démonstration");
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());
  await page.locator("#pr-le-neuf").fill(jour);
  await envoie(page, page.getByRole("button", { name: "Ajouter le prospect" }));
  const ligne = page.locator(".pr-ligne", { hasText: `Parfumerie ${SUFFIXE}` });
  const texte = await ligne.innerText();
  verifie(texte.includes("À contacter") && texte.includes("+216 20 555 111") && texte.includes("Beauté"), `la ligne : ${texte.replace(/\s+/g, " ").slice(0, 110)}…`);
  verifie((await ligne.locator(".pr-prochaine").getAttribute("data-echeance")) === "aujourdhui" && texte.includes("(aujourd'hui)"), "la relance du jour, signalée");
  verifie((await page.locator(".app-cote").getByRole("link", { name: /Prospects/ }).innerText()).includes("1"), "le menu compte les prospects à relancer");
  verifie(await ligne.getByRole("link", { name: "Appeler" }).getAttribute("href") === "tel:+21620555111", "« Appeler » : le numéro au format international");
  await capture(page, "console-prospects", true);
});

await etape("l'étape avance d'un choix ; « Créer sa boutique » ouvre l'assistant déjà rempli, et le prospect passe « gagné »", async () => {
  const ligne = () => page.locator(".pr-ligne", { hasText: `Parfumerie ${SUFFIXE}` });
  await clic(page, ligne().getByText("Étape, prochaine action, fiche"));
  await ligne().locator(".pr-etape select").selectOption("demo");
  // Choisir suffit : le formulaire part seul (l'adresse porte déjà un « ok= » : on attend le message).
  await page.getByRole("status").filter({ hasText: "Démonstration montrée" }).waitFor();
  verifie((await ligne().innerText()).includes("Démonstration montrée"), "« Démonstration montrée »");
  await clic(page, ligne().getByRole("link", { name: "Créer sa boutique" }));
  await page.waitForURL(/nouvelle-boutique\?/);
  await page.waitForLoadState("networkidle");
  verifie((await page.locator("#nom").inputValue()) === `Parfumerie ${SUFFIXE}` && (await page.locator("#slug").inputValue()) === `parfumerie-${SUFFIXE}`
    && (await page.locator("#contact_telephone").inputValue()) === "+216 20 555 111", "l'assistant reprend son nom, l'identifiant suit, son téléphone");
  await continuer();
  await clic(page, page.locator("#hote")); await tape(page, `parfumerie-${SUFFIXE}.localhost`);
  await continuer();
  verifie(await page.locator('input[name="metier"][value="beaute"]').isChecked(), "son métier, déjà choisi");
  await continuer(2);
  await clic(page, page.getByRole("button", { name: "Créer la boutique" }));
  await page.waitForURL(new RegExp(`/boutiques/parfumerie-${SUFFIXE}`));
  await page.goto(`${CONSOLE}/prospects?etape=gagne`, { waitUntil: "networkidle" });
  const gagne = await page.locator(".pr-ligne", { hasText: `Parfumerie ${SUFFIXE}` }).innerText();
  verifie(gagne.includes("Gagné") && gagne.includes(`Sa boutique : Parfumerie ${SUFFIXE}`), "gagné, sa boutique rattachée");
});

await etape("perdu : un motif est demandé", async () => {
  await page.goto(`${CONSOLE}/prospects`, { waitUntil: "networkidle" });
  await clic(page, page.locator("#pr-nom-neuf")); await tape(page, `Épicerie ${SUFFIXE}`);
  await envoie(page, page.getByRole("button", { name: "Ajouter le prospect" }));
  const ligne = page.locator(".pr-ligne", { hasText: `Épicerie ${SUFFIXE}` });
  verifie((await ligne.innerText()).includes("Rien de prévu"), "sans prochaine action : la ligne invite à la noter");
  await clic(page, ligne.getByText("Étape, prochaine action, fiche"));
  await clic(page, ligne.getByRole("button", { name: "Perdu", exact: true }));
  verifie(page.url().includes("/prospects") && !(page.url().includes("Perdu")), "sans motif, rien ne part");
  await tape(page, "Déjà sur une autre plateforme");
  await page.keyboard.press("Enter");
  await page.getByRole("status").filter({ hasText: "Étape : Perdu" }).waitFor();
  await page.goto(`${CONSOLE}/prospects?etape=perdu`, { waitUntil: "networkidle" });
  verifie((await page.locator(".pr-ligne", { hasText: `Épicerie ${SUFFIXE}` }).innerText()).includes("Perdu : Déjà sur une autre plateforme"), "perdu, avec son motif");
  await page.goto(`${CONSOLE}/journal?genre=prospect`, { waitUntil: "networkidle" });
  const lignes = await page.locator(".tableau tbody tr").allInnerTexts();
  verifie(lignes.some((l) => l.includes("Prospect gagné")) && lignes.some((l) => l.includes("Prospect : étape changée")), "le journal garde les gestes des prospects");
});

/* ------------------------------------------------------------------ */
console.log("\n== 3 sexies. L'état technique : ce qui répond, ce qui est branché, ce qui attend ==");

await etape("l'état technique : la base répond, les e-mails et les fichiers passent par le relais, aucun secret à l'écran", async () => {
  await clic(page, page.locator(".app-cote").getByRole("link", { name: "État technique" }));
  await page.waitForURL(/\/etat$/);
  const carte = (id) => page.locator(`section[aria-labelledby="t-${id}"]`);
  verifie((await carte("base").locator(".et-tete .ui-etat").innerText()) === "Répond" && /Répond en\s*\d[\d\s ]* ms/.test(await carte("base").innerText()),
    "la base répond, et dit en combien de temps");
  verifie((await carte("courriels").innerText()).includes("Relais local") && (await carte("courriels").locator(".et-pose").count()) >= 1,
    "les e-mails : le relais local, le crochet de Supabase Auth posé");
  verifie((await carte("skanfact").locator(".et-tete .ui-etat").innerText()) === "Branché", "SkanFact : branché (le relais le simule)");
  verifie((await carte("fichiers").innerText()).includes("Relais local"), "les fichiers : le relais local");
  // Le domaine acheté à la création (plus haut) est un vrai domaine : il se vérifie d'un geste ; les « .localhost », non.
  verifie((await carte("domaines").innerText()).includes(`cuir-${SUFFIXE}.com`)
    && await carte("domaines").getByRole("button", { name: /^Vérifier (le domaine|les \d+ domaines) maintenant$/ }).count() === 1,
  "le domaine acheté plus haut se vérifie d'un geste ; les « .localhost » ne se vérifient pas");
  // Les secrets posés sont dits « posés » : aucune valeur ne passe dans la page.
  const html = await page.content();
  const vars = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]);
  // L'adresse de SkanFact n'est pas un secret ; de COURRIELS_ENVOI, seule la clé (« resend:<clé>:<adresse> ») l'est.
  const secrets = vars.filter(([k]) => k !== "SKANFACT_URL")
    .map(([k, v]) => (k === "COURRIELS_ENVOI" ? v.split(":")[1] ?? "" : v)).filter((v) => v.length >= 12);
  verifie(secrets.length >= 5 && secrets.every((s) => !html.includes(s)), `aucune des ${secrets.length} valeurs de secret dans la page`);
  await capture(page, "console-etat", true);
});

await etape("la surveillance : chaque heure (le déclencheur du Worker), et d'un geste « Vérifier maintenant »", async () => {
  const carte = page.locator('section[aria-labelledby="t-surveillance"]');
  // Le déclencheur planifié, comme Cloudflare le lance à l'heure pile.
  // (depuis Node, « console.localhost » ne se résout pas : l'adresse du poste suffit, le déclencheur n'a pas d'hôte)
  const r = await fetch(`http://127.0.0.1:${process.env.PORT_VITRINE ?? "4200"}/cdn-cgi/local/scheduled?cron=${encodeURIComponent("0 * * * *")}&format=json`);
  verifie(r.ok && (await r.json()).outcome === "ok", "le déclencheur planifié du Worker tourne : le passage de l'heure");
  await page.reload({ waitUntil: "networkidle" });
  verifie((await carte.innerText()).includes("celui de l'heure") && (await carte.locator(".et-pose").innerText()) === "en marche",
    "la carte : le dernier passage, celui de l'heure, « en marche »");
  verifie((await carte.locator(".et-domaines li").count()) >= 5 && (await carte.innerText()).includes("maymar.localhost"),
    "la disponibilité de chaque vitrine ouverte, sur 24 heures");
  await clic(page, carte.getByRole("button", { name: "Vérifier maintenant" }));
  await page.waitForURL(/carte=surveillance/);
  verifie(/Vérifié : \d+ points?/.test(await carte.locator(".message").innerText()), "« Vérifier maintenant » : le passage refait, son bilan dans la carte");
  verifie((await carte.innerText()).includes("demandé depuis la console"), "le dernier passage : demandé depuis la console");
  await capture(page, "console-surveillance", true);
});

await etape("les revenus : sans prix fixé, rien n'est compté ; les démonstrations n'y sont pas", async () => {
  await clic(page, page.locator(".app-cote").getByRole("link", { name: "Revenus" }));
  await page.waitForURL(/\/revenus$/);
  const premier = await page.locator(".rv-chiffres > li").first().innerText();
  verifie(premier.includes("Prix à fixer") && premier.includes("Aucune formule n'a encore de prix"), "le revenu mensuel : « Prix à fixer », et pourquoi");
  const formules = await page.locator('section[aria-labelledby="t-formules"] tbody tr').allInnerTexts();
  verifie(formules.length === 3 && formules.every((l) => l.includes("Prix à fixer")), "par formule : les trois, sans prix inventé");
  const boutiques = await page.locator('section[aria-labelledby="t-boutiques"] tbody').innerText();
  verifie(boutiques.includes("Maymar") && !["Maison Selma", "Dar Alia", "Yasmine Beauté"].some((n) => boutiques.includes(n)),
    "par boutique : les clientes, pas les démonstrations");
  verifie(boutiques.includes("Choisir sa formule") && boutiques.includes("Non reliée"), "sans formule : l'invitation à la choisir ; sans SkanFact : « Non reliée »");
  await capture(page, "console-revenus", true);
});

console.log("\n== 3 septies. La consommation : ce que chaque boutique envoie, à combien elle a droit ==");
await etape("la consommation : chaque boutique, ses e-mails et ses SMS du mois ; une exception, un crédit, puis tout remis", async () => {
  await clic(page, page.locator(".app-cote").getByRole("link", { name: "Consommation" }));
  await page.waitForURL(/\/consommation$/);
  verifie((await page.locator("h1").innerText()) === "Consommation" && (await page.locator(".en-direct").count()) === 1, "la page, « En direct » (le mois en cours se relit seul)");
  const maymar = page.locator("#t-b-maymar");
  verifie((await maymar.locator(".cs-nom").innerText()) === "Maymar" && (await maymar.locator(".cs-mesure").count()) === 2, "Maymar : ses e-mails et ses SMS");
  verifie((await maymar.innerText()).includes("sans limite fixée"), "sans quota fixé : « sans limite fixée », rien d'inventé");
  // Une exception de 5 000 e-mails, ouverte au clavier.
  await maymar.locator("summary").focus();
  await page.keyboard.press("Enter");
  await maymar.locator("#q-email-maymar").fill("5 000");
  await clic(page, maymar.getByRole("button", { name: "Enregistrer les quotas" }));
  await page.waitForURL(/carte=b-maymar/);
  verifie((await maymar.locator(".message-succes").innerText()).includes("Quotas de la boutique enregistrés"), "l'exception enregistrée, dite dans la ligne restée ouverte");
  verifie(/\/\s*5\s000/.test(await maymar.locator(".cs-mesure").first().innerText()), "la jauge des e-mails : « / 5 000 »");
  // Un crédit de 250 pour le mois, puis retiré.
  await maymar.locator("#c-n-maymar").fill("250");
  await clic(page, maymar.getByRole("button", { name: "Ajouter" }));
  await page.waitForURL(/ok=250/);
  verifie(/\/\s*5\s250/.test(await maymar.locator(".cs-mesure").first().innerText()), "avec le crédit du mois : « / 5 250 »");
  await clic(page, maymar.locator(".cs-credits").getByRole("button", { name: /Retirer le crédit/ }));
  await page.waitForURL(/Cr%C3%A9dit\+retir%C3%A9|Crédit\+retiré/);
  // L'exception effacée : la boutique revient à sa formule (sur mesure : sans limite).
  await maymar.locator("#q-email-maymar").fill("");
  await clic(page, maymar.getByRole("button", { name: "Enregistrer les quotas" }));
  await page.waitForFunction(() => document.querySelector("#t-b-maymar .cs-mesure")?.textContent?.includes("sans limite fixée"));
  verifie(true, "le crédit retiré, l'exception effacée : Maymar revient à « sans limite fixée »");
  await capture(page, "console-consommation", true);
});

await etape("le crochet des SMS : la boutique retrouvée par l'annonce de la vitrine, le SMS compté à son mois ; sans signature, rien ne part", async () => {
  const telephone = "+216 29 000 417";
  verifie((await annonceSms("maymar.localhost", telephone)) === 204, "la vitrine annonce le numéro (204, la même réponse dans tous les cas)");
  const evenement = { user: { phone: "21629000417" }, sms: { otp: "730418" } };
  const faux = await crochetCourriel(evenement, { signe: false, chemin: "/crochets/sms" });
  verifie(faux.status === 401, `mal signé : refusé (HTTP ${faux.status})`);
  const r = await crochetCourriel(evenement, { chemin: "/crochets/sms" });
  verifie(r.status === 200, `signé : le SMS part (HTTP ${r.status})`);
  const relu = await (await fetch(`${RELAIS}/sms-dev/dernier?telephone=21629000417`)).json();
  verifie(relu.code === "730418", "le relais a reçu le code (le fournisseur de SMS en local)");
  await page.goto(CONSOLE + "/journal?vue=envois", { waitUntil: "networkidle" });
  const ligne = await page.locator("tbody tr").first().innerText();
  verifie(ligne.includes("•••417") && ligne.includes("Maymar") && !ligne.includes("29000417"), "au journal des envois : le numéro masqué, au nom de Maymar");
});

/* ------------------------------------------------------------------ */
console.log("\n== 3 octies. La formule d'une boutique, personnalisée ==");
await etape("la formule d'une boutique : un droit retiré à « sur mesure », un prix propre, compté dans Revenus, puis revenue à sa formule", async () => {
  await page.goto(CONSOLE + "/boutiques/maymar", { waitUntil: "networkidle" });
  await clic(page, page.getByRole("link", { name: "Formule", exact: true }));
  await page.waitForURL(/\/boutiques\/maymar\/droits$/);
  verifie((await page.locator(".dr-resume h3").innerText()).includes("Sur mesure"), "l'onglet Formule : Maymar part de « sur mesure »");
  const ligne = page.locator('.dr-ligne:has(input[value="pub.pixel_meta"])');
  await ligne.locator("input").uncheck();
  verifie(await ligne.locator(".dr-retire").isVisible(), "décochée, la ligne dit « Retiré » avant même d'enregistrer");
  await page.locator("#dr-prix").fill("79");
  await clic(page, page.getByRole("button", { name: "Enregistrer", exact: true }));
  await page.waitForURL(/ok=/);
  const ok = await page.locator(".message-succes").innerText();
  verifie(ok.includes("Retiré : Pixel Meta") && ok.includes("79,000"), "enregistré : ce qui est retiré, et son prix, dits");
  verifie((await page.locator(".dr-resume .aide").innerText()).includes("1 retiré"), "le résumé : « 1 retiré pour cette boutique »");
  await page.goto(CONSOLE + "/revenus", { waitUntil: "networkidle" });
  const rang = await page.locator('section[aria-labelledby="t-boutiques"] tbody tr', { hasText: "Maymar" }).innerText();
  verifie(rang.includes("79,000") && rang.includes("son prix") && rang.includes("personnalisée"), "Revenus : son prix propre compte, et elle est dite personnalisée");
  await page.goto(CONSOLE + "/boutiques/maymar/droits", { waitUntil: "networkidle" });
  await page.locator("#dr-prix").fill("");
  await clic(page, page.getByRole("button", { name: /Revenir à/ }));
  await page.waitForURL(/Revenue/);
  const revenue = await page.waitForFunction(() => document.querySelector(".dr-resume .aide")?.textContent?.includes("tout ouvert"), null, { timeout: 10_000 })
    .then(() => true, () => false);
  verifie(revenue && (await page.locator(".dr-resume .aide").innerText()).includes("prix à fixer"), "revenue à « sur mesure » : tout ouvert, plus de prix propre");
  await capture(page, "console-formule-boutique", true);
});

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
  verifie(await page.getByRole("button", { name: "Plus tard" }).count() === 0, "et pas de « Plus tard » : qui a une application donne toujours son code");
  const r = await brut(ctx, "GET", "/");
  verifie(r.status >= 300 && r.status < 400 && r.location.includes("/double-authentification"),
    `sans le code, la console reste fermée (« / » → ${r.status} ${r.location})`);
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
  // Pas « networkidle » : le cadre de l'aperçu (srcdoc, sans script) ne
  // signale jamais son chargement à Playwright, qui attendrait sans fin.
  await page.locator(".crl-cadre").waitFor({ timeout: 15_000 }).catch(() => {});
  await pause(600);
  const liste = page.getByRole("navigation", { name: "E-mails", exact: true });
  const noms = await liste.getByRole("link").allInnerTexts();
  verifie(noms.length === 10 && ["Commande reçue", "En route", "Livrée", "Nouvelle commande (équipe)"].every((n) => noms.some((x) => x.includes(n))),
    "dix e-mails dans la liste : le code, la nouvelle adresse, la lettre (confirmer, déjà inscrit), l'invitation, le mot de passe, et les quatre de la commande");
  verifie(await page.locator(".crl-cadre").count() === 1, "un seul aperçu à la fois, pas dix empilés");
  const sujet = await page.locator(".crl-sujet").first().innerText();
  verifie(/^Votre code de connexion — .+/.test(sujet), `le sujet dit qui écrit : « ${sujet} »`);
  await capture(page, "console-courriels");
  await clic(page, liste.getByRole("link", { name: /Invitation/ }));
  await page.waitForURL(/courriel=invitation/);
  await pause(400);
  verifie((await page.locator(".crl-sujet").innerText()).includes("SkanEcom")
    && await liste.getByRole("link", { name: /Invitation/ }).getAttribute("aria-current") === "page",
    "un clic dans la liste : l'invitation s'affiche, marquée dans la liste");
  await page.goto(CONSOLE + "/courriels?boutique=quincaillerie-demo&vue=telephone", { waitUntil: "load" });
  await page.locator(".crl-cadre").waitFor({ timeout: 15_000 }).catch(() => {});
  await pause(600);
  verifie((await page.locator(".crl-sujet").first().innerText()).includes("Quincaillerie du Sud"), "une autre boutique : son nom dans le sujet");
  await capture(page, "console-courriels-quincaillerie-telephone");
  // La boutique se choisit dans une liste (elle tient à trente boutiques) : la changer suffit.
  await page.locator("#crl-boutique").selectOption({ label: "Dar Alia" });
  await page.waitForURL((u) => !u.searchParams.get("boutique")?.includes("quincaillerie"), { timeout: 10_000 }).catch(() => {});
  await page.locator(".crl-cadre").waitFor({ timeout: 15_000 }).catch(() => {});
  verifie((await page.locator(".crl-sujet").first().innerText()).includes("Dar Alia") && page.url().includes("vue=telephone"),
    "choisie dans la liste : Dar Alia, toujours sur téléphone");
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

await etape("l'envoi d'une boutique : ses réponses, son domaine (ajouté, vérifié, allumé), l'essai qui en part, puis tout retiré", async () => {
  const domaine = `selma-${SUFFIXE}.tn`;
  const texte = (sel) => page.locator(sel).innerText();
  const attend = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 10_000 }).then(() => true, () => false);
  await page.goto(CONSOLE + "/boutiques/maison-selma", { waitUntil: "networkidle" });
  await clic(page, page.getByRole("navigation", { name: /^Pages/ }).getByRole("link", { name: "E-mails" }));
  await page.waitForURL(/\/boutiques\/maison-selma\/courriels$/);
  verifie((await texte(".ce-vu")).includes("Depuis SkanEcom"), "par défaut : rien de réglé, au nom de la boutique, depuis l'adresse de SkanEcom");

  await page.locator("#ce-reponse").fill("contact@maison-selma.tn");
  await clic(page, page.locator("#t-expediteur").getByRole("button", { name: "Enregistrer", exact: true }));
  verifie(await attend(() => document.querySelector("#t-expediteur .message-succes")?.textContent?.includes("contact@maison-selma.tn")),
    "l'adresse de réponse enregistrée, dite dans sa carte");

  await page.locator("#cd-domaine").fill(`https://www.${domaine}/`);
  await clic(page, page.getByRole("button", { name: /^Ajouter chez/ }));
  verifie(await attend(() => document.querySelectorAll(".ce-dns tbody tr").length >= 4), "ajouté : ses enregistrements DNS à poser (SPF, DKIM) et le DMARC conseillé");
  verifie((await texte("#t-domaine .ce-etats")).includes("En attente") && await page.getByRole("button", { name: /^Envoyer depuis/ }).count() === 0,
    "pas encore vérifié : en attente, et rien pour l'allumer");
  verifie((await texte(".ce-dns")).includes(`resend._domainkey.${domaine}`), "le domaine se lit sans https:// ni www.");

  await clic(page, page.getByRole("button", { name: "Vérifier maintenant" }));
  verifie(await attend(() => document.querySelector("#t-domaine .ce-etats")?.textContent?.includes("Vérifié")), "vérifié chez le fournisseur");
  await clic(page, page.getByRole("button", { name: `Envoyer depuis commandes@${domaine}` }));
  verifie(await attend(() => document.querySelector(".ce-vu")?.textContent?.includes("Depuis son domaine")), "allumé : ses e-mails partent de son domaine");

  const adresse = `essai-${SUFFIXE}@exemple.tn`;
  await page.locator("#ce-a").fill(adresse);
  await page.locator("#ce-modele").selectOption("commande");
  await clic(page, page.getByRole("button", { name: "Envoyer l'essai" }));
  verifie(await attend(() => document.querySelector("#t-essai .message-succes")?.textContent?.includes("Essai envoyé")), "l'essai est parti");
  const rendu = await (await fetch(`${RELAIS}/email-dev/rendu/dernier?email=${encodeURIComponent(adresse)}`)).json();
  verifie(rendu.de === `commandes@${domaine}` && rendu.reponse_a === "contact@maison-selma.tn" && rendu.sujet.startsWith("[Essai] Commande"),
    `l'essai part de commandes@${domaine}, les réponses vers contact@maison-selma.tn : « ${rendu.de} », « ${rendu.reponse_a} »`);
  await capture(page, "console-courriels-boutique", true);

  await clic(page, page.locator(".ce-retirer > summary"));
  await clic(page, page.getByRole("button", { name: `Retirer ${domaine}` }));
  verifie(await attend(() => document.querySelector(".ce-vu")?.textContent?.includes("Depuis SkanEcom")), "retiré : ses e-mails repartent de SkanEcom");
  await page.locator("#ce-reponse").fill("");
  await clic(page, page.locator("#t-expediteur").getByRole("button", { name: "Enregistrer", exact: true }));
  verifie(await attend(() => document.querySelector("#t-expediteur .message-succes")?.textContent?.includes("pas d'adresse de réponse")), "et plus d'adresse de réponse");

  await page.goto(CONSOLE + "/courriels/envoi", { waitUntil: "networkidle" });
  verifie((await texte("#t-expediteur")).includes("Relais local") && (await texte("#t-boutiques")).includes("Maymar"),
    "la page Envoi : l'expéditeur de la plateforme, et chaque boutique");
  await capture(page, "console-courriels-envoi", true);
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
