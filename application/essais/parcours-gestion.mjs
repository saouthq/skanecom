import { createHmac } from "node:crypto";
import { creeTesteur } from "./testeur.mjs";

/* ============================================================================
   PARCOURS DU BACKOFFICE — l'équipe de Maymar traite ses commandes.

   1. L'employé des appels (confirmateur, sans double authentification) :
      la liste par étape, un appel sans réponse, une confirmation par
      WhatsApp, la recherche, une boutique qui n'est pas la sienne, et deux
      écrans ouverts sur la même commande (le geste périmé est refusé).
   2. Le gérant (propriétaire, double authentification) : expédier, livrer,
      refuser à la livraison avec son origine, annuler, noter ; puis le
      catalogue : un arrivage, un inventaire, un prix, une couleur de plus,
      un produit neuf mis en vitrine, ses photos (réduites avant l'envoi,
      rangées, légendées, retirées), deux écrans sur la même fiche ; enfin
      les réglages : invités, confirmation d'office, frais par zone, une
      zone de plus, un moyen de paiement qu'on ne peut pas couper.
   3. Le même employé sur téléphone.
   4. Le préparateur d'une autre boutique : pas de bouton de confirmation ;
      au catalogue, le stock mais pas les fiches ni les photos ; les
      réglages en lecture seule.

     cd application && bun run parcours:gestion
     (base fraîche avec le jeu de démo : les onze commandes de Maymar ; API
     locale, qui crée les comptes de l'équipe ; vitrine lancée ; clés dans
     .outils/api-locale.env)
   ========================================================================== */

const t = creeTesteur();
const { pause, note, verifie, capture, clic, tape, etape } = t;
const C = t.adresse("console.localhost");
const MDP = "equipe-locale-skanecom";
const annee = new Date().getFullYear();
const num = (n) => `MAY-${annee}-${String(n).padStart(5, "0")}`;
const attendue = (url) => url.includes("/gestion/maison-selma");
await sansDoubleAuthentification("gerant@maymar.test");
const navigateur = await t.navigateur();

/* TOTP (RFC 6238), le même calcul que parcours-console.mjs. */
function base32(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const octets = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) octets.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(octets);
}
function totp(secret) {
  const pas = Buffer.alloc(8);
  pas.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const h = createHmac("sha1", base32(secret)).update(pas).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/* Comme un téléphone neuf : le gérant n'a pas encore de double
   authentification (le parcours se rejoue sans perdre l'inscription par QR
   code). API d'administration de GoTrue, clé de .outils/api-locale.env. */
async function sansDoubleAuthentification(email) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const api = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;
  const entetes = { apikey: cle, authorization: `Bearer ${cle}` };
  const { users } = await (await fetch(`${api}/admin/users?per_page=1000`, { headers: entetes })).json();
  const compte = users.find((u) => u.email === email);
  if (!compte) throw new Error(`${email} introuvable : lancer outils/api-locale.sh demarrer`);
  const facteurs = await (await fetch(`${api}/admin/users/${compte.id}/factors`, { headers: entetes })).json();
  for (const f of facteurs ?? []) await fetch(`${api}/admin/users/${compte.id}/factors/${f.id}`, { method: "DELETE", headers: entetes });
}

async function connexion(page, email, mobile = false) {
  await page.goto(C + "/connexion", { waitUntil: "networkidle" });
  const champ = async (loc, texte) => {
    if (mobile) await loc.tap(); else await clic(page, loc);
    await tape(page, texte);
  };
  await champ(page.locator("#email"), email);
  await champ(page.locator("#mot_de_passe"), MDP);
  await page.keyboard.press("Enter");
}

/* Un formulaire posté « à la main » (hors navigateur), avec les cookies de
   la session : la console doit refuser d'elle-même, pas seulement l'écran. */
