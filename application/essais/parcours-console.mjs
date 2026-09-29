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
const { pause, note, verifie, capture, clic, tape, etape } = t;
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
  const lignes = await page.locator("tbody tr").allInnerTexts();
  verifie(lignes.some((l) => l.includes("Maymar")) && lignes.some((l) => l.includes("Quincaillerie")),
    `tableau des boutiques : ${lignes.length} boutiques, dont Maymar et la quincaillerie`);
  await capture(page, "console-tableau");
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
  await clic(page, page.getByRole("button", { name: "Ouvrir la boutique" }));
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

await etape("le journal garde tout", async () => {
  await page.goto(`${CONSOLE}/boutiques/${SLUG}`, { waitUntil: "networkidle" });
  const journal = await page.locator("section:has(#t-journal) tbody tr").allInnerTexts();
  const actions = ["Boutique créée", "Statut changé", "Marque modifiée", "Image de la marque"];
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
  await clic(page, page.getByRole("button", { name: /^Importer 2 produits \(4 variantes\)/ }));
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
  await clic(page, page.getByRole("button", { name: "Inviter" }));
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
  await clic(page, page.getByRole("button", { name: "Inviter" }));
  await page.waitForURL(new RegExp(`/equipe\\?ok=`));
  await page.waitForLoadState("networkidle");
  lienAppels = await lienAffiche();
  verifie(lienAppels !== lienGerant && (await page.locator("#t-lien").innerText()).includes(APPELS), "un autre lien, le sien");
});

await etape("une personne déjà dans l'équipe n'est pas réinvitée", async () => {
  await page.locator("#email").fill(APPELS.toUpperCase());
  await clic(page, page.locator(".role-choix", { hasText: "Lecture seule" }));
  await clic(page, page.getByRole("button", { name: "Inviter" }));
  await page.waitForURL(/erreur=/);
  verifie((await page.getByRole("alert").innerText()).includes("fait déjà partie de l'équipe"), `refusé : « ${await page.getByRole("alert").innerText()} »`);
  verifie(await lienAffiche() === lienAppels, "son lien d'invitation reste valable (aucun nouveau jeton)");
});

await etape("une personne qui a déjà un compte entre avec son mot de passe, sans lien", async () => {
  const email = `ancien-${SUFFIXE}@outillage.test`;
  await gotrue("POST", "/admin/users", { email, password: "mot-de-passe-habituel", email_confirm: true });
  await page.locator("#email").fill(email);
  await clic(page, page.locator(".role-choix", { hasText: "Préparation" }));
  await clic(page, page.getByRole("button", { name: "Inviter" }));
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
  await clic(page, ligneDe(GERANT).getByRole("button", { name: "Retirer l'accès" }));
  await page.waitForURL(/erreur=/);
  verifie((await page.getByRole("alert").innerText()).includes("au moins un propriétaire actif"), `refusé : « ${await page.getByRole("alert").innerText()} »`);
});

await etape("retirer l'accès : elle est dehors aussitôt ; le rendre", async () => {
  await clic(page, ligneDe(APPELS).getByRole("button", { name: "Retirer l'accès" }));
  await page.waitForURL(/ok=/);
  verifie((await ligneDe(APPELS).innerText()).includes("Accès retiré"), "la liste la montre sans accès");
  const r = await brut(appels, "GET", `/gestion/${SLUG}`);
  verifie(r.status === 307 || r.status === 303 ? r.location.includes("/refuse") : false, `sa session ouverte ne mène plus qu'à /refuse (${r.status} → ${r.location})`);
  await clic(page, ligneDe(APPELS).getByRole("button", { name: "Rendre l'accès" }));
  await page.waitForURL(/ok=/);
  const r2 = await brut(appels, "GET", `/gestion/${SLUG}`);
  verifie(r2.status === 200, `accès rendu : son backoffice s'ouvre de nouveau (HTTP ${r2.status})`);
});

await etape("mot de passe oublié : un nouveau lien, le même compte", async () => {
  await clic(page, ligneDe(APPELS).getByRole("button", { name: "Lien de mot de passe" }));
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