async function posteBrut(contexte, chemin, formulaire) {
  const { request } = await import("node:http");
  const cookies = (await contexte.cookies(C)).map((c) => `${c.name}=${c.value}`).join("; ");
  const corps = new URLSearchParams(formulaire).toString();
  return new Promise((ok, ko) => {
    const req = request({
      host: "127.0.0.1", port: Number(t.port), method: "POST", path: chemin,
      headers: { host: new URL(C).host, origin: C, cookie: cookies, "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(corps) },
    }, (r) => { r.resume(); r.on("end", () => ok({ status: r.statusCode, location: r.headers.location ?? "" })); });
    req.on("error", ko);
    req.end(corps);
  });
}

/* Les frais de livraison qu'annonce la base à un acheteur (API publique). */
async function fraisPour(gouvernorat, sousTotal = 1000) {
  const r = await fetch("http://127.0.0.1:54321/rest/v1/rpc/frais_livraison_millimes", {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({ p_boutique_id: "00000000-0000-4000-8000-000000000001", p_gouvernorat_code: gouvernorat, p_sous_total_millimes: sousTotal }),
  });
  return r.ok ? Number(await r.json()) : Number.NaN;
}

/* Un fichier servi par le relais local (qui tient lieu de R2). */
async function fichierLocal(chemin) {
  const r = await fetch(`http://127.0.0.1:54321/fichiers/${chemin}`);
  return { status: r.status, type: r.headers.get("content-type") ?? "", octets: r.ok ? new Uint8Array(await r.arrayBuffer()) : new Uint8Array() };
}

/* Largeur et hauteur d'un WebP (VP8, VP8L ou VP8X). */
function tailleWebp(o) {
  const quatre = String.fromCharCode(...o.subarray(12, 16));
  if (quatre === "VP8X") return [1 + (o[24] | (o[25] << 8) | (o[26] << 16)), 1 + (o[27] | (o[28] << 8) | (o[29] << 16))];
  if (quatre === "VP8L") { const b = o[21] | (o[22] << 8) | (o[23] << 16) | (o[24] << 24); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  return [(o[26] | (o[27] << 8)) & 0x3fff, (o[28] | (o[29] << 8)) & 0x3fff];
}

/* Le chemin R2 d'une vignette, lu dans l'adresse de l'optimiseur d'images. */
async function cheminDe(vignette) {
  const src = await vignette.locator("img").first().getAttribute("src");
  const brut = new URL(src, "http://x").searchParams.get("url") ?? src;
  return decodeURIComponent(brut).replace(/^.*\/fichiers\//, "");
}

async function ouvre(page, n) {
  await page.goto(`${C}/gestion/maymar/commandes/${num(n)}`, { waitUntil: "networkidle" });
}

const message = (page) => page.locator(".bo-message").innerText().catch(() => "");
const statut = (page) => page.locator(".bo-fiche-tete .bo-statut").innerText().catch(() => "");

/* ------------------------------------------------------------------ */
console.log("\n== 1. L'employé des appels, grand écran ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "appels", attendue);

  await etape("connexion sans double authentification", async () => {
    await connexion(page, "appels@maymar.test");
    await page.waitForURL(/\/gestion\/maymar$/, { timeout: 15000 });
    verifie(true, "l'employé des appels entre directement dans le backoffice de Maymar");
    verifie((await page.locator(".app-cote .app-compte-role").innerText()).includes("Confirmation"), "son rôle est affiché");
  });

  await etape("la liste « à confirmer »", async () => {
    const lignes = page.locator(".bo-ligne");
    verifie(await lignes.count() === 3, `trois commandes à confirmer (${await lignes.count()})`);
    verifie((await lignes.first().innerText()).includes(num(9)), "la plus ancienne d'abord");
    const etapes = (await page.locator(".bo-etapes").innerText()).replace(/\s+/g, " ");
    verifie(/À confirmer 3/.test(etapes) && /À préparer 2/.test(etapes) && /Expédiées 1/.test(etapes) && /Clôturées 5/.test(etapes),
      `les compteurs de chaque étape (${etapes})`);
    const client = await page.locator(".bo-ligne", { hasText: num(10) }).innerText();
    verifie(client.includes("3 commandes") && client.includes("1 refus"), "le client qui a déjà refusé un colis est signalé avant l'appel");
    verifie((await page.locator(".bo-ligne", { hasText: num(9) }).innerText()).includes("Appelé 1×"), "l'appel resté sans réponse aussi");
    verifie(!(await page.locator(".bo-ligne", { hasText: num(11) }).innerText()).includes("Sousse, Sousse"), "la ville n'est pas répétée quand elle porte le nom du gouvernorat");
    await capture(page, "gestion-liste");
  });

  await etape("un deuxième appel sans réponse", async () => {
    await clic(page, page.locator(".bo-ligne-lien", { hasText: num(9) }));
    await page.waitForURL(new RegExp(`commandes/${num(9)}$`));
    verifie((await page.locator(".bo-journal").innerText()).includes("Appel · Injoignable"), "l'historique garde le premier appel");
    await capture(page, "gestion-fiche-a-confirmer");
    await clic(page, page.getByRole("button", { name: "Injoignable" }));
    await page.waitForURL(/fait=appel-injoignable/);
    verifie((await message(page)).includes("injoignable"), "« Injoignable » : l'appel est noté");
    verifie((await page.locator(".bo-action").innerText()).includes("Déjà 2 tentatives"), "la fiche compte les tentatives");
    verifie((await statut(page)) === "À confirmer", "la commande attend toujours");
  });

  await etape("une confirmation par WhatsApp", async () => {
    await ouvre(page, 11);
    const lien = await page.getByRole("link", { name: /WhatsApp/ }).getAttribute("href");
    verifie(lien.startsWith("https://wa.me/21655666777?text=") && decodeURIComponent(lien).includes(num(11)),
      "le message WhatsApp est prêt : bon numéro, numéro de commande, montant");
    note("INFO  ", `message : ${decodeURIComponent(lien.split("text=")[1]).slice(0, 120)}…`);
    await clic(page, page.getByLabel("WhatsApp", { exact: true }));
    await clic(page, page.locator("#note-appel"));
    await tape(page, "Livraison après 17 h");
    await clic(page, page.getByRole("button", { name: /Confirmée/ }));
    await page.waitForURL(/fait=appel-confirmee/);
    verifie((await message(page)).includes("Commande confirmée"), "« Confirmée » : la commande passe à la préparation");
    verifie((await statut(page)) === "Confirmée", "son statut suit");
    verifie((await page.locator(".bo-journal").innerText()).includes("WhatsApp · Confirmée — Livraison après 17 h"), "l'historique dit par où, et la note");
    verifie(await page.getByRole("button", { name: "Marquer expédiée" }).count() === 0, "l'employé des appels ne peut pas expédier : le bouton n'est pas proposé");
    await capture(page, "gestion-fiche-confirmee");
  });

  await etape("chercher un client par son téléphone", async () => {
    await page.goto(`${C}/gestion/maymar?etape=toutes`, { waitUntil: "networkidle" });
    await clic(page, page.locator("#q"));
    await tape(page, "98 321");
    await page.keyboard.press("Enter");
    await page.waitForURL(/q=98/);
    const lignes = await page.locator(".bo-ligne").allInnerTexts();
    verifie(lignes.length === 3 && lignes.every((l) => l.includes("Mohamed Ali Trabelsi")), `ses trois commandes, et elles seules (${lignes.length})`);
  });

  await etape("la boutique d'un autre : introuvable", async () => {
    const r = await page.goto(`${C}/gestion/maison-selma`);
    verifie(r.status() === 404, `le backoffice de Maison Selma n'existe pas pour lui (HTTP ${r.status()})`);
  });

  await etape("deux écrans, un seul geste", async () => {
    // Un deuxième poste (un autre navigateur, même compte) : deux personnes
    // qui ouvrent la même commande en même temps.
    const poste2 = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
    await poste2.addCookies(await ctx.cookies());
    const autre = await poste2.newPage();
    t.espion(autre, "appels-2", attendue);
    await ouvre(page, 10);
    await autre.goto(`${C}/gestion/maymar/commandes/${num(10)}`, { waitUntil: "networkidle" });
    await clic(autre, autre.getByRole("button", { name: /Confirmée/ }));
    await autre.waitForURL(/fait=appel-confirmee/);
    await clic(page, page.getByRole("button", { name: "Refus du client" }));
    await page.waitForURL(/erreur=/);
    const texte = await page.locator(".message-erreur").innerText();
    verifie(texte.includes("entre-temps") || texte.includes("n'attend plus"), `le geste périmé est refusé : « ${texte.slice(0, 90)}… »`);
    verifie((await statut(page)) === "Confirmée", "la fiche montre l'état réel");
    await capture(page, "gestion-geste-perime");
    await poste2.close();
  });

  await etape("la veille : le compteur, et l'alerte d'une nouvelle commande", async () => {
    // Un poste où les notifications sont permises ; on garde trace de celles
    // que la page crée. L'API du navigateur est remplacée par un témoin : le
    // Chromium sans tête de la CI (headless shell) refuse toute notification,
    // permission accordée ou non. Ce qu'on vérifie, c'est ce que la page en
    // fait : l'état « Alertes activées », puis la bonne notification.
    const veille = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR", permissions: ["notifications"] });
    await veille.addCookies(await ctx.cookies());
    await veille.addInitScript(() => {
      window.__notifs = [];
      window.Notification = class {
        static get permission() { return "granted"; }
        static requestPermission() { return Promise.resolve("granted"); }
        constructor(titre, options) {
          this.onclick = null;
          window.__notifs.push(`${titre} — ${options?.body ?? ""}`);
        }
        close() {}
      };
    });
    const p = await veille.newPage();
    t.espion(p, "veille", attendue);
    await p.goto(`${C}/gestion/maymar`, { waitUntil: "networkidle" });
    const aConfirmer = Number((await p.locator(".bo-etapes a", { hasText: "À confirmer" }).innerText()).match(/\d+/)?.[0] ?? -1);
    await p.locator(".app-cote .app-nav-compte").waitFor({ timeout: 5000 });
    verifie(Number(await p.locator(".app-cote .app-nav-compte").innerText()) === aConfirmer, `le compteur de la navigation : ${aConfirmer} à confirmer`);
    verifie((await p.title()).startsWith(`(${aConfirmer}) `), `et le titre de l'onglet : « ${await p.title()} »`);
    verifie((await p.locator(".bo-alertes").innerText()).includes("Alertes activées"), "les alertes sont activées (permission donnée)");

    // Une commande arrive (écrite directement en base, comme la vitrine le ferait).
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const entetes = { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json", prefer: "return=representation" };
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/commandes`, {
      method: "POST", headers: entetes,
      body: JSON.stringify({ boutique_id: "00000000-0000-4000-8000-000000000001", contact_nom: "Salma Ben Ali", contact_telephone: "+21622333444",
        livraison_ligne1: "5 rue de Carthage", livraison_ville: "Tunis", livraison_gouvernorat: "tunis", total_millimes: 189000 }),
    });
    const [nouvelle] = r.ok ? await r.json() : [];
    verifie(Boolean(nouvelle?.numero), `une nouvelle commande arrive : ${nouvelle?.numero ?? r.status}`);
    // (sans attendre les 45 s : on revient sur l'onglet — au moins 10 s après
    // la dernière question, la veille ne se répète pas plus souvent)
    await pause(10500);
    await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await p.waitForFunction((n) => Number(document.querySelector(".app-cote .app-nav-compte")?.textContent) === n, aConfirmer + 1, { timeout: 5000 }).catch(() => {});
    verifie(Number(await p.locator(".app-cote .app-nav-compte").innerText()) === aConfirmer + 1, "le compteur passe à un de plus, sans recharger la page");
    const notifs = await p.evaluate(() => window.__notifs);
    verifie(notifs.length === 1 && notifs[0].includes(nouvelle?.numero) && notifs[0].includes("Salma Ben Ali") && notifs[0].includes("189,000 TND"),
      `une notification : « ${notifs[0] ?? "aucune"} »`);
    await capture(p, "gestion-veille");
    if (nouvelle?.id) await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/commandes?id=eq.${nouvelle.id}`, { method: "DELETE", headers: entetes });
    await veille.close();
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 2. Le gérant, double authentification ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "gerant", attendue);

  await etape("connexion, puis double authentification", async () => {
    await connexion(page, "gerant@maymar.test");
    await page.waitForURL(/double-authentification/, { timeout: 15000 });
    verifie(true, "propriétaire : la double authentification est demandée");
    const secret = (await page.locator("[data-secret-totp]").textContent()).trim();
    await clic(page, page.locator("#code"));
    await tape(page, totp(secret));
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/gestion\/maymar$/, { timeout: 15000 });
    verifie(true, "le code de l'application ouvre le backoffice");
  });

  await etape("les bordereaux des commandes à préparer", async () => {
    await page.goto(`${C}/gestion/maymar?etape=a_preparer`, { waitUntil: "networkidle" });
    const bouton = page.getByRole("link", { name: /^Bordereaux \(\d+\)$/ });
    const n = Number((await bouton.innerText()).match(/\d+/)?.[0] ?? 0);
    verifie(n >= 1, `un bouton pour les ${n} commandes à préparer`);
    await clic(page, bouton);
    await page.waitForURL(/\/bordereaux\?etape=a_preparer$/);
    await page.waitForLoadState("networkidle");
    verifie(await page.locator(".bdx").count() === n, `${n} bordereau(x), un par colis`);
    const premier = await page.locator(".bdx").first().innerText();
    verifie(/MAY-\d{4}-\d{5}/.test(premier) && /à encaisser/i.test(premier) && /\+216 \d{2} \d{3} \d{3}/.test(premier),
      "le numéro, le téléphone du client en grand, le montant à encaisser");
    // (le fond de l'onglet quitté s'efface en 0,15 s : on laisse la transition finir avant la capture)
    await pause(400);
    verifie(await page.locator(".app-cote [aria-current=page]").count() === 0, "aucun onglet ne se dit « la page » : les bordereaux sont une page à part");
    await capture(page, "gestion-bordereaux");
    await page.emulateMedia({ media: "print" });
    await capture(page, "gestion-bordereaux-impression", true);
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    verifie(pages === Math.ceil(n / 2), `imprimés deux par feuille A4 : ${pages} page(s) pour ${n}`);
    await page.emulateMedia({ media: "screen" });
  });

  await etape("expédier, puis livrée", async () => {
    await ouvre(page, 8);
    await clic(page, page.locator("#suivi"));
    await tape(page, "TN77001");
    await clic(page, page.getByRole("button", { name: "Marquer expédiée" }));
    await page.waitForURL(/fait=expedier/);
    verifie((await statut(page)) === "Expédiée", "la commande est expédiée");
    verifie((await page.locator(".bo-action").innerText()).includes("suivi TN77001"), "le numéro de suivi est gardé");
    await capture(page, "gestion-fiche-expediee");
    await clic(page, page.getByRole("button", { name: /Livrée, paiement encaissé/ }));
    await page.waitForURL(/fait=livrer/);
    verifie((await statut(page)) === "Livrée", "livrée : le paiement est encaissé");
  });

  await etape("refusée à la livraison, avec son origine", async () => {
    await ouvre(page, 6);
    await clic(page, page.locator("summary", { hasText: "Refusée à la livraison" }));
    await clic(page, page.getByLabel("Le client a refusé le colis"));
    await clic(page, page.locator("#commentaire"));
    await tape(page, "Ne voulait plus la valise");
    await capture(page, "gestion-refus");
    await clic(page, page.getByRole("button", { name: "Enregistrer le refus" }));
    await page.waitForURL(/fait=refuser/);
    verifie((await message(page)).includes("Le stock est rendu"), "refus enregistré, stock rendu");
    verifie((await page.locator(".bo-fiche-cote").innerText()).includes("1 refus à la livraison"), "le refus compte sur la fiche du client");
  });

  await etape("annuler, avec un motif", async () => {
    await ouvre(page, 7);
    await clic(page, page.locator("summary", { hasText: "Annuler la commande" }));
    await clic(page, page.locator("#motif"));
    await tape(page, "Rupture chez le fournisseur");
    await clic(page, page.getByRole("button", { name: "Annuler la commande" }));
    await page.waitForURL(/fait=annuler/);
    verifie((await statut(page)) === "Annulée", "la commande est annulée");
    verifie((await page.locator(".bo-action").innerText()).includes("Rupture chez le fournisseur"), "le motif est affiché");
  });

  await etape("la note interne", async () => {
    await ouvre(page, 11);
    await clic(page, page.locator("#note-interne"));
    await tape(page, "Cliente de Sousse, livrer avant le week-end");
    await clic(page, page.getByRole("button", { name: "Enregistrer la note" }));
    await page.waitForURL(/fait=note/);
    verifie((await page.locator("#note-interne").inputValue()) === "Cliente de Sousse, livrer avant le week-end", "la note est gardée");
    await capture(page, "gestion-fiche-note", true);
  });

  /* ---------------- Le catalogue ---------------- */
  const fiche = async (nom) => {
    await page.goto(`${C}/gestion/maymar/produits`, { waitUntil: "networkidle" });
    await clic(page, page.locator(".cat-ligne-lien", { hasText: nom }));
    await page.waitForURL(/\/produits\/[0-9a-f-]{36}/);
    await page.waitForLoadState("networkidle");
  };
  const ok = () => page.getByRole("status").first().innerText().catch(() => "");
  /* Un formulaire posté : on attend la page qui revient (l'adresse porte
     souvent déjà « ?ok= » : l'attendre ne suffit pas). */
  const envoie = async (bouton) => {
    await Promise.all([page.waitForEvent("load"), clic(page, bouton)]);
    await page.waitForLoadState("networkidle");
  };

  await etape("le catalogue : ses produits, ses filtres", async () => {
    await clic(page, page.locator(".app-cote").getByRole("link", { name: "Catalogue" }));
    await page.waitForURL(/\/gestion\/maymar\/produits$/);
    await page.waitForLoadState("networkidle");
    verifie(await page.locator(".cat-ligne").count() === 4, `les quatre valises de Maymar (${await page.locator(".cat-ligne").count()})`);
    verifie((await page.locator(".app-cote [aria-current=page]").innerText()).includes("Catalogue"), "la navigation dit où l'on est");
    await capture(page, "gestion-catalogue");
    await clic(page, page.locator("#q"));
    await tape(page, "cabine");
    await page.keyboard.press("Enter");
    await page.waitForURL(/q=cabine/);
    verifie(await page.locator(".cat-ligne").count() === 1, "la recherche trouve la valise cabine");
  });

  let stockAvant = 0;
  await etape("recevoir un arrivage", async () => {
    await fiche("Valise rigide ABS 4 roues");
    const premiere = page.locator(".var").first();
    stockAvant = Number((await premiere.locator(".var-tete").innerText()).match(/(\d+) en stock|Stock bas · (\d+)/)?.slice(1).find(Boolean) ?? 0);
    await capture(page, "gestion-produit", true);
    await clic(page, premiere.locator("input[name=quantite]"));
    await tape(page, "5");
    await clic(page, premiere.locator("input[name=commentaire]"));
    await tape(page, "Arrivage fournisseur");
    await envoie(premiere.getByRole("button", { name: "Valider" }));
    verifie((await ok()).includes(`Réception de 5 pièces enregistrée : ${stockAvant + 5} en stock`), `« ${await ok()} »`);
    verifie((await page.locator(".mvt").first().innerText()).includes("+5") && (await page.locator(".mvt").first().innerText()).includes("Arrivage fournisseur"),
      "le mouvement entre à l'historique, avec son commentaire");
  });

  await etape("inventaire et casse", async () => {
    const premiere = page.locator(".var").first();
    await clic(page, premiere.getByLabel("Casse"));
    await clic(page, premiere.locator("input[name=quantite]"));
    await tape(page, "999");
    await envoie(premiere.getByRole("button", { name: "Valider" }));
    verifie((await page.getByRole("alert").innerText()).includes("Il ne reste que"), "une casse plus grande que le stock est refusée");
    await clic(page, page.locator(".var").first().getByLabel("Inventaire"));
    await clic(page, page.locator(".var").first().locator("input[name=quantite]"));
    await tape(page, "4");
    await envoie(page.locator(".var").first().getByRole("button", { name: "Valider" }));
    verifie((await ok()).includes("Inventaire enregistré : 4 en stock"), "l'inventaire ramène le stock au compté");
  });

  await etape("changer un prix", async () => {
    const champ = page.locator(".var").first().locator("input[name=prix]");
    await champ.fill("");
    await clic(page, champ);
    await tape(page, "199,000");
    await envoie(page.locator(".var").first().getByRole("button", { name: "Enregistrer" }));
    verifie((await ok()).includes("199,000 TND"), "le nouveau prix est enregistré");
    verifie((await page.locator(".var").first().locator("input[name=prix]").inputValue()) === "199,000", "et affiché");
  });

  await etape("ajouter une couleur", async () => {
    const axes = page.locator("section:has(#t-ajouter) input[name^='axe.']");
    const n = await axes.count();
    verifie(n === 2, `un champ par axe du produit (taille, couleur) : ${n}`);
    for (let i = 0; i < n; i++) {
      const nom = await axes.nth(i).getAttribute("name");
      await clic(page, axes.nth(i));
      await tape(page, nom === "axe.couleur" ? "Vert sauge" : "Cabine 55 cm");
    }
    await envoie(page.getByRole("button", { name: "Ajouter la déclinaison" }));
    verifie((await ok()).includes("Déclinaison ajoutée"), `« ${await ok()} »`);
    verifie((await page.locator(".var", { hasText: "Vert sauge" }).innerText()).includes("Rupture"), "la nouvelle couleur arrive sans stock");
  });

  let nouveau = "";
  await etape("un produit neuf, puis en vitrine", async () => {
    await page.goto(`${C}/gestion/maymar/produits`, { waitUntil: "networkidle" });
    await clic(page, page.getByRole("link", { name: "Nouveau produit" }));
    await page.waitForURL(/produits\/nouveau$/);
    await clic(page, page.locator("#nom"));
    await tape(page, "Housse de protection");
    await page.locator("#categorie").selectOption({ label: "Valises" }).catch(() => {});
    await clic(page, page.locator("#prix"));
    await tape(page, "39");
    await clic(page, page.locator("#axe-nom-0"));
    await tape(page, "Taille");
    await clic(page, page.locator("#axe-val-0"));
    await tape(page, "S, M, L");
    await capture(page, "gestion-nouveau-produit");
    await clic(page, page.getByRole("button", { name: "Créer le produit" }));
    await page.waitForURL(/\/produits\/[0-9a-f-]{36}\?ok=/);
    nouveau = page.url();
    verifie((await ok()).includes("3 déclinaisons"), "créé en brouillon, avec ses trois tailles");
    verifie((await page.locator(".var-sku").allInnerTexts()).join(" ") === "HOUSSE-DE-PROTECTION-S HOUSSE-DE-PROTECTION-M HOUSSE-DE-PROTECTION-L",
      `références proposées : ${(await page.locator(".var-sku").allInnerTexts()).join(", ")}`);
    await clic(page, page.locator(".choix-carte", { hasText: "En vitrine" }));
    await envoie(page.getByRole("button", { name: "Enregistrer la fiche" }));
    verifie((await ok()).includes("en vitrine"), "puis mis en vitrine");
    verifie((await page.locator("h1").innerText()).includes("En vitrine"), "la fiche le montre");
  });

  /* ---------------- Les photos ---------------- */
  const vignettes = () => page.locator(".ph:not(.ph-ajout)");
  const photoDePhone = (texte, couleur) => page.evaluate(([t, c]) => {
    // Une « photo de téléphone » : 3 000 × 2 250, en JPEG.
    const canvas = document.createElement("canvas");
    canvas.width = 3000; canvas.height = 2250;
    const g = canvas.getContext("2d");
    const d = g.createLinearGradient(0, 0, 3000, 2250);
    d.addColorStop(0, c); d.addColorStop(1, "#1f1f23");
    g.fillStyle = d; g.fillRect(0, 0, 3000, 2250);
    g.fillStyle = "rgba(255,255,255,.85)"; g.font = "bold 260px sans-serif"; g.fillText(t, 220, 1250);
    return canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
  }, [texte, couleur]).then((b64) => Buffer.from(b64, "base64"));

  const cheminsRetires = [];
  await etape("des photos de téléphone, réduites avant l'envoi", async () => {
    verifie((await page.locator("#t-photos").locator("xpath=ancestor::section").innerText()).includes("photo à venir"),
      "sans photo, la fiche dit ce que montre la vitrine");
    const face = await photoDePhone("FACE", "#8a6f4d");
    const dos = await photoDePhone("DOS", "#3d5a6c");
    note("INFO  ", `deux photos de 3 000 × 2 250 px : ${Math.round(face.length / 1024)} Ko et ${Math.round(dos.length / 1024)} Ko`);
    await page.locator("#t-photos").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -96));
    await capture(page, "gestion-photos-vide");
    await Promise.all([
      page.waitForEvent("load", { timeout: 30000 }),
      page.locator(".depot-entree").setInputFiles([
        { name: "IMG_2041.jpg", mimeType: "image/jpeg", buffer: face },
        { name: "IMG_2042.jpg", mimeType: "image/jpeg", buffer: dos },
      ]),
    ]);
    await page.waitForLoadState("networkidle");
    verifie((await ok()).includes("2 photos ajoutées"), `« ${await ok()} »`);
    verifie(await vignettes().count() === 2, "deux vignettes");
    verifie((await vignettes().first().innerText()).includes("Principale"), "la première est la photo principale");
    const chemin = await cheminDe(vignettes().first());
    verifie(/^maymar\/produits\/[0-9a-f-]{36}\/[0-9a-f]{12}\.webp$/.test(chemin), `rangée dans le dossier de la boutique : ${chemin}`);
    const f = await fichierLocal(chemin);
    const [l, h] = f.status === 200 ? tailleWebp(f.octets) : [0, 0];
    verifie(f.status === 200 && f.type === "image/webp", `déposée, en WebP (${f.status}, ${f.type})`);
    verifie(l === 2000 && h === 1500 && f.octets.length < face.length / 3,
      `réduite dans le navigateur : ${l} × ${h}, ${Math.round(f.octets.length / 1024)} Ko au lieu de ${Math.round(face.length / 1024)}`);
    await page.evaluate(() => window.scrollBy(0, -96));
    await capture(page, "gestion-photos");
  });

  await etape("ranger les photos", async () => {
    const [a, b] = [await cheminDe(vignettes().nth(0)), await cheminDe(vignettes().nth(1))];
    await envoie(vignettes().first().getByRole("button", { name: /reculer d'un cran/ }));
    verifie((await ok()).includes("Ordre des photos enregistré"), `« ${await ok()} »`);
    verifie(await cheminDe(vignettes().nth(0)) === b && await cheminDe(vignettes().nth(1)) === a, "les deux photos ont changé de place");
    await clic(page, vignettes().nth(1).locator(".ph-image"));
    const feuille = page.locator(".ph-feuille:popover-open");
    await feuille.waitFor();
    verifie((await feuille.locator("h3").innerText()).includes("Photo 2 sur 2"), "une photo touchée ouvre sa feuille");
    await envoie(feuille.getByRole("button", { name: "Mettre en premier" }));
    verifie((await ok()).includes("Photo mise en premier"), `« ${await ok()} »`);
    verifie(await cheminDe(vignettes().nth(0)) === a, "la face revient en première");
  });

  await etape("légender une photo, l'attitrer à une taille", async () => {
    await clic(page, vignettes().nth(1).locator(".ph-image"));
    const feuille = page.locator(".ph-feuille:popover-open");
    await feuille.waitFor();
    await clic(page, feuille.locator("input[name=alt]"));
    await tape(page, "Housse, vue de dos");
    await feuille.locator("select[name=variante_id]").selectOption({ label: "M" });
    await capture(page, "gestion-photo-feuille");
    await envoie(feuille.getByRole("button", { name: "Enregistrer" }));
    verifie((await ok()).includes("Photo enregistrée"), `« ${await ok()} »`);
    verifie((await vignettes().nth(1).locator(".ph-var").innerText()) === "M", "la vignette dit pour quelle taille elle est montrée");
    verifie((await vignettes().nth(1).locator("img").first().getAttribute("alt")) === "Housse, vue de dos", "avec sa légende");
  });

  await etape("les photos sur téléphone", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#t-photos").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -72));
    await capture(page, "gestion-photos-telephone");
    await clic(page, vignettes().first().locator(".ph-image"));
    const feuille = page.locator(".ph-feuille:popover-open");
    await feuille.waitFor();
    const boite = await feuille.boundingBox();
    verifie(boite && boite.width <= 390 && boite.y + boite.height <= 845, `la feuille tient dans l'écran (${Math.round(boite?.width ?? 0)} × ${Math.round(boite?.height ?? 0)})`);
    await capture(page, "gestion-photo-feuille-telephone");
    await page.keyboard.press("Escape");
    verifie(await page.locator(".ph-feuille:popover-open").count() === 0, "Échap la referme");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await etape("un fichier qui n'est pas une photo", async () => {
    await Promise.all([
      page.waitForEvent("load", { timeout: 30000 }),
      page.locator(".depot-entree").setInputFiles([{ name: "facture.jpg", mimeType: "image/jpeg", buffer: Buffer.from("Ceci n'est pas une photo.") }]),
    ]);
    await page.waitForLoadState("networkidle");
    verifie((await page.getByRole("alert").innerText()).includes("n'est pas une photo JPEG, PNG ou WebP"), "refusé, d'après son contenu (pas son nom)");
    verifie(await vignettes().count() === 2, "rien n'est ajouté");
  });

  await etape("retirer une photo", async () => {
    const chemin = await cheminDe(vignettes().nth(1));
    await clic(page, vignettes().nth(1).locator(".ph-image"));
    const feuille = page.locator(".ph-feuille:popover-open");
    await feuille.waitFor();
    await envoie(feuille.getByRole("button", { name: "Retirer la photo" }));
    verifie((await ok()).includes("Photo retirée"), `« ${await ok()} »`);
    verifie(await vignettes().count() === 1, "il en reste une");
    verifie((await fichierLocal(chemin)).status === 404, "le fichier a quitté le dépôt");
    cheminsRetires.push(chemin);
  });

  await etape("la vitrine montre la photo", async () => {
    const chemin = await cheminDe(vignettes().first());
    const vitrine = await ctx.newPage();
    await vitrine.goto(`${t.adresse("maymar.localhost")}/produit/housse-de-protection`, { waitUntil: "networkidle" });
    const srcs = await vitrine.locator("main img").evaluateAll((imgs) => imgs.map((i) => i.getAttribute("src") ?? ""));
    verifie(srcs.some((s) => decodeURIComponent(s).includes(chemin)), "la fiche de la vitrine affiche la photo déposée");
    await vitrine.close();
  });

  await etape("deux écrans sur la même fiche : pas d'écrasement", async () => {
    const autre = await navigateur.newContext({ viewport: { width: 1280, height: 860 }, locale: "fr-FR" });
    await autre.addCookies(await ctx.cookies());
    const p2 = await autre.newPage();
    await p2.goto(nouveau.split("?")[0], { waitUntil: "networkidle" });
    await page.goto(nouveau.split("?")[0], { waitUntil: "networkidle" });
    await page.locator("#marque").fill("Maymar");
    await clic(page, page.getByRole("button", { name: "Enregistrer la fiche" }));
    await page.waitForURL(/ok=/);
    await p2.locator("#nom").fill("Housse (écrasée)");
    await p2.getByRole("button", { name: "Enregistrer la fiche" }).click();
    await p2.waitForURL(/erreur=/);
    verifie((await p2.getByRole("alert").innerText()).includes("modifiée entre-temps"), "l'écran resté ouvert est prévenu, rien n'est écrasé");
    await autre.close();
  });

  /* ---------------- Les réglages ---------------- */
  const section = (id) => page.locator(`section:has(#t-${id})`);
  const journal = () => page.locator("section:has(#t-journal)").innerText();

  await etape("les réglages : ce qui s'applique à la boutique", async () => {
    await clic(page, page.locator(".app-cote").getByRole("link", { name: "Réglages" }));
    await page.waitForURL(/\/gestion\/maymar\/reglages$/);
    await page.waitForLoadState("networkidle");
    for (const id of ["commandes", "livraison", "zones", "gouvernorats", "paiement", "vitrine", "journal"]) {
      verifie(await page.locator(`#t-${id}`).count() === 1, `la section « ${await page.locator(`#t-${id}`).innerText().catch(() => id)} »`);
    }
    verifie(await section("commandes").getByLabel("Compte obligatoire").isChecked(), "au départ : compte obligatoire");
    verifie((await section("zones").innerText()).includes("Non appliquées"), "les zones de Maymar existent, mais le tarif est le même partout");
    verifie((await section("commandes").innerText()).includes("MAY-"), "le préfixe des numéros est affiché, réglé par SkanEcom");
    await capture(page, "gestion-reglages", true);
  });

  await etape("ouvrir aux invités, confirmer d'office", async () => {
    await clic(page, section("commandes").getByText("Commande en invité"));
    await clic(page, section("commandes").getByText("Confirmée d'office"));
    await envoie(section("commandes").getByRole("button", { name: "Enregistrer" }));
    verifie((await ok()).includes("Réglages enregistrés"), `« ${await ok()} »`);
    verifie(await section("commandes").getByLabel("Commande en invité").isChecked(), "le choix est gardé");
    const j = await journal();
    verifie(j.includes("Compte client : obligatoire → invité possible") && j.includes("Confirmation : par téléphone → automatique"),
      "le journal dit ce qui a changé, et qui l'a fait");
    verifie(j.includes("gerant@maymar.test"), "avec son auteur");
  });

  await etape("les frais par zone, et une zone de plus", async () => {
    verifie(await fraisPour("sfax") === 7000, `avant : Sfax paie le tarif fixe (${await fraisPour("sfax")})`);
    await clic(page, section("livraison").getByText("Tarif par zone"));
    await section("livraison").locator("#seuil").fill("300");
    await envoie(section("livraison").getByRole("button", { name: "Enregistrer" }));
    verifie((await ok()).includes("Réglages enregistrés"), `« ${await ok()} »`);
    verifie((await section("zones").innerText()).includes("Appliquées"), "les zones s'appliquent");
    verifie(await fraisPour("sfax") === 10000, `Sfax paie le tarif de la zone « Centre et Sud » (${await fraisPour("sfax")})`);
    verifie(await fraisPour("tunis", 320000) === 0, "la livraison est offerte dès 300 TND");

    await clic(page, page.locator("#zn-neuve"));
    await tape(page, "Grand Sud");
    await clic(page, page.locator("#zf-neuve"));
    await tape(page, "12,500");
    await page.locator(".rg-zone-ajout input[name=delai_min]").fill("3");
    await page.locator(".rg-zone-ajout input[name=delai_max]").fill("6");
    await envoie(page.getByRole("button", { name: "Ajouter la zone" }));
    verifie((await ok()).includes("Zone « Grand Sud » ajoutée"), `« ${await ok()} »`);
    await page.locator("#g-tataouine").selectOption({ label: "Grand Sud" });
    await page.locator("#g-kebili").selectOption({ label: "Grand Sud" });
    await envoie(page.getByRole("button", { name: "Enregistrer les gouvernorats" }));
    verifie((await ok()).includes("2 gouvernorats rattachés"), `« ${await ok()} »`);
    verifie(await fraisPour("tataouine") === 12500, `Tataouine paie 12,500 (${await fraisPour("tataouine")})`);
    await pause(800); // (la page défile en douceur jusqu'à la section)
    await capture(page, "gestion-reglages-zones");
  });

  await etape("supprimer une zone : retour au tarif fixe", async () => {
    await envoie(page.getByRole("button", { name: "Supprimer la zone Grand Sud" }));
    verifie((await ok()).includes("2 gouvernorats au tarif fixe"), `« ${await ok()} »`);
    verifie(await fraisPour("tataouine") === 7000, "Tataouine retombe sur le tarif fixe, jamais sur zéro");
    verifie((await section("gouvernorats").innerText()).includes("2 au tarif fixe"), "l'écran le signale");
  });

  await etape("un moyen de paiement qu'on ne coupe pas, un WhatsApp", async () => {
    await clic(page, section("paiement").getByText("Paiement à la livraison"));
    await envoie(section("paiement").getByRole("button", { name: "Enregistrer" }));
    verifie((await page.getByRole("alert").innerText()).includes("au moins un moyen de paiement"), "le seul moyen de paiement ne se coupe pas");
    verifie(await section("paiement").getByLabel("Paiement à la livraison").isChecked(), "il reste coché");
    verifie((await section("paiement").innerText()).includes("Bientôt"), "Konnect : prévu, à activer par SkanEcom");
    await section("vitrine").locator("#whatsapp").fill("20 123 456");
    await envoie(section("vitrine").getByRole("button", { name: "Enregistrer" }));
    verifie(await section("vitrine").locator("#whatsapp").inputValue() === "21620123456", "le numéro est mis au format international");
  });

  await etape("les réglages sur téléphone", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${C}/gestion/maymar/reglages#t-zones`, { waitUntil: "networkidle" });
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    verifie(!deborde, "rien ne déborde en largeur");
    await pause(800);
    await capture(page, "gestion-reglages-telephone");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await etape("remettre Maymar comme au départ", async () => {
    await page.goto(`${C}/gestion/maymar/reglages`, { waitUntil: "networkidle" });
    await clic(page, section("commandes").getByText("Compte obligatoire"));
    await clic(page, section("commandes").getByText("Confirmée par téléphone"));
    await envoie(section("commandes").getByRole("button", { name: "Enregistrer" }));
    await clic(page, section("livraison").getByText("Même tarif partout"));
    await section("livraison").locator("#seuil").fill("");
    await envoie(section("livraison").getByRole("button", { name: "Enregistrer" }));
    verifie(await fraisPour("sfax") === 7000 && await fraisPour("tunis", 320000) === 7000, "de nouveau le même tarif partout, jamais offert");
  });

  await etape("les informations légales, jusqu'aux pages de la vitrine", async () => {
    const legal = section("legal");
    verifie((await legal.innerText()).includes("À compléter avant d'ouvrir"), "ce qui manque est signalé");
    await legal.locator("#retractation").fill("5");
    const avant = page.url();
    await clic(page, legal.getByRole("button", { name: "Enregistrer" }));
    await pause(500);
    verifie(await legal.locator("#retractation").evaluate((e) => e.validity.rangeUnderflow) && page.url() === avant,
      "moins de 10 jours de rétractation : le formulaire ne part pas (et la base refuserait : 17_legal.sql)");
    await section("legal").locator("#raison_sociale").fill("Maymar SARL");
    await section("legal").locator("#adresse_legale").fill("Avenue Habib Bourguiba, 1000 Tunis");
    await section("legal").locator("#email_legal").fill("contact@maymar.test");
    await section("legal").locator("#retractation").fill("14");
    await section("legal").locator("#retour_frais").selectOption("boutique");
    await envoie(section("legal").getByRole("button", { name: "Enregistrer" }));
    verifie((await ok()).includes("Réglages enregistrés"), `« ${await ok()} »`);
    verifie((await section("legal").innerText()).includes("identifiant RNE, matricule fiscal"), "il reste l'identifiant RNE et le matricule fiscal");
    const vitrine = await ctx.newPage();
    await vitrine.goto(`${t.adresse("maymar.localhost")}/mentions-legales`, { waitUntil: "networkidle" });
    const mentions = await vitrine.locator("main").innerText();
    verifie(mentions.includes("Maymar SARL") && mentions.includes("Avenue Habib Bourguiba"), "les mentions légales de la vitrine les reprennent");
    await vitrine.goto(`${t.adresse("maymar.localhost")}/conditions-de-vente`, { waitUntil: "networkidle" });
    const cgv = await vitrine.locator("main").innerText();
    verifie(cgv.includes("14 jours ouvrables") && cgv.includes("pris en charge par la boutique") && cgv.includes("contact@maymar.test"),
      "les conditions de vente aussi : 14 jours, retour offert, le courriel");
    await vitrine.close();
  });

  await etape("les données de la boutique, dans un tableur", async () => {
    await page.goto(`${C}/gestion/maymar/reglages#t-donnees`, { waitUntil: "networkidle" });
    const donnees = page.locator("section:has(#t-donnees)");
    verifie(await donnees.getByRole("link", { name: /Télécharger/ }).count() === 5, "cinq exports : commandes, articles, clients, catalogue, stock");
    const [telechargement] = await Promise.all([
      page.waitForEvent("download"),
      clic(page, donnees.locator(".rg-export", { hasText: "Commandes" }).first().getByRole("link")),
    ]);
    verifie(/^maymar-commandes-\d{4}-\d{2}-\d{2}\.csv$/.test(telechargement.suggestedFilename()), `un fichier nommé ${telechargement.suggestedFilename()}`);
    const { readFile } = await import("node:fs/promises");
    const texte = await readFile(await telechargement.path(), "utf8");
    const lignes = texte.replace(/^﻿/, "").trim().split("\r\n");
    verifie(texte.startsWith("﻿") && lignes[0].startsWith("Numéro;Date;Statut;"), "UTF-8 avec BOM, point-virgule : Excel l'ouvre tel quel, accents compris");
    verifie(lignes.length === 12 && lignes.slice(1).every((l) => l.startsWith("MAY-")), `les onze commandes de Maymar, une par ligne (${lignes.length - 1})`);
    verifie(/;\d+,\d{3};/.test(lignes[1]), "les montants en « 189,000 »");
    await capture(page, "gestion-donnees");
  });

  /* ---------------- Les clients ---------------- */
  await etape("les clients : qui soigner, de qui se méfier", async () => {
    await clic(page, page.locator(".app-cote").getByRole("link", { name: "Clients" }));
    await page.waitForURL(/\/gestion\/maymar\/clients$/);
    await page.waitForLoadState("networkidle");
    const n = await page.locator(".cat-ligne").count();
    verifie(n >= 5, `les clients de Maymar, ceux qui ont commandé récemment d'abord (${n})`);
    const refus = Number((await page.locator(".onglets a", { hasText: "Avec refus" }).innerText()).match(/\d+/)?.[0] ?? 0);
    await page.goto(`${C}/gestion/maymar/clients?filtre=refus`, { waitUntil: "networkidle" });
    const lignes = await page.locator(".cat-ligne").count();
    verifie(refus >= 1 && lignes === refus && (await page.locator(".cl-liste").innerText()).includes("refus"),
      `l'onglet « Avec refus » : ${refus} client(s), dont celui du colis refusé tout à l'heure, chacun avec son compte de refus`);
    await capture(page, "gestion-clients");
  });

  let ficheClient = "";
  await etape("depuis une commande, la fiche du client", async () => {
    await ouvre(page, 6);
    await clic(page, page.getByRole("link", { name: /Voir sa fiche/ }));
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
    ficheClient = page.url();
    verifie(true, "le lien par numéro mène à la fiche (adresse canonique)");
    verifie((await page.locator(".chiffre-cle", { hasText: "Refus" }).innerText()).includes("1"), "un refus, compté par la base");
    verifie((await page.locator(".cl-commande", { hasText: num(6) }).innerText()).includes("Refusée"), "la commande refusée est dans son historique");
    await capture(page, "gestion-client", true);
  });

  await etape("bloquer un client, motif à l'appui", async () => {
    const confiance = page.locator("section:has(#t-confiance)");
    await clic(page, confiance.getByText("Bloqué", { exact: true }));
    await envoie(confiance.getByRole("button", { name: "Enregistrer" }));
    verifie((await page.getByRole("alert").innerText()).includes("Dites pourquoi"), "sans motif, pas de blocage");
    await clic(page, page.locator("section:has(#t-confiance)").getByText("Bloqué", { exact: true }));
    await clic(page, page.locator("#motif"));
    await tape(page, "Colis refusé à la porte, ne répond plus");
    await envoie(page.locator("section:has(#t-confiance)").getByRole("button", { name: "Enregistrer" }));
    verifie((await ok()).includes("Client bloqué"), `« ${await ok()} »`);
    verifie((await page.locator("h1").innerText()).includes("Bloqué"), "la fiche le dit en tête");
    verifie((await page.locator("section:has(#t-journal)").innerText()).includes("Colis refusé à la porte"), "le motif reste au journal");
    await page.goto(`${C}/gestion/maymar/clients?filtre=bloques`, { waitUntil: "networkidle" });
    verifie(await page.locator(".cat-ligne").count() === 1, "il est dans l'onglet des bloqués");
  });

  await etape("la note de l'équipe, puis rétablir", async () => {
    await page.goto(ficheClient, { waitUntil: "networkidle" });
    await clic(page, page.locator("#note"));
    await tape(page, "Rappeler avant toute nouvelle commande");
    await envoie(page.getByRole("button", { name: "Enregistrer la note" }));
    verifie((await page.locator("#note").inputValue()) === "Rappeler avant toute nouvelle commande", "la note est gardée");
    await clic(page, page.locator("section:has(#t-confiance)").getByText("Normal", { exact: true }));
    await envoie(page.locator("section:has(#t-confiance)").getByRole("button", { name: "Enregistrer" }));
    verifie(!(await page.locator("h1").innerText()).includes("Bloqué"), "rétabli, sans motif à donner");
  });

  /* ---------------- L'équipe (B7) ---------------- */
  const vendeur = `vendeur-${Date.now().toString(36)}@maymar.test`;
  let lienVendeur = "";
  await etape("le propriétaire invite un employé, sans passer par SkanEcom", async () => {
    await page.goto(`${C}/gestion/maymar`, { waitUntil: "networkidle" });
    await clic(page, page.locator(".app-cote").getByRole("link", { name: "Équipe" }));
    await page.waitForURL(/\/gestion\/maymar\/equipe$/);
    await page.waitForLoadState("networkidle");
    verifie((await page.locator(".membre", { hasText: "gerant@maymar.test" }).innerText()).includes("Vous"), "le propriétaire se voit dans son équipe");
    verifie(await page.locator(".membre", { hasText: "gerant@maymar.test" }).getByRole("button", { name: "Retirer l'accès" }).count() === 0,
      "il ne peut pas se retirer lui-même l'accès");
    await clic(page, page.locator("#email"));
    await tape(page, vendeur);
    await clic(page, page.locator(".role-choix", { hasText: "Préparation" }));
    await envoie(page.getByRole("button", { name: "Inviter" }));
    verifie((await ok()).includes("est invité (Préparation)"), `« ${await ok()} »`);
    lienVendeur = (await page.locator("#lien-acces").inputValue()).trim();
    verifie(new URL(lienVendeur).pathname === "/bienvenue" && (new URL(lienVendeur).searchParams.get("jeton") ?? "").length > 40,
      "un lien d'invitation, à transmettre par WhatsApp");
    verifie((await page.locator(".membre", { hasText: vendeur }).innerText()).includes("Invitation en attente"), "l'employé est en attente");
    await capture(page, "gestion-equipe");
  });

  await etape("l'employé ouvre son lien et arrive dans le backoffice", async () => {
    const tel = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
    const p = await tel.newPage();
    t.espion(p, "vendeur", attendue);
    await p.goto(lienVendeur, { waitUntil: "networkidle" });
    await p.locator("#mot_de_passe").fill("le colis part demain");
    await p.locator("#confirmation").fill("le colis part demain");
    await p.getByRole("button", { name: "Enregistrer et entrer" }).tap();
    await p.waitForURL(/\/gestion\/maymar$/, { timeout: 15000 });
    verifie(true, "son mot de passe choisi, il entre dans le backoffice de Maymar");
    await p.goto(`${C}/gestion/maymar/equipe`, { waitUntil: "networkidle" });
    verifie(/\/gestion\/maymar$/.test(p.url()), "la page de l'équipe n'est pas pour la préparation");
    await tel.close();
    await page.reload({ waitUntil: "networkidle" });
    verifie((await page.locator(".membre", { hasText: vendeur }).innerText()).includes("Actif"), "chez le propriétaire, l'invitation est acceptée");
    verifie(await page.locator("#lien-acces").count() === 0, "le lien qui a servi n'est plus affiché");
  });

  await etape("changer son rôle, puis lui retirer l'accès", async () => {
    await page.locator(".membre", { hasText: vendeur }).locator("select[name=role]").selectOption("confirmateur");
    await envoie(page.locator(".membre", { hasText: vendeur }).getByRole("button", { name: "Changer" }));
    verifie((await ok()).includes("passe en « Confirmation »"), `« ${await ok()} »`);
    await envoie(page.locator(".membre", { hasText: vendeur }).getByRole("button", { name: "Retirer l'accès" }));
    verifie((await ok()).includes("n'a plus accès"), `« ${await ok()} »`);
    await page.locator(".membre", { hasText: "gerant@maymar.test" }).locator("select[name=role]").selectOption("admin");
    await envoie(page.locator(".membre", { hasText: "gerant@maymar.test" }).getByRole("button", { name: "Changer" }));
    verifie((await page.getByRole("alert").innerText()).includes("au moins un propriétaire actif"), "le seul propriétaire ne se rétrograde pas");
  });

  await etape("la fiche client sur téléphone", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ficheClient, { waitUntil: "networkidle" });
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    verifie(!deborde, "rien ne déborde en largeur");
    await capture(page, "gestion-client-telephone");
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 3. L'employé des appels, sur téléphone ==");
{
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR",
  });
  const page = await ctx.newPage();
  t.espion(page, "appels-telephone", attendue);

  await etape("la liste au doigt, l'appel en un geste", async () => {
    await connexion(page, "appels@maymar.test", true);
    await page.waitForURL(/\/gestion\/maymar$/, { timeout: 15000 });
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    verifie(!deborde, "pas de défilement horizontal");
    const appel = await page.locator(".bo-ligne", { hasText: num(9) }).locator(".bo-appel").getAttribute("href");
    verifie(appel === "tel:+21622487190", `le bouton d'appel compose le numéro (${appel})`);
    await capture(page, "gestion-telephone-liste");
  });

  await etape("« à rappeler », depuis la fiche", async () => {
    await page.locator(".bo-ligne-lien", { hasText: num(9) }).tap();
    await page.waitForURL(new RegExp(`commandes/${num(9)}$`));
    await capture(page, "gestion-telephone-fiche");
    await page.locator("#note-appel").tap();
    await tape(page, "Rappeler à 18 h");
    await page.getByRole("button", { name: "À rappeler" }).tap();
    await page.waitForURL(/fait=appel-rappeler/);
    verifie((await message(page)).includes("à rappeler"), "noté : à rappeler");
    await capture(page, "gestion-telephone-rappeler");
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 4. Le préparateur d'une autre boutique ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 860 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "prepa", attendue);

  await etape("sa boutique, et ce que son rôle permet", async () => {
    await connexion(page, "prepa@quincaillerie.test");
    await page.waitForURL(/\/gestion\/quincaillerie-demo$/, { timeout: 15000 });
    verifie(true, "le préparateur entre dans le backoffice de la quincaillerie");
    const premiere = page.locator(".bo-ligne-lien").first();
    if (await premiere.count()) {
      await clic(page, premiere);
      await page.waitForURL(/commandes\//);
      verifie(await page.getByRole("button", { name: /Confirmée/ }).count() === 0, "à confirmer : le préparateur ne voit pas les boutons de confirmation");
      verifie((await page.locator(".bo-action").innerText()).includes("revient"), "la fiche dit à qui revient la confirmation");
    } else {
      verifie((await page.locator(".bo-vide").innerText()).includes("Aucune commande"), "aucune commande : la liste le dit");
    }
    await capture(page, "gestion-preparateur");
  });

  await etape("au catalogue : il tient le stock, pas les fiches", async () => {
    await page.goto(`${C}/gestion/quincaillerie-demo/produits`, { waitUntil: "networkidle" });
    verifie(await page.getByRole("link", { name: "Nouveau produit" }).count() === 0, "pas de bouton « Nouveau produit »");
    await clic(page, page.locator(".cat-ligne-lien").first());
    await page.waitForURL(/\/produits\/[0-9a-f-]{36}/);
    await page.waitForLoadState("networkidle");
    verifie(await page.locator(".var-stock").count() > 0 && await page.locator(".var-prix").count() === 0,
      "les mouvements de stock, sans les prix");
    verifie(await page.getByRole("button", { name: "Enregistrer la fiche" }).count() === 0, "la fiche en lecture seule");
    verifie(await page.locator(".depot, .ph-barre, .ph-feuille").count() === 0, "ni dépôt ni rangement des photos");
    const photo = await posteBrut(ctx, `${new URL(page.url()).pathname}/photos`, { action: "retirer", image_id: "00000000-0000-0000-0000-000000000000" });
    verifie(photo.status === 303 && decodeURIComponent(photo.location.replace(/\+/g, " ")).includes("rôle"),
      `retirer une photo à la main : refusé aussi (${photo.status})`);
    const fiche = await posteBrut(ctx, `${new URL(page.url()).pathname}/action`, { action: "fiche", nom: "Pirate", version: "" });
    verifie(fiche.status === 303 && decodeURIComponent(fiche.location.replace(/\+/g, " ")).includes("rôle"),
      `même en postant le formulaire à la main, la base refuse (${fiche.status})`);
  });

  await etape("les réglages, en lecture seule", async () => {
    await page.goto(`${C}/gestion/quincaillerie-demo/reglages`, { waitUntil: "networkidle" });
    verifie((await page.locator("main").innerText()).includes("Lecture seule"), "l'écran le dit");
    verifie(await page.getByRole("button", { name: /^Enregistrer/ }).count() === 0, "aucun bouton « Enregistrer »");
    verifie(await page.locator("fieldset:disabled").count() >= 4, "les champs sont grisés");
    const r = await posteBrut(ctx, "/gestion/quincaillerie-demo/reglages/enregistrer", { section: "commandes", "compte.obligatoire": "0" });
    verifie(r.status === 303 && decodeURIComponent(r.location.replace(/\+/g, " ")).includes("propriétaire"),
      `même en postant le formulaire à la main, la base refuse (${r.status})`);
  });

  await etape("l'export des données, pas pour lui", async () => {
    await page.goto(`${C}/gestion/quincaillerie-demo/reglages`, { waitUntil: "networkidle" });
    verifie(await page.locator("#t-donnees").count() === 0, "pas de section « Vos données »");
    await page.goto(`${C}/gestion/quincaillerie-demo/export/clients`, { waitUntil: "networkidle" });
    verifie(decodeURIComponent(page.url().replace(/\+/g, " ")).includes("Seuls le propriétaire et l'administrateur exportent"),
      "l'adresse de l'export, tapée à la main : la base refuse");
  });

  await etape("les clients : il voit, il ne juge pas", async () => {
    await page.goto(`${C}/gestion/quincaillerie-demo/clients`, { waitUntil: "networkidle" });
    verifie((await page.locator("h1").innerText()).includes("Clients"), "la liste des clients s'ouvre");
    const premier = page.locator(".cl-ligne-lien").first();
    if (await premier.count()) {
      await clic(page, premier);
      await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
      await page.waitForLoadState("networkidle");
      verifie(await page.locator("input[name=niveau]").count() === 0 && await page.locator("#note").count() === 0,
        "la fiche, sans le réglage de confiance ni la note");
      const id = new URL(page.url()).pathname.split("/").pop();
      const r = await posteBrut(ctx, `/gestion/quincaillerie-demo/clients/${id}/action`, { action: "confiance", niveau: "bloque", motif: "Essai" });
      verifie(r.status === 303 && decodeURIComponent(r.location.replace(/\+/g, " ")).includes("relation client"),
        `bloquer à la main : la base refuse (${r.status})`);
    } else {
      verifie((await page.locator(".vide").innerText()).includes("Personne"), "aucun client : la liste le dit");
    }
  });
  await ctx.close();
}

await navigateur.close();
await pause(10);
process.exit(t.bilan());
