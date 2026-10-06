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
      au catalogue, le stock mais pas les fiches ni les photos ; une commande
      à retirer au magasin, prête puis retirée ; les réglages en lecture
      seule.
   6. La gérante de Dar Alia règle l'apparence de sa vitrine : la vraie
      vitrine dans le cadre suit chaque geste (souris, clavier), le brouillon
      s'enregistre seul, défaire et refaire, une autre structure, le lien
      d'aperçu ouvert hors du backoffice, publier ; puis au téléphone.
   7. Le gérant de Maymar connecte son SkanFact (module skanfact) : une
      clé refusée, la bonne gardée chiffrée ; une commande livrée devient
      une facture dans son SkanFact ; SkanFact en panne, elle se renvoie.
   8. Une commande reçue sur WhatsApp, saisie par le gérant (le client
      retrouvé par son numéro, son adresse reprise, les articles au
      clavier, une remise, la livraison offerte) ; une vente au comptoir,
      remise et payée d'un geste ; le tableau de bord dit d'où viennent les
      commandes ; puis une commande Instagram saisie au téléphone par
      l'employé des appels, à confirmer.
   9. Les gestes groupés : le gérant remet tous les colis « À préparer »
      au livreur d'un geste (à la souris et au clavier), puis fait le
      point du livreur : livrés, payés, sauf celui qui revient refusé.
  10. Le paiement en ligne de Maymar (module paiement_en_ligne, Konnect
      simulé par le relais) : le gérant branche son compte (une clé
      refusée, puis la bonne), l'allume ; un acheteur au téléphone voit sa
      carte refusée, renonce, réessaie avec une autre, paie ; la fiche dit
      « Payée en ligne », le bordereau « Rien à encaisser » ; puis le
      compte se retire.

     cd application && bun run parcours:gestion
     (base fraîche avec le jeu de démo : les onze commandes de Maymar ; API
     locale, qui crée les comptes de l'équipe ; vitrine lancée ; clés dans
     .outils/api-locale.env)
   ========================================================================== */

const t = creeTesteur();
const { pause, note, verifie, capture, clic, tape, etape } = t;
const C = t.adresse("console.localhost");
const MDP = "equipe-locale-skanecom";
const FICHIERS = process.env.NEXT_PUBLIC_FICHIERS_URL ?? `${process.env.RELAIS ?? "http://127.0.0.1:54321"}/fichiers`;
const annee = new Date().getFullYear();
const num = (n) => `MAY-${annee}-${String(n).padStart(5, "0")}`;
// Les 404 voulues : le backoffice d'une autre boutique, un écran coupé, une adresse inconnue.
const attendue = (url) => /\/gestion\/(maison-selma|maymar\/(reassort|une-adresse-inconnue))/.test(url);
await sansDoubleAuthentification("gerant@maymar.test");
await sansDoubleAuthentification("gerant@quincaillerie.test");
await sansDoubleAuthentification("gerant@selma.test");
await sansDoubleAuthentification("gerant@dar-alia.test");
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

/** Après le code : le backoffice — ou « Mon compte » d'abord, quand la double
 *  authentification vient d'être activée (noter ses codes de secours) ; on
 *  revient alors au backoffice. */
async function entre(p, slug) {
  await p.waitForURL(new RegExp(`/gestion/${slug}(/compte)?([?#]|$)`), { timeout: 15000 });
  if (new URL(p.url()).pathname.endsWith("/compte")) await p.goto(`${C}/gestion/${slug}`, { waitUntil: "networkidle" });
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

/* Une page lue à la main, avec la session du contexte, hors de la page (l'espion ne la voit pas) : son code HTTP. */
async function litBrut(contexte, chemin) {
  const { request } = await import("node:http");
  const cookies = (await contexte.cookies(C)).map((c) => `${c.name}=${c.value}`).join("; ");
  return new Promise((ok, ko) => {
    const req = request({ host: "127.0.0.1", port: Number(t.port), method: "GET", path: chemin, headers: { host: new URL(C).host, cookie: cookies } },
      (r) => { r.resume(); r.on("end", () => ok(r.statusCode)); });
    req.on("error", ko);
    req.end();
  });
}

/* Les frais de livraison qu'annonce la base à un acheteur (API publique). */
async function fraisPour(gouvernorat, sousTotal = 1000, poids = null) {
  const r = await fetch("http://127.0.0.1:54321/rest/v1/rpc/frais_livraison_millimes", {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({ p_boutique_id: "00000000-0000-4000-8000-000000000001", p_gouvernorat_code: gouvernorat, p_sous_total_millimes: sousTotal, p_poids_grammes: poids }),
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
/* Ce qu'une personne attend de voir à l'écran, dans un délai. */
const attend = async (fn, ms = 8000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await fn().catch(() => false)) return true; await pause(150); } return false; };

/* ------------------------------------------------------------------ */
// SECTIONS=6, ou SECTIONS=4bis,6 : ces sections seules, pendant le
// développement (la séquence de la CI les passe toutes).
const SECTIONS = (process.env.SECTIONS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
function section(n) { return SECTIONS.length === 0 || SECTIONS.includes(n); }

console.log("\n== 1. L'employé des appels, grand écran ==");
if (section("1")) {
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "appels", attendue);

  await etape("connexion sans double authentification", async () => {
    await connexion(page, "appels@maymar.test");
    await entre(page, "maymar");
    verifie(true, "l'employé des appels entre directement dans le backoffice de Maymar");
    verifie((await page.locator(".app-cote .app-compte-role").innerText()).includes("Confirmation"), "son rôle est affiché");
    verifie(await page.locator(".app-cote").getByRole("link", { name: "Tableau de bord" }).count() === 0,
      "le chiffre d'affaires ne le regarde pas : pas de tableau de bord");
    verifie(await page.locator(".app-cote").getByRole("link", { name: "Encaissements" }).count() === 0, "ni les encaissements");
    await page.goto(`${C}/gestion/maymar/encaissements`, { waitUntil: "networkidle" });
    verifie(/\/gestion\/maymar$/.test(new URL(page.url()).pathname), "même par l'adresse : retour aux commandes");
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
    // Le gérant appelle (le lien tel: ouvre le téléphone), puis revient sur la fiche.
    await page.evaluate(() => {
      window.addEventListener("click", (e) => { if (e.target.closest('a[href^="tel:"]')) e.preventDefault(); }, { capture: true, once: true });
      document.querySelector('a[href^="tel:"]').click();
      window.dispatchEvent(new Event("focus"));
    });
    await page.locator("#resultat-appel[data-retour-appel]").waitFor({ timeout: 3000 });
    verifie((await page.locator("#resultat-appel .bo-retour-appel").innerText()).includes("Comment s'est passé l'appel"),
      "au retour de l'appel, la fiche demande comment il s'est passé");
    verifie((await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Confirmée", "le focus attend sur « Confirmée »");
    await t.envoie(page, page.getByRole("button", { name: "Injoignable" }));
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
    await t.envoie(page, page.getByRole("button", { name: /Confirmée/ }));
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
    verifie((await page.locator("h1").innerText()) === "Page introuvable", "la page introuvable de la console, en français (pas celle du framework)");
  });

  await etape("un écran coupé, une adresse inconnue : en français, dans le backoffice", async () => {
    // Maymar n'a pas « Prévenir du retour » : l'écran Réassort dit quoi allumer, et où.
    const r = await page.goto(`${C}/gestion/maymar/reassort`, { waitUntil: "networkidle" });
    verifie(r.status() === 404 && (await page.locator("main h1").innerText()) === "Réassort : fonction coupée",
      `Réassort sans sa fonction : « ${await page.locator("main h1").innerText()} » (HTTP ${r.status()})`);
    const allumer = page.locator(".introuvable-bo a", { hasText: "Fonctions de la vitrine" });
    verifie((await allumer.getAttribute("href")) === "/gestion/maymar/reglages/vitrine", "le lien mène au réglage qui l'allume");
    verifie((await page.locator(".coquille-nav, nav").count()) > 0, "la coquille reste : le menu est là");
    await page.goto(`${C}/gestion/maymar/une-adresse-inconnue`, { waitUntil: "networkidle" });
    verifie((await page.locator("main h1").innerText()) === "Cet écran n'existe pas ici", "une adresse inconnue : la même page, dans le backoffice");
    await clic(page, page.getByRole("link", { name: "Revenir à Aujourd'hui" }));
    await page.waitForURL(/\/gestion\/maymar\/aujourdhui/);
    verifie(true, "« Revenir à Aujourd'hui » y ramène");
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
    await t.envoie(autre, autre.getByRole("button", { name: /Confirmée/ }));
    await autre.waitForURL(/fait=appel-confirmee/);
    await t.envoie(page, page.getByRole("button", { name: "Refus du client" }));
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
    await p.locator(".app-cote .app-nav-compte[aria-label$=\"à confirmer\"]").waitFor({ timeout: 5000 });
    verifie(Number(await p.locator(".app-cote .app-nav-compte[aria-label$=\"à confirmer\"]").innerText()) === aConfirmer, `le compteur de la navigation : ${aConfirmer} à confirmer`);
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
    await p.waitForFunction((n) => Number(document.querySelector(".app-cote .app-nav-compte[aria-label$=\"à confirmer\"]")?.textContent) === n, aConfirmer + 1, { timeout: 5000 }).catch(() => {});
    verifie(Number(await p.locator(".app-cote .app-nav-compte[aria-label$=\"à confirmer\"]").innerText()) === aConfirmer + 1, "le compteur passe à un de plus, sans recharger la page");
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
if (section("2")) {
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "gerant", attendue);
  /* Un formulaire posté : on attend la page qui revient (testeur.mjs). */
  const envoie = (bouton) => t.envoie(page, bouton);

  await etape("connexion, puis double authentification", async () => {
    await connexion(page, "gerant@maymar.test");
    await page.waitForURL(/double-authentification/, { timeout: 15000 });
    verifie(true, "propriétaire : la double authentification lui est proposée, il l'enregistre");
    const secret = (await page.locator("[data-secret-totp]").textContent()).trim();
    await clic(page, page.locator("#code"));
    await tape(page, totp(secret));
    await page.keyboard.press("Enter");
    // Une première activation mène à « Mon compte », sur les codes de secours ; puis le backoffice.
    await page.waitForURL(/\/gestion\/maymar\/compte/, { timeout: 15000 });
    verifie((await page.locator("#secours").innerText()).includes("Créez maintenant vos codes de secours"),
      "le code de l'application ouvre le backoffice, sur « Mon compte » : les codes de secours d'abord");
    await page.goto(`${C}/gestion/maymar`, { waitUntil: "networkidle" });
    verifie((await page.locator(".app-cote").getByRole("link", { name: "Visites" }).count()) === 0, "Maymar ne mesure pas son audience : pas d'écran Visites");
    verifie((await page.locator(".app-cote").getByRole("link", { name: "Lettre", exact: true }).count()) === 0, "ni de lettre : pas d'écran Lettre");
  });

  await etape("« Aujourd'hui » : ce qui attend l'équipe, chaque carte vers sa liste", async () => {
    await clic(page, page.locator(".app-nav a", { hasText: "Aujourd'hui" }).first());
    await page.waitForURL(/\/aujourdhui$/);
    await page.waitForLoadState("networkidle");
    const aConfirmer = page.locator(".jd-carte", { hasText: /à confirmer/ }).first();
    const n = Number((await aConfirmer.locator(".jd-carte-nombre").innerText()).trim());
    await page.locator(".app-nav .app-nav-compte").first().waitFor({ timeout: 8000 });
    const pastille = Number((await page.locator(".app-nav .app-nav-compte").first().innerText()).trim());
    verifie(n > 0 && n === pastille, `les commandes à confirmer : ${n}, comme la pastille de « Commandes »`);
    const prochain = page.locator(".jd-prochain");
    const ditProchain = (await prochain.innerText().catch(() => "")).replace(/\s+/g, " ");
    verifie(/attend depuis/i.test(ditProchain) && /MAY-2026-\d{5}/.test(ditProchain) && /TND/.test(ditProchain),
      `en tête, le prochain appel : qui, depuis quand, quoi (« ${ditProchain.slice(0, 110)}… »)`);
    verifie((await prochain.locator("a[href^='tel:']").count()) === 1 && (await prochain.locator("a[href^='https://wa.me/']").count()) === 1,
      "l'appel et le message WhatsApp, à portée de pouce");
    verifie((await page.locator(".jd-journee").innerText()).includes("TND"), "la journée, avec ses montants : le gérant est la direction");
    const stock = page.locator(".jd-stock");
    verifie((await stock.innerText()).includes("VAL-ABS-75-BOR") && (await stock.innerText()).includes("Épuisé"),
      "le stock à réassortir : la valise bordeaux épuisée en tête");
    await capture(page, "gerant-aujourdhui", true);
    await clic(page, page.locator(".jd-carte", { hasText: "Colis à préparer" }).locator(".jd-carte-lien"));
    await page.waitForURL(/etape=a_preparer/);
    verifie(true, "« Colis à préparer » ouvre la liste des commandes à préparer");
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
    await envoie(page.getByRole("button", { name: "Marquer expédiée" }));
    await page.waitForURL(/fait=expedier/);
    verifie((await statut(page)) === "Expédiée", "la commande est expédiée");
    verifie((await page.locator(".bo-action").innerText()).includes("suivi TN77001"), "le numéro de suivi est gardé");
    await capture(page, "gestion-fiche-expediee");
    await envoie(page.getByRole("button", { name: /Livrée, paiement encaissé/ }));
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
    await envoie(page.getByRole("button", { name: "Enregistrer le refus" }));
    await page.waitForURL(/fait=refuser/);
    verifie((await message(page)).includes("Le stock est rendu"), "refus enregistré, stock rendu");
    verifie((await page.locator(".bo-fiche-cote").innerText()).includes("1 refus à la livraison"), "le refus compte sur la fiche du client");
  });

  await etape("annuler, avec un motif", async () => {
    await ouvre(page, 7);
    await clic(page, page.locator("summary", { hasText: "Annuler la commande" }));
    await clic(page, page.locator("#motif"));
    await tape(page, "Rupture chez le fournisseur");
    await envoie(page.getByRole("button", { name: "Annuler la commande" }));
    await page.waitForURL(/fait=annuler/);
    verifie((await statut(page)) === "Annulée", "la commande est annulée");
    verifie((await page.locator(".bo-action").innerText()).includes("Rupture chez le fournisseur"), "le motif est affiché");
  });

  await etape("la note interne", async () => {
    await ouvre(page, 11);
    await clic(page, page.locator("#note-interne"));
    await tape(page, "Cliente de Sousse, livrer avant le week-end");
    await envoie(page.getByRole("button", { name: "Enregistrer la note" }));
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
    await clic(page, premiere.locator("summary", { hasText: "Mouvement de stock" }));
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
    await clic(page, premiere.locator("summary", { hasText: "Mouvement de stock" }));
    await clic(page, premiere.getByLabel("Casse"));
    await clic(page, premiere.locator("input[name=quantite]"));
    await tape(page, "999");
    await envoie(premiere.getByRole("button", { name: "Valider" }));
    verifie((await page.getByRole("alert").innerText()).includes("Il ne reste que"), "une casse plus grande que le stock est refusée");
    verifie(await page.locator(".var").first().locator(".var-pli").evaluate((d) => d.open), "le mouvement de stock reste ouvert, pour corriger");
    verifie(await page.locator(".var").first().locator("input[name=quantite]").inputValue() === "999", "la quantité refusée reste dans le champ, à corriger");
    await clic(page, page.locator(".var").first().getByLabel("Inventaire"));
    await clic(page, page.locator(".var").first().locator("input[name=quantite]"));
    await page.keyboard.press("Control+A");
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
    await clic(page, page.locator("summary:has(#t-ajouter)"));
    const axes = page.locator("details:has(#t-ajouter) input[name^='axe.']");
    const n = await axes.count();
    verifie(n === 2, `un champ par axe du produit (taille, couleur) : ${n}`);
    for (let i = 0; i < n; i++) {
      const nom = await axes.nth(i).getAttribute("name");
      await clic(page, axes.nth(i));
      await tape(page, nom === "axe.couleur" ? "Vert sauge" : "Cabine 55 cm");
    }
    await envoie(page.getByRole("button", { name: "Ajouter la déclinaison" }));
    verifie((await ok()).includes("Déclinaison ajoutée"), `« ${await ok()} »`);
    verifie((await page.locator(".var", { hasText: "Vert sauge" }).innerText()).includes("Épuisée"), "la nouvelle couleur arrive sans stock");
  });

  let nouveau = "";
  await etape("tout un arrivage en une fois : Catalogue → Réception", async () => {
    await page.goto(`${C}/gestion/maymar/produits`, { waitUntil: "networkidle" });
    await clic(page, page.getByRole("link", { name: "Réception" }));
    await page.waitForURL(/produits\/reception$/);
    await page.waitForLoadState("networkidle");
    verifie(await page.locator(".rc-produit").count() === 4, `les quatre valises, leurs déclinaisons en vente (${await page.locator(".rc-quantite").count()})`);
    await clic(page, page.locator(".rc-filtre input"));
    await tape(page, "business");
    const visibles = page.locator(".rc-produit:not([hidden])");
    verifie(await visibles.count() === 1, "le filtre va droit à la valise cabine business");
    const lignes = visibles.locator(".rc-ligne");
    const avant = await Promise.all([0, 1].map(async (i) => Number((await lignes.nth(i).locator(".rc-stock").innerText()).match(/(\d+) en stock/)[1])));
    await clic(page, lignes.nth(0).locator(".rc-quantite"));
    await tape(page, "10");
    await page.keyboard.press("Enter");
    verifie((await page.evaluate(() => document.activeElement?.id)) === (await lignes.nth(1).locator(".rc-quantite").getAttribute("id")),
      "Entrée passe à la déclinaison suivante (sans envoyer)");
    await tape(page, "6");
    verifie((await lignes.nth(0).locator(".rc-stock").innerText()).includes(`→ ${avant[0] + 10}`), "le nouveau stock s'affiche avant l'envoi");
    verifie((await page.locator(".rc-total").innerText()).includes("16 pièces sur 2 déclinaisons"), "le total de l'arrivage suit la saisie");
    await clic(page, page.locator(".rc-note"));
    await tape(page, "BL 2026-114");
    await capture(page, "gestion-reception");
    await envoie(page.getByRole("button", { name: "Enregistrer la réception" }));
    verifie((await ok()).includes("16 pièces sur 2 déclinaisons"), `« ${await ok()} »`);
    // Sans rechargement : le filtre reste posé, sur la valise qu'on vient de recevoir.
    verifie(await page.locator(".rc-filtre input").inputValue() === "business" && await visibles.count() === 1, "le filtre reste : la valise business, toujours sous les yeux");
    const apres = await Promise.all([0, 1].map(async (i) => Number((await lignes.nth(i).locator(".rc-stock").innerText()).match(/(\d+) en stock/)[1])));
    verifie(apres[0] === avant[0] + 10 && apres[1] === avant[1] + 6, `les deux stocks ont monté (${avant.join(", ")} → ${apres.join(", ")})`);
    const restes = await page.locator(".rc-quantite").evaluateAll((champs) => champs.filter((c) => c.value !== "").length);
    verifie(restes === 0 && (await page.locator(".rc-total").innerText()).includes("Tapez les quantités reçues")
      && await page.getByRole("button", { name: "Enregistrer la réception" }).isDisabled(),
      `les quantités se vident : rien ne peut partir deux fois (${restes} champ(s) rempli(s))`);
    verifie(await page.locator(".rc-note").inputValue() === "", "la note du bon de livraison aussi");
    await capture(page, "gestion-reception-enregistree");
  });

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
    const apercu = (await page.locator(".apercu-declinaisons").innerText()).replace(/\s+/g, " ");
    verifie(apercu.includes("3 déclinaisons") && apercu.includes("S, M, L") && apercu.includes("HOUSSE-DE-PROTECTION-S"),
      `pendant la saisie, l'aperçu : « ${apercu} »`);
    await capture(page, "gestion-nouveau-produit");
    await envoie(page.getByRole("button", { name: "Créer le produit" }));
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

  // Le studio photo (module studio_photo, allumé sur Maymar par les données de
  // démonstration). En local, Cloudflare Images est simulé : le détourage n'y
  // est pas, la mise au format et le fond, si.
  await etape("passer une photo au studio", async () => {
    const originale = await cheminDe(vignettes().first());
    await clic(page, vignettes().first().locator(".ph-image"));
    const feuille = page.locator(".ph-feuille:popover-open");
    await feuille.waitFor();
    verifie((await feuille.innerText()).includes("L'objet est détouré"), "la feuille dit ce que fait le studio, et que l'originale reste");
    await envoie(feuille.getByRole("button", { name: "Passer au studio" }));
    verifie((await ok()).includes("Photo studio ajoutée"), `« ${await ok()} »`);
    verifie(await vignettes().count() === 2 && await cheminDe(vignettes().first()) === originale,
      "une photo de plus, à la fin : l'originale reste la principale");
    const studio = await cheminDe(vignettes().nth(1));
    const f = await fichierLocal(studio);
    const [l, h] = f.status === 200 ? tailleWebp(f.octets) : [0, 0];
    verifie(f.status === 200 && f.type === "image/webp" && l === 1200 && h === 1500, `au format des cartes, en WebP : ${l} × ${h}`);
    await page.evaluate(() => window.scrollBy(0, -96));
    await capture(page, "gestion-photo-studio");
    // La fiche revient à une photo, pour la suite du parcours.
    await clic(page, vignettes().nth(1).locator(".ph-image"));
    const deuxieme = page.locator(".ph-feuille:popover-open");
    await deuxieme.waitFor();
    await envoie(deuxieme.getByRole("button", { name: "Retirer la photo" }));
    verifie(await vignettes().count() === 1, "retirée, il reste l'originale");
  });

  // La rédaction (module redaction, allumée sur Maymar par les données de
  // démonstration). En local, Workers AI n'existe pas : un brouillon d'essai,
  // composé des seuls faits de la fiche et dit tel — le geste entier se
  // vérifie, pas le modèle.
  await etape("rédiger la description : un brouillon à relire, puis la vitrine", async () => {
    const champ = page.locator("#description");
    const avant = await champ.inputValue();
    const notes = "Coque rigide, fermeture à code.";
    await champ.fill(notes);
    await clic(page, page.getByRole("button", { name: "Rédiger la description" }));
    await page.locator(".redaction[data-etat=pose]").waitFor({ timeout: 15000 });
    const brouillon = await champ.inputValue();
    const nom = await page.locator("#nom").inputValue();
    verifie(brouillon.includes(nom) && brouillon.includes(notes), `le brouillon reprend la fiche et les notes : « ${brouillon.replace(/\s+/g, " ").slice(0, 110)}… »`);
    verifie((await page.locator(".redaction [role=status]").innerText()).includes("Enregistrer la fiche"), "il dit que rien n'est enregistré sans vous");
    await capture(page, "gestion-redaction");
    await clic(page, page.getByRole("button", { name: "Revenir à mon texte" }));
    verifie(await champ.inputValue() === notes, "« Revenir à mon texte » remet ce qu'il y avait");
    // Un brouillon enregistré : la vitrine en montre les paragraphes et la liste.
    await clic(page, page.getByRole("button", { name: "Rédiger la description" }));
    await page.locator(".redaction[data-etat=pose]").waitFor({ timeout: 15000 });
    await envoie(page.getByRole("button", { name: "Enregistrer la fiche" }));
    const lien = await page.getByRole("link", { name: /Voir sur la vitrine/ }).getAttribute("href").catch(() => null);
    if (lien) {
      const v = await ctx.newPage();
      await v.goto(lien, { waitUntil: "networkidle" });
      const description = v.locator(".texte-description").first();
      verifie((await description.locator("p").count()) >= 2 && (await description.locator("li").count()) >= 1,
        `sur la vitrine : ${await description.locator("p").count()} paragraphe(s), ${await description.locator("li").count()} ligne(s) de liste`);
      await v.close();
    }
    // La fiche reprend sa description d'avant, pour la suite du parcours.
    await page.locator("#description").fill(avant);
    await envoie(page.getByRole("button", { name: "Enregistrer la fiche" }));
    verifie(await page.locator("#description").inputValue() === avant, "la description d'avant est remise");
  });

  /* ---------------- Les fiches techniques (B9) ---------------- */
  const nouvelleCaracteristique = async ({ nom, unite = "", type, rayon }) => {
    const form = page.locator("section:has(#t-nouvel-attribut) form");
    await form.locator("#label-nouveau").fill(nom);
    await form.locator("#unite-nouveau").fill(unite);
    await clic(page, form.locator(".choix-carte", { hasText: type === "nombre" ? "Un nombre" : "Un texte" }));
    if (rayon) await clic(page, form.locator(".opt", { hasText: rayon }).first());
    await envoie(form.getByRole("button", { name: "Ajouter la caractéristique" }));
  };

  await etape("les caractéristiques de la boutique", async () => {
    await page.goto(`${C}/gestion/maymar/produits`, { waitUntil: "networkidle" });
    await clic(page, page.getByRole("link", { name: "Caractéristiques" }));
    await page.waitForURL(/produits\/caracteristiques$/);
    await page.waitForLoadState("networkidle");
    verifie((await page.locator("section:has(#t-attributs)").innerText()).includes("Pas encore de fiche technique"), "aucune caractéristique au départ");
    await nouvelleCaracteristique({ nom: "Matière", type: "texte", rayon: "Valises" });
    verifie((await ok()).includes("« Matière » ajoutée"), `« ${await ok()} »`);
    await nouvelleCaracteristique({ nom: "Volume", unite: "L", type: "nombre", rayon: "Valises" });
    const ligne = (await page.locator(".ft-attribut", { hasText: "Volume" }).innerText()).replace(/\s+/g, " ");
    verifie(ligne.includes("L") && ligne.includes("Nombre") && ligne.includes("Filtrable") && ligne.includes("Valises"),
      `chacune avec son unité, son type, filtrable, ses rayons : « ${ligne} »`);
    await nouvelleCaracteristique({ nom: "matière", type: "texte" });
    verifie((await page.getByRole("alert").innerText()).includes("porte déjà ce nom"), "deux caractéristiques ne portent pas le même nom");
    await capture(page, "gestion-caracteristiques", true);
  });

  await etape("la fiche technique d'un produit", async () => {
    await page.goto(nouveau.split("?")[0], { waitUntil: "networkidle" });
    const section = page.locator("section:has(#t-technique)");
    verifie(await section.locator("#car-matiere").count() === 1 && await section.locator("#car-volume").count() === 1,
      "la fiche propose les caractéristiques de son rayon");
    await section.locator("#car-volume").fill("grand");
    await envoie(section.getByRole("button", { name: "Enregistrer les caractéristiques" }));
    verifie((await page.getByRole("alert").innerText()).includes("attend un nombre"), `refusé : « ${await page.getByRole("alert").innerText()} »`);
    await section.locator("#car-matiere").fill("Polyester recyclé");
    await section.locator("#car-volume").fill("12,5 L");
    await envoie(section.getByRole("button", { name: "Enregistrer les caractéristiques" }));
    verifie((await ok()).includes("Fiche technique enregistrée"), `« ${await ok()} »`);
    verifie(await section.locator("#car-volume").inputValue() === "12,5", "le nombre relu à la française, l'unité ôtée");
    await section.scrollIntoViewIfNeeded();
    await capture(page, "gestion-fiche-technique");
  });

  await etape("la vitrine montre la photo, et la fiche technique", async () => {
    const chemin = await cheminDe(vignettes().first());
    const vitrine = await ctx.newPage();
    await vitrine.goto(`${t.adresse("maymar.localhost")}/produit/housse-de-protection`, { waitUntil: "networkidle" });
    const srcs = await vitrine.locator("main img").evaluateAll((imgs) => imgs.map((i) => i.getAttribute("src") ?? ""));
    verifie(srcs.some((s) => decodeURIComponent(s).includes(chemin)), "la fiche de la vitrine affiche la photo déposée");
    const specs = (await vitrine.locator("dl.caracteristiques").first().textContent()) ?? "";
    verifie(specs.includes("Matière") && specs.includes("Polyester recyclé") && /12,5\sL/.test(specs),
      "et sa fiche technique : matière, volume en litres");
    await vitrine.goto(`${t.adresse("maymar.localhost")}/catalogue/matiere=${encodeURIComponent("Polyester recyclé")}`, { waitUntil: "networkidle" });
    const liste = await vitrine.locator("main").innerText();
    verifie(liste.includes("Housse de protection") && /\b1\s+(produit|modèle|article)/i.test(liste),
      "la liste filtrée sur la matière ne montre qu'elle");
    await vitrine.close();
  });

  await etape("deux écrans sur la même fiche : pas d'écrasement", async () => {
    const autre = await navigateur.newContext({ viewport: { width: 1280, height: 860 }, locale: "fr-FR" });
    await autre.addCookies(await ctx.cookies());
    const p2 = await autre.newPage();
    await p2.goto(nouveau.split("?")[0], { waitUntil: "networkidle" });
    await page.goto(nouveau.split("?")[0], { waitUntil: "networkidle" });
    await page.locator("#marque").fill("Maymar");
    await envoie(page.getByRole("button", { name: "Enregistrer la fiche" }));
    await page.waitForURL(/ok=/);
    await p2.locator("#nom").fill("Housse (écrasée)");
    await t.envoie(p2, () => p2.getByRole("button", { name: "Enregistrer la fiche" }).click());
    await p2.waitForURL(/erreur=/);
    verifie((await p2.getByRole("alert").innerText()).includes("modifiée entre-temps"), "l'écran resté ouvert est prévenu, rien n'est écrasé");
    await autre.close();
  });

  await etape("les rayons : créer, un sous-rayon, changer l'adresse, ranger, masquer, retirer", async () => {
    const V = t.adresse("maymar.localhost");
    const ligne = (nom) => page.locator("li.ry-rayon", { has: page.locator(".ft-attribut-nom", { hasText: nom }) });
    const statut = (cle) => page.locator(`#${cle} [role=status]`).first().innerText();
    await page.goto(`${C}/gestion/maymar/produits`, { waitUntil: "networkidle" });
    await clic(page, page.getByRole("link", { name: "Rayons" }));
    await page.waitForURL(/produits\/rayons$/);
    await page.waitForLoadState("networkidle");
    // Un rayon à la racine, son adresse tirée du nom.
    await page.locator("#nouveau-nom").fill("Sacs de voyage");
    await envoie(page.getByRole("button", { name: "Créer le rayon" }));
    verifie((await ligne("Sacs de voyage").innerText()).includes("/categorie/sacs-de-voyage"), "l'adresse est tirée du nom");
    verifie((await ligne("Sacs de voyage").getByRole("status").innerText()).includes("créé"), "le message paraît dans la ligne du rayon créé");
    // Un sous-rayon, depuis la ligne de son parent : le parent est déjà choisi.
    await clic(page, ligne("Valises").getByRole("link", { name: "Sous-rayon" }));
    await page.waitForURL(/parent=/);
    verifie(await page.locator("#nouveau-parent option:checked").innerText() === "Valises", "« Sous-rayon » choisit le rayon parent");
    await page.locator("#nouveau-nom").fill("Cabine");
    await envoie(page.getByRole("button", { name: "Créer le rayon" }));
    verifie(await ligne("Cabine").getAttribute("data-niveau") === "2", "Cabine est rangé sous Valises");
    // Une adresse changée : l'ancienne mène toujours au rayon.
    const cabine = ligne("Cabine");
    await clic(page, cabine.locator("summary", { hasText: "Modifier" }));
    await cabine.locator("input[name=slug]").fill("petites-valises");
    await envoie(cabine.getByRole("button", { name: "Enregistrer" }));
    verifie((await ligne("Cabine").innerText()).includes("/categorie/petites-valises"), "la nouvelle adresse est enregistrée");
    const vitrine = await ctx.newPage();
    await vitrine.goto(`${V}/categorie/cabine`, { waitUntil: "networkidle" });
    verifie(new URL(vitrine.url()).pathname === "/categorie/petites-valises", `l'ancienne adresse redirige (${vitrine.url()})`);
    // Un rayon vide n'est ni dans le menu ni dans les puces du rayon parent.
    await vitrine.goto(`${V}/categorie/valises`, { waitUntil: "networkidle" });
    const liens = await vitrine.locator("a[href^='/categorie/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    verifie(!liens.includes("/categorie/sacs-de-voyage") && !liens.includes("/categorie/petites-valises"), "un rayon encore vide n'est pas proposé au client");
    // Ranger : monter Sacs de voyage devant Valises (le menu suit).
    await envoie(ligne("Sacs de voyage").getByRole("button", { name: "Sacs de voyage : monter" }));
    const ordre = await page.locator("li.ry-rayon[data-niveau='1'] .ft-attribut-nom").allInnerTexts();
    verifie(ordre[0].startsWith("Sacs de voyage"), `l'ordre est changé : ${ordre.join(", ")}`);
    verifie(await ligne("Sacs de voyage").getByRole("button", { name: "Sacs de voyage : monter" }).isDisabled(), "le premier ne monte plus");
    await envoie(ligne("Sacs de voyage").getByRole("button", { name: "Sacs de voyage : descendre" }));
    // Masquer Valises : il quitte le menu, son sous-rayon avec lui ; on le remet.
    const valises = ligne("Valises");
    await clic(page, valises.locator("summary", { hasText: "Modifier" }));
    await clic(page, valises.locator("input[name=actif]"));
    await envoie(valises.getByRole("button", { name: "Enregistrer" }));
    verifie((await ligne("Valises").innerText()).includes("Masqué") && (await ligne("Cabine").innerText()).includes("Masqué avec son rayon"),
      "masqué, et son sous-rayon avec lui");
    await vitrine.goto(`${V}/`, { waitUntil: "networkidle" });
    // (les sections de l'accueil gardent leurs liens écrits à la main : c'est la navigation qui compte)
    verifie(await vitrine.locator("header a[href='/categorie/valises']").count() === 0, "Valises masqué quitte la navigation");
    await clic(page, ligne("Valises").locator("summary", { hasText: "Modifier" }));
    await clic(page, ligne("Valises").locator("input[name=actif]"));
    await envoie(ligne("Valises").getByRole("button", { name: "Enregistrer" }));
    await vitrine.goto(`${V}/`, { waitUntil: "networkidle" });
    verifie(await vitrine.locator("header a[href='/categorie/valises']").count() > 0, "rendu visible, il revient");
    // Retirer : « Annuler » referme sans rien faire ; puis les deux rayons d'essai partent.
    await clic(page, ligne("Cabine").locator("summary", { hasText: "Retirer" }));
    await clic(page, ligne("Cabine").locator("summary", { hasText: "Annuler" }));
    verifie(!(await ligne("Cabine").locator(".ft-retirer").evaluate((d) => d.open)), "« Annuler » referme le retrait");
    for (const nom of ["Cabine", "Sacs de voyage"]) {
      await clic(page, ligne(nom).locator("summary", { hasText: "Retirer" }));
      await envoie(ligne(nom).getByRole("button", { name: `Oui, retirer « ${nom} »` }));
      verifie((await statut("rayons")).includes(`« ${nom} » retiré`), `« ${nom} » retiré`);
    }
    verifie(await ligne("Cabine").count() === 0 && await ligne("Sacs de voyage").count() === 0, "la liste revient comme au départ");
    await capture(page, "gestion-rayons");
    await vitrine.close();
  });

  /* ---------------- Les réglages ---------------- */
  const section = (id) => page.locator(`section:has(#t-${id})`);
  const journal = () => page.locator("section:has(#t-journal)").innerText();

  // Une page par thème : on y va comme l'équipe, par la liste des thèmes.
  const theme = async (nom, chemin) => {
    await clic(page, page.locator(".rg-nav").getByRole("link", { name: nom }));
    await page.waitForURL(new RegExp(`/reglages/${chemin}(\\?|#|$)`));
    await page.waitForLoadState("networkidle");
  };

  await etape("les réglages : une tuile par thème, ce qui est réglé, ce qui manque", async () => {
    await clic(page, page.locator(".app-cote").getByRole("link", { name: "Réglages" }));
    await page.waitForURL(/\/gestion\/maymar\/reglages$/);
    await page.waitForLoadState("networkidle");
    const tuiles = await page.locator(".rg-tuile b").allInnerTexts();
    for (const nom of ["Commandes", "Livraison", "Paiement", "Fonctions de la vitrine", "Contact et réseaux", "Informations légales", "Vos données"]) {
      verifie(tuiles.includes(nom), `la tuile « ${nom} »`);
    }
    // Par son titre : « À la livraison » (la tuile Paiement) contient aussi le mot.
    const tuile = (nom) => page.locator(".rg-tuile").filter({ has: page.locator("b", { hasText: new RegExp(`^${nom}$`) }) });
    const livraison = await tuile("Livraison").innerText();
    verifie(livraison.includes("7,000 TND partout"), `chaque tuile dit ce qui est réglé (« ${livraison.split("\n").at(-1)} »)`);
    verifie((await page.locator(".rg-attention").innerText()).includes("Informations légales"), "« À régler avant d'ouvrir » : les informations légales manquent");
    verifie(await page.locator("#t-journal").count() === 1, "et les derniers changements, au journal");
    const hauteur = await page.evaluate(() => document.documentElement.scrollHeight);
    verifie(hauteur < 2000, `l'accueil des réglages tient en un écran ou deux (${hauteur} px, contre 9 000 avant)`);
    await capture(page, "gestion-reglages", true);
    await clic(page, tuile("Commandes"));
    await page.waitForURL(/\/reglages\/commandes$/);
    await page.waitForLoadState("networkidle");
    verifie(await section("commandes").getByLabel("Compte obligatoire").isChecked(), "au départ : compte obligatoire");
    verifie((await section("commandes").innerText()).includes("MAY-"), "le préfixe des numéros est affiché, réglé par SkanEcom");
    verifie((await page.locator(".rg-nav [aria-current=page]").innerText()).includes("Commandes"), "la liste des thèmes, à gauche, dit où l'on est");
  });

  await etape("l'abonnement : sa formule, ses factures SkanEcom, ses envois du mois", async () => {
    await page.goto(`${C}/gestion/maymar/reglages`, { waitUntil: "networkidle" });
    const tuile = page.locator(".rg-tuile").filter({ has: page.locator("b", { hasText: /^Abonnement$/ }) });
    verifie(await tuile.count() === 1 && (await tuile.innerText()).includes("Sur mesure"), "une tuile « Abonnement », à côté des réglages : « Sur mesure »");
    await clic(page, tuile);
    await page.waitForURL(/\/gestion\/maymar\/abonnement$/);
    await page.waitForLoadState("networkidle");
    const texte = await page.locator("main").innerText();
    verifie(texte.includes("Votre formule") && (await page.locator(".ab-formule-nom b").innerText()) === "Sur mesure", "sa formule : sur mesure");
    verifie(await page.locator(".ab-droit:not([data-ouvert])").count() === 0, "sur mesure : toutes les fonctions sont ouvertes, cochées");
    verifie(texte.includes("Aucune carte bancaire n'est demandée sur SkanEcom"), "aucune carte n'est demandée ici : c'est dit");
    verifie(texte.includes("Vos factures SkanEcom paraîtront ici"), "pas encore reliée à la facturation de SkanEcom : dit tel quel, rien d'inventé");
    verifie(await page.locator(".ab-envoi").count() === 2, "ses e-mails et ses SMS du mois");
    await capture(page, "gestion-abonnement", true);
    // L'étape suivante reprend sur les réglages des commandes.
    await page.goto(`${C}/gestion/maymar/reglages/commandes`, { waitUntil: "networkidle" });
  });

  await etape("ouvrir aux invités, confirmer d'office, le code par e-mail", async () => {
    verifie(await section("commandes").getByLabel("SMS ou e-mail, au choix").isChecked(), "au départ : le code par SMS ou par e-mail, au choix");
    await clic(page, section("commandes").getByText("Commande en invité"));
    await clic(page, section("commandes").getByText("Par e-mail seulement"));
    await clic(page, section("commandes").getByText("Confirmée d'office"));
    await envoie(section("commandes").getByRole("button", { name: "Enregistrer" }));
    verifie((await ok()).includes("Réglages enregistrés"), `« ${await ok()} »`);
    verifie(await section("commandes").getByLabel("Commande en invité").isChecked(), "le choix est gardé");
    const j = await journal();
    verifie(j.includes("Compte client : obligatoire → invité possible") && j.includes("Confirmation : par téléphone → automatique")
      && j.includes("Code de connexion : SMS ou e-mail, au choix → par e-mail"),
      "le journal dit ce qui a changé, et qui l'a fait");
    verifie(j.includes("gerant@maymar.test"), "avec son auteur");
  });

  await etape("les frais par zone, et une zone de plus", async () => {
    await theme("Livraison", "livraison");
    verifie((await section("zones").innerText()).includes("Non appliquées"), "les zones de Maymar existent, mais le tarif est le même partout");
    verifie(await page.locator(".rg-pli:not([open]) #g-tunis").count() === 1, "tarif unique : les 24 gouvernorats restent repliés");
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

  await etape("le supplément au poids, par tranches", async () => {
    verifie((await section("poids").innerText()).includes("Non appliqué"), "au départ : le tarif seul, quel que soit le poids");
    const ajoute = async (kg, tnd) => {
      await page.locator("#tj-neuve").fill(kg);
      await page.locator("#ts-neuve").fill(tnd);
      await envoie(page.getByRole("button", { name: "Ajouter la tranche" }));
    };
    await ajoute("5", "0");
    verifie((await ok()).includes("Tranche « jusqu'à 5 kg » ajoutée"), `« ${await ok()} »`);
    await ajoute("20", "3,000");
    await ajoute("", "8");
    verifie((await ok()).includes("Tranche « au-delà » ajoutée"), `« ${await ok()} »`);
    await ajoute("5", "1");
    verifie((await page.getByRole("alert").innerText()).includes("déjà une tranche à ce poids"), "deux tranches au même poids : refusé");
    const tranches = await section("poids").locator(".rg-tranche:not(.rg-tranche-ajout) .rg-tranche-plage").allInnerTexts();
    verifie(tranches.length === 3 && tranches[1].includes("Plus de 5 kg, jusqu'à 20 kg") && tranches[2].includes("Plus de 20 kg"),
      `chaque tranche dit sa plage de poids (${tranches.map((x) => x.replace(/\s*\n\s*/, " · ")).join(" | ")})`);
    verifie(await fraisPour("sfax", 1000, 30000) === 10000, "préparées, les tranches ne comptent pas encore");

    await clic(page, section("livraison").getByText("Supplément selon le poids du colis"));
    await envoie(section("livraison").getByRole("button", { name: "Enregistrer" }));
    verifie((await section("poids").innerText()).includes("Appliqué"), "le supplément s'applique");
    verifie(await fraisPour("sfax", 1000, 4000) === 10000, "un colis de 4 kg : le tarif de la zone");
    verifie(await fraisPour("sfax", 1000, 12000) === 13000, `12 kg : + 3,000 TND (${await fraisPour("sfax", 1000, 12000)})`);
    verifie(await fraisPour("sfax", 1000, 30000) === 18000, "30 kg : la tranche « au-delà »");
    verifie(await fraisPour("tunis", 320000, 30000) === 0, "offerte dès 300 TND : supplément compris");

    await section("poids").locator("input[name=supplement]").nth(1).fill("4,000");
    await envoie(section("poids").getByRole("button", { name: "Enregistrer" }).nth(1));
    verifie((await ok()).includes("Tranche « jusqu'à 20 kg » enregistrée"), `« ${await ok()} »`);
    verifie(await fraisPour("sfax", 1000, 12000) === 14000, "le nouveau supplément compte aussitôt");
    const j = await journal();
    verifie(j.includes("Tranche ajoutée : jusqu'à 20 kg, + 3,000 TND") && j.includes("Tranche modifiée : jusqu'à 20 kg, + 4,000 TND"),
      "chaque tranche passe au journal");
    verifie(j.includes("Supplément au poids : non → oui"), "et le réglage aussi");
    await pause(800);
    await capture(page, "gestion-reglages-poids");
  });

  await etape("un moyen de paiement qu'on ne coupe pas, un WhatsApp", async () => {
    await theme("Paiement", "paiement");
    await clic(page, section("paiement").getByText("Paiement à la livraison"));
    await envoie(section("paiement").getByRole("button", { name: "Enregistrer" }));
    verifie((await page.getByRole("alert").innerText()).includes("au moins un moyen de paiement"), "le seul moyen de paiement ne se coupe pas");
    // Refusé, le geste laisse la case comme on l'a mise (pour corriger) ; la boutique, elle, n'a rien changé.
    verifie(!(await section("paiement").getByLabel("Paiement à la livraison").isChecked()), "la case reste comme on l'a mise, sous le refus");
    await page.reload({ waitUntil: "networkidle" });
    verifie(await section("paiement").getByLabel("Paiement à la livraison").isChecked(), "rechargée, la page le confirme : il reste coché");
    verifie((await section("paiement").innerText()).includes("Sur demande"), "Konnect : sur demande, SkanEcom l’allume");
    await theme("Contact et réseaux", "contact");
    await section("contact").locator("#whatsapp").fill("20 123 456");
    await envoie(section("contact").getByRole("button", { name: "Enregistrer" }));
    verifie(await section("contact").locator("#whatsapp").inputValue() === "21620123456", "le numéro est mis au format international");
  });

  await etape("les réglages sur téléphone", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${C}/gestion/maymar/reglages/livraison#t-zones`, { waitUntil: "networkidle" });
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    verifie(!deborde, "rien ne déborde en largeur");
    await pause(800);
    await capture(page, "gestion-reglages-telephone");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await etape("remettre Maymar comme au départ", async () => {
    await page.goto(`${C}/gestion/maymar/reglages/commandes`, { waitUntil: "networkidle" });
    await clic(page, section("commandes").getByText("Compte obligatoire"));
    await clic(page, section("commandes").getByText("SMS ou e-mail, au choix"));
    await clic(page, section("commandes").getByText("Confirmée par téléphone"));
    await envoie(section("commandes").getByRole("button", { name: "Enregistrer" }));
    await theme("Livraison", "livraison");
    await clic(page, section("livraison").getByText("Même tarif partout"));
    await section("livraison").locator("#seuil").fill("");
    await envoie(section("livraison").getByRole("button", { name: "Enregistrer" }));
    verifie(await fraisPour("sfax") === 7000 && await fraisPour("tunis", 320000) === 7000, "de nouveau le même tarif partout, jamais offert");
  });

  await etape("les informations légales, jusqu'aux pages de la vitrine", async () => {
    await theme("Informations légales", "legal");
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
    verifie(cgv.includes("Supplément selon le poids du colis") && cgv.includes("Plus de 5 kg, jusqu'à 20 kg"),
      "et le barème du supplément au poids");
    await vitrine.close();
  });

  await etape("couper le supplément au poids", async () => {
    await page.goto(`${C}/gestion/maymar/reglages/livraison#t-poids`, { waitUntil: "networkidle" });
    await clic(page, section("livraison").getByText("Supplément selon le poids du colis"));
    await envoie(section("livraison").getByRole("button", { name: "Enregistrer" }));
    verifie((await section("poids").innerText()).includes("Non appliqué"), "de nouveau le tarif seul");
    for (const nom of ["jusqu'à 5 kg", "jusqu'à 20 kg", "au-delà"]) {
      await envoie(page.getByRole("button", { name: `Supprimer la tranche ${nom}` }));
    }
    verifie((await ok()).includes("Tranche supprimée") && await section("poids").locator(".rg-tranche:not(.rg-tranche-ajout)").count() === 0, "les tranches sont retirées");
    verifie(await fraisPour("sfax", 1000, 30000) === 7000, "30 kg : le tarif fixe, sans supplément");
  });

  await etape("le service après-vente : rappeler, prendre en charge, clore", async () => {
    await page.goto(`${C}/gestion/maymar`, { waitUntil: "networkidle" });
    const lienSav = page.locator(".app-cote").getByRole("link", { name: /SAV/ });
    verifie((await lienSav.innerText()).includes("1"), "la navigation compte la demande à rappeler");
    await clic(page, lienSav);
    await page.waitForURL(/\/gestion\/maymar\/sav$/);
    await page.waitForLoadState("networkidle");
    const ligne = page.locator(".sav-ligne").first();
    const texteLigne = await ligne.innerText();
    verifie(texteLigne.includes("SAV-00002") && texteLigne.includes("Sous garantie") && texteLigne.includes("ABS55-BL-0921"),
      "la nouvelle demande : sous garantie (24 mois), avec son numéro de série");
    verifie((await page.locator(".bo-etapes").innerText()).replace(/\s+/g, " ").includes("En cours 1"), "et celle déjà en cours, dans son onglet");
    await capture(page, "gestion-sav");
    await clic(page, ligne.locator(".bo-ligne-lien"));
    await page.waitForURL(/\/sav\/SAV-00002$/);
    verifie((await page.locator(".sav-description").innerText()).includes("fermeture éclair"), "la fiche dit ce que le client a écrit");
    const wa = decodeURIComponent((await page.locator("a.bo-whatsapp").getAttribute("href")) ?? "");
    verifie(wa.includes("SAV-00002") && wa.includes("Amira"), "le message WhatsApp est prêt : le prénom, la demande");
    await page.locator("#note-prise").fill("Elle passe au magasin jeudi avec la valise");
    await envoie(page.getByRole("button", { name: "Prendre en charge" }));
    verifie((await ok()).includes("prise en charge"), `« ${await ok()} »`);
    const perime = await posteBrut(ctx, "/gestion/maymar/sav/SAV-00002/action", { geste: "refuser", statut: "nouvelle", issue: "hors_garantie" });
    verifie(perime.status === 303 && (new URLSearchParams(new URL(perime.location, C).search).get("erreur") ?? "").includes("changé entre-temps"),
      "un second écran resté sur « nouvelle » : le geste est refusé, pas rejoué");
    await clic(page, page.locator("summary", { hasText: "Résolue" }));
    await clic(page, page.getByText("Échangé", { exact: true }));
    await page.locator("#note-resolue").fill("Fermeture remplacée par le fournisseur");
    await envoie(page.getByRole("button", { name: "Enregistrer : résolue" }));
    verifie((await ok()).includes("résolue"), `« ${await ok()} »`);
    const historique = await page.locator("section:has(#historique-titre)").innerText();
    verifie(historique.includes("Prise en charge") && historique.includes("Résolue — échangé") && historique.includes("gerant@maymar.test"),
      "l'historique : chaque geste, avec son auteur");
    verifie(!(await page.locator(".app-cote").getByRole("link", { name: /SAV/ }).innerText()).match(/\d/), "plus rien à rappeler");
    await capture(page, "gestion-sav-fiche", true);
  });

  await etape("le tableau de bord : ce que la période a donné", async () => {
    await clic(page, page.locator(".app-cote").getByRole("link", { name: "Tableau de bord" }));
    await page.waitForURL(/\/gestion\/maymar\/tableau/);
    await page.locator(".tb-chiffres").waitFor();
    const chiffres = await page.locator(".tb-chiffres").innerText();
    verifie(["Encaissé", "Commandes reçues", "Taux de confirmation", "Refus à la livraison"].every((x) => chiffres.includes(x)),
      "quatre chiffres : l'encaissé, les commandes, la confirmation, les refus");
    verifie(await page.locator(".tb-barres li").count() === 30, "sur 30 jours, un point par jour");
    verifie((await page.locator("section:has(#tb-refus)").innerText()).includes("Le client"), "les refus disent d'où ils viennent");
    await capture(page, "gestion-tableau-de-bord", true);
    await clic(page, page.getByRole("link", { name: "7 jours" }));
    await page.waitForURL(/jours=7/);
    await page.waitForLoadState("networkidle");
    verifie(await page.locator(".tb-barres li").count() === 7, "sur 7 jours : sept points");
  });

  await etape("la palette (Ctrl+K) : on tape, on arrive", async () => {
    await page.goto(`${C}/gestion/maymar`, { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    const palette = page.locator("dialog.palette[open]");
    await palette.waitFor({ timeout: 5000 });
    verifie((await page.evaluate(() => document.activeElement?.closest("dialog.palette") !== null)), "Ctrl+K ouvre la palette, le curseur dans son champ");
    verifie((await palette.locator(".palette-option").allInnerTexts()).some((x) => x.includes("Encaissements")), "sans rien taper : les pages du backoffice");
    await tape(page, "amira");
    await palette.locator(".palette-option", { hasText: "MAY-" }).first().waitFor({ timeout: 8000 });
    const trouves = (await palette.locator(".palette-option").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
    verifie(trouves.some((x) => x.includes("Amira Chaabane") && x.includes("MAY-")) && trouves.some((x) => x.includes("+216 21 778 804")),
      `« amira » : sa commande et sa fiche client (${trouves.length} résultats)`);
    await capture(page, "gestion-palette");
    await page.keyboard.press("ArrowDown");
    verifie((await palette.locator(".palette-option[aria-selected=true]").innerText()).includes("+216 21 778 804"), "↓ passe au résultat suivant, le focus reste dans le champ");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/gestion\/maymar\/clients\/[0-9a-f-]{36}$/);
    verifie((await page.locator("dialog.palette[open]").count()) === 0, "Entrée ouvre la fiche client, la palette se referme");
    await page.getByRole("button", { name: /Rechercher/ }).first().click();
    await palette.waitFor();
    await tape(page, "reglages");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/gestion\/maymar\/reglages$/);
    verifie(true, "« reglages » (sans accent) : Entrée mène aux réglages — le bouton Rechercher ouvre la même palette");
    await page.keyboard.press("Control+k");
    await palette.waitFor();
    await page.keyboard.press("Escape");
    verifie((await page.locator("dialog.palette[open]").count()) === 0, "Échap la referme");
  });

  await etape("les encaissements : l'argent resté chez les livreurs", async () => {
    await clic(page, page.locator(".app-cote").getByRole("link", { name: "Encaissements" }));
    await page.waitForURL(/\/gestion\/maymar\/encaissements/);
    const chiffres = await page.locator(".tb-chiffres").innerText();
    verifie(["Chez les livreurs", "Reçu sur 30 jours", "Écart sur 30 jours"].every((x) => chiffres.includes(x)), "l'argent en un coup d'œil : chez les livreurs, reçu, écart");
    const demo = page.locator(".ec-versement", { hasText: "VIR ARAMEX 0915" });
    verifie((await demo.count()) === 1 && (await demo.innerText()).includes("−6,000 TND"), "le journal garde le versement d'Aramex du jeu de démo, 6 TND retenus");
    const groupe = page.locator(".ec-groupe").first();
    const livreur = (await groupe.locator("h2").innerText()).trim();
    const colis = await groupe.locator(".ec-colis-ligne").count();
    const total = (await groupe.locator(".ec-groupe-total").innerText()).replace(/[^\d,]/g, "");
    verifie(colis >= 1, `${livreur} : ${colis} colis livré(s), ${total} TND pas encore reversés`);
    verifie((await groupe.locator(".ec-bilan").innerText()).includes("Le compte est bon"), "tout coché, le montant proposé est l'attendu");
    const moins5 = (Number(total.replace(",", ".")) - 5).toFixed(3).replace(".", ",");
    await groupe.locator("input[name=recu]").fill(moins5);
    verifie((await groupe.locator(".ec-bilan").innerText()).includes("Écart −5,000 TND"), `${moins5} TND reçus : l'écart s'affiche pendant la saisie (−5,000)`);
    await groupe.locator("input[name=reference]").fill("VIR-PARCOURS");
    await capture(page, "gestion-encaissements");
    await envoie(groupe.getByRole("button", { name: /Enregistrer le versement/ }));
    await page.waitForURL(/fait=verse/);
    verifie((await page.locator(".message-succes").innerText()).includes("écart de −5,000 TND"), "le versement est enregistré, son écart annoncé");
    const saisi = page.locator(".ec-versement", { hasText: "VIR-PARCOURS" });
    verifie((await saisi.innerText()).includes("−5,000 TND") && (await saisi.innerText()).includes("gerant@maymar.test"), "il entre au journal, avec son auteur");
    await clic(page, saisi.locator("summary"));
    await envoie(saisi.getByRole("button", { name: "Annuler ce versement" }));
    await page.waitForURL(/fait=annule/);
    verifie((await page.locator(".ec-versement", { hasText: "VIR-PARCOURS" }).innerText()).includes("Annulé"), "une saisie erronée s'annule : elle reste au journal, barrée");
    verifie((await page.locator(".ec-groupe").first().locator(".ec-colis-ligne").count()) === colis, "ses colis redeviennent à recevoir");
  });

  await etape("les données de la boutique, dans un tableur", async () => {
    await page.goto(`${C}/gestion/maymar/reglages/donnees`, { waitUntil: "networkidle" });
    const donnees = page.locator("section:has(#t-donnees)");
    verifie(await donnees.getByRole("link", { name: /Télécharger/ }).count() === 7, "sept exports : commandes, articles, clients, catalogue, stock, le SAV (module) et les versements des livreurs");
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
    const verdict = await page.locator(".cl-verdict").innerText();
    verifie(/1 refus sur \d+ livraisons? tentées? \(\d+ %\)/.test(verdict) && (await page.locator(".cl-verdict-chiffres").innerText()).includes("1 refus"),
      `un refus, compté par la base, dit en tête de fiche (« ${verdict.split("\n")[0]} »)`);
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
    verifie((await ok()).includes("(Préparation) : envoyez-lui le lien"), `« ${await ok()} »`);
    lienVendeur = (await page.locator("#lien-acces").inputValue()).trim();
    verifie(new URL(lienVendeur).pathname === "/bienvenue" && (new URL(lienVendeur).searchParams.get("jeton") ?? "").length > 40,
      "un lien d'invitation, à transmettre par WhatsApp");
    verifie((await page.locator(".membre", { hasText: vendeur }).innerText()).includes("Invitation en attente"), "l'employé est en attente");
    await capture(page, "gestion-equipe");
    // Le même lien, envoyé aussi par e-mail : au nom de Maymar, pas de SkanEcom.
    await envoie(page.getByRole("button", { name: "Envoyer par e-mail" }));
    verifie((await ok()).includes(`Lien envoyé par e-mail à ${vendeur}`), `« ${await ok()} »`);
    const rendu = await (await fetch(`${process.env.RELAIS ?? "http://127.0.0.1:54321"}/email-dev/rendu/dernier?email=${encodeURIComponent(vendeur)}`)).json();
    verifie(rendu.nom === "Maymar" && rendu.sujet.includes("Maymar") && rendu.texte.includes(lienVendeur),
      `l'e-mail part au nom de la boutique (« ${rendu.nom} », « ${rendu.sujet} »), avec le lien`);
  });

  await etape("l'employé ouvre son lien et arrive dans le backoffice", async () => {
    const tel = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
    const p = await tel.newPage();
    t.espion(p, "vendeur", attendue);
    await p.goto(lienVendeur, { waitUntil: "networkidle" });
    await p.locator("#mot_de_passe").fill("le colis part demain");
    await p.locator("#confirmation").fill("le colis part demain");
    await p.getByRole("button", { name: "Enregistrer et entrer" }).tap();
    await entre(p, "maymar");
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
if (section("3")) {
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR",
  });
  const page = await ctx.newPage();
  t.espion(page, "appels-telephone", attendue);

  await etape("la liste au doigt, l'appel en un geste", async () => {
    await connexion(page, "appels@maymar.test", true);
    await entre(page, "maymar");
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
    await t.envoie(page, () => page.getByRole("button", { name: "À rappeler" }).tap());
    await page.waitForURL(/fait=appel-rappeler/);
    verifie((await message(page)).includes("à rappeler"), "noté : à rappeler");
    await capture(page, "gestion-telephone-rappeler");
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 4. Le gérant de la quincaillerie : un devis chiffré et envoyé ==");
if (section("4")) {
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "gerant-quincaillerie");

  await etape("connexion, double authentification", async () => {
    await connexion(page, "gerant@quincaillerie.test");
    await page.waitForURL(/double-authentification/, { timeout: 15000 });
    const secret = (await page.locator("[data-secret-totp]").textContent()).trim();
    await clic(page, page.locator("#code"));
    await tape(page, totp(secret));
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/gestion\/quincaillerie-demo\/compte/, { timeout: 15000 });
    verifie(true, "le propriétaire de la quincaillerie entre dans son backoffice (ses codes de secours d'abord)");
    await page.goto(`${C}/gestion/quincaillerie-demo`, { waitUntil: "networkidle" });
  });

  await etape("les devis : la demande du plombier, chiffrée et envoyée", async () => {
    const nav = page.getByRole("navigation").getByRole("link", { name: /^Devis/ }).first();
    verifie((await nav.innerText()).includes("1"), "« Devis » porte la pastille de la demande à chiffrer");
    await clic(page, nav);
    await page.waitForURL(/\/devis$/);
    await page.waitForLoadState("networkidle");
    await capture(page, "gestion-devis-liste");
    await clic(page, page.locator(".dv-ligne-lien", { hasText: "DEV-00001" }));
    await page.waitForURL(/\/devis\/DEV-00001$/);
    await page.waitForLoadState("networkidle");
    verifie((await page.locator(".dv-demande").innerText()).includes("salles de bains"), "la fiche : ce que le client a écrit");
    verifie((await page.locator(".dv-ligne").count()) === 3, "trois lignes, chacune avec son stock et son prix catalogue");
    const premier = page.locator(".dv-ligne input[name^='prix:']").first();
    verifie((await premier.inputValue()) === "19,000", "le prix pro est proposé d'emblée (la boîte de 200 vis : 19,000)");
    await clic(page, page.locator("#dv-remise"));
    await tape(page, "10");
    await clic(page, page.getByRole("button", { name: "Appliquer à toutes les lignes" }));
    verifie((await premier.inputValue()) === "19,800", "10 % sous le catalogue, sur chaque ligne (22,000 → 19,800)");
    await clic(page, page.locator("input[name=frais_mode][value=offerte]"));
    verifie((await page.locator(".dv-ecart dd").innerText()).includes("−10"), "l'écart au catalogue se lit pendant la saisie");
    await capture(page, "gestion-devis-chiffrage");
    await t.envoie(page, page.getByRole("button", { name: "Envoyer le devis" }));
    await page.waitForURL(/ok=/, { timeout: 15000 });
    verifie((await page.locator(".message-succes").first().innerText()).includes("Devis envoyé"), "envoyé : le client le voit dans son compte");
    const wa = decodeURIComponent((await page.locator("a[href^='https://wa.me/']").first().getAttribute("href")) ?? "");
    verifie(wa.includes("Votre devis DEV-00001 est prêt"), "le message WhatsApp est prêt, avec le total et la validité");
    verifie((await page.locator(".ui-etat", { hasText: "Envoyé" }).count()) >= 1, "la fiche dit « Envoyé »");
    await capture(page, "gestion-devis-envoye");
  });

  // Les pages s'écrivent dans l'éditeur de la vitrine (panneau Pages), à
  // côté de la vraie vitrine, et partent en ligne avec le reste à « Publier ».
  const VQ = t.adresse("quincaillerie.localhost");
  const cadreQ = () => page.frames().find((f) => f.url().startsWith(VQ));
  const etatPage = () => page.locator(".pp-etat-envoi").innerText().catch(() => "");

  await etape("les pages de la boutique, dans l'éditeur : les siennes, les modèles, celles d'office", async () => {
    verifie(await page.locator(".app-cote a[href$='/pages']").count() === 0, "plus d'écran « Pages » à part : elles sont dans l'éditeur");
    await clic(page, page.locator(".app-cote").getByRole("link", { name: "Éditeur de la vitrine" }));
    await page.waitForURL(/\/apparence/);
    await page.waitForLoadState("networkidle");
    await clic(page, page.getByRole("tab", { name: "Pages" }));
    const titres = await page.locator(".pp-ligne-texte b").allInnerTexts();
    verifie(titres.join(" · ") === "Questions fréquentes · Le magasin", `ses deux pages, dans l'ordre du pied de page (${titres.join(" · ")})`);
    verifie(await page.locator(".pp-modeles .ac-modele", { hasText: "Livraison et retours" }).count() === 1, "le modèle qu'elle n'a pas encore écrit lui est proposé");
    await clic(page, page.locator(".pp-office summary"));
    verifie((await page.locator(".pp-office").innerText()).includes("Garantie et SAV"), "les pages d'office, dont la garantie (module SAV), avec leurs réglages");
    await capture(page, "gestion-pages", true);
  });

  await etape("une page d'après un modèle : créée, écrite à côté de la vitrine, publiée", async () => {
    await clic(page, page.locator(".pp-modeles .ac-modele", { hasText: "Livraison et retours" }));
    verifie(await page.locator("#pp-nouveau-slug").inputValue() === "livraison-et-retours", "l'adresse est posée");
    await page.locator("#pp-nouveau-slug").fill("contact");
    await clic(page, page.getByRole("button", { name: "Créer la page" }));
    verifie((await page.locator(".pp-ecriture .pg-erreur").first().innerText().catch(() => "")).includes("déjà une page"),
      "« /contact » : refusée sous le champ, avant tout envoi");
    await page.locator("#pp-nouveau-slug").fill("livraison-et-retours");
    await clic(page, page.getByRole("button", { name: "Créer la page" }));
    const corps = page.locator("#pp-corps");
    await corps.waitFor({ timeout: 10000 });
    verifie((await corps.inputValue()).includes("au magasin de Sfax"), "le texte vient des réglages : le retrait au magasin de Sfax");
    verifie(((await corps.inputValue()).split("## Retrait")[0].match(/dès \S+\sTND/g) ?? []).length === 1, "le seuil de la livraison offerte n'y est dit qu'une fois");
    await page.locator("#pp-titre").press("Enter");
    await pause(600);
    verifie(!(await page.locator(".ap-retour").first().innerText().catch(() => "")).includes("publiée") && await page.locator("#pp-titre").count() === 1,
      "Entrée dans le titre : rien n'est publié, l'écriture reste ouverte");
    verifie(await attend(async () => (cadreQ()?.url() ?? "").includes("/livraison-et-retours"), 12000), "la vitrine du cadre ouvre la page neuve, encore hors ligne");
    verifie(await attend(async () => ((await cadreQ()?.locator("h1").first().innerText().catch(() => "")) ?? "").includes("Livraison"), 12000),
      "et la montre telle qu'elle sera");
    await clic(page, corps);
    await page.keyboard.press("Control+End");
    await tape(page, "\n\nUne question ? Appelez le magasin.");
    await page.keyboard.press("Shift+Home");
    await page.keyboard.press("Control+b");
    await pause(300);
    verifie((await corps.inputValue()).endsWith("**Une question ? Appelez le magasin.**"), "Ctrl+B met la ligne choisie en gras");
    verifie(await attend(async () => (await etatPage()).includes("Dans le brouillon"), 12000), "une seconde plus tard : dans le brouillon");
    verifie(await attend(async () => ((await cadreQ()?.locator("main strong", { hasText: "Appelez le magasin" }).count().catch(() => 0)) ?? 0) === 1, 12000),
      "la vitrine du cadre suit la frappe");
    // Par le navigateur : lui seul résout les domaines *.localhost des boutiques.
    const visiteur = await ctx.newPage();
    const avant = await visiteur.goto(`${VQ}/livraison-et-retours?apercu=fin`, { waitUntil: "domcontentloaded" });
    verifie(avant?.status() === 404, `hors ligne tant que ce n'est pas publié (HTTP ${avant?.status()})`);
    await visiteur.close();
    await capture(page, "gestion-page-brouillon", true);
    await clic(page, page.getByRole("button", { name: "Publier" }));
    verifie(await attend(async () => (await page.locator(".ap-retour").first().innerText().catch(() => "")).includes("publiée"), 10000), "« Publier » : la page part avec le reste");
    const vitrine = await ctx.newPage();
    const r = await vitrine.goto(`${VQ}/livraison-et-retours?apercu=fin`, { waitUntil: "domcontentloaded" });
    verifie(r?.status() === 200 && (await vitrine.locator("main").innerText()).includes("Appelez le magasin"), `la vitrine la sert à son adresse, aussitôt (HTTP ${r?.status()})`);
    verifie((await vitrine.locator("footer[data-zone=pied]").innerText()).includes("Livraison et retours"), "et son lien est au pied de page");
    await vitrine.close();
  });

  await etape("deux écrans sur la même page : pas d'écrasement", async () => {
    const autre = await ctx.newPage();
    t.espion(autre, "gerant-quincaillerie-2");
    await autre.goto(page.url().replace(/\?.*$/, "") + "?panneau=pages", { waitUntil: "networkidle" });
    await autre.locator(".pp-ligne", { hasText: "Livraison et retours" }).click();
    await autre.locator("#pp-titre").fill("Livraison, retrait et retours");
    await autre.locator(".pp-etat-envoi", { hasText: "Dans le brouillon" }).waitFor({ timeout: 12000 });
    await autre.getByRole("button", { name: "Publier" }).click();
    await autre.locator(".ap-retour", { hasText: "publiée" }).waitFor({ timeout: 12000 });
    await autre.close();
    await page.locator("#pp-titre").fill("Livraison et retours, en bref");
    verifie(await attend(async () => (await etatPage()).includes("modifiée entre-temps"), 12000), "l'écran périmé est refusé, avec la marche à suivre");
    verifie(await page.locator("#pp-titre").inputValue() === "Livraison et retours, en bref", "et rien de ce qui a été tapé n'est perdu");
  });

  await etape("ranger, puis retirer une page", async () => {
    // Des changements non partis : le navigateur demande avant de partir.
    page.once("dialog", (d) => d.accept());
    await page.goto(page.url().replace(/\?.*$/, "") + "?panneau=pages", { waitUntil: "networkidle" });
    await t.envoie(page, page.getByRole("button", { name: "Monter « Livraison, retrait et retours »" }));
    verifie(await attend(async () => (await page.locator(".pp-ligne-texte b").allInnerTexts())[1] === "Livraison, retrait et retours", 8000),
      `montée d'un cran (${(await page.locator(".pp-ligne-texte b").allInnerTexts()).join(" · ")})`);
    verifie(await attend(async () => (await page.evaluate(() => document.activeElement?.getAttribute("data-geste"))) !== null, 3000), "le focus reste sur les flèches");
    await clic(page, page.locator(".pp-ligne", { hasText: "Livraison, retrait et retours" }));
    await clic(page, page.getByRole("button", { name: /^Retirer « Livraison, retrait et retours »/ }));
    await clic(page, page.getByRole("button", { name: "Retirer la page" }));
    verifie(await attend(async () => (await page.locator(".pp-ligne").count()) === 2, 10000), "retirée : la liste revient à deux pages");
    const visiteur = await ctx.newPage();
    const r = await visiteur.goto(`${VQ}/livraison-et-retours?apercu=fin`, { waitUntil: "domcontentloaded" });
    verifie(r?.status() === 404, `et la boutique ne la sert plus (HTTP ${r?.status()})`);
    await visiteur.close();
  });
  await ctx.close();
}

console.log("\n== 4 bis. La gérante de Maison Selma : codes promo, prix barrés, réassort ==");
if (section("4bis")) {
  // Selma a le module promotions (supabase/seed-promotions.sql). En CI, le
  // parcours de commande a pu se servir de BIENVENUE10 avant : rien ici ne
  // compte sur ses chiffres, seulement sur ceux des soldes de l'été (finis).
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "gerante-selma");
  const carte = (code) => page.locator(".pm-carte", { has: page.locator(".pm-ticket", { hasText: new RegExp(`^${code}$`) }) });
  const nouveau = () => page.locator("#nouveau form");

  await etape("connexion, double authentification", async () => {
    await connexion(page, "gerant@selma.test");
    await page.waitForURL(/double-authentification/, { timeout: 15000 });
    const secret = (await page.locator("[data-secret-totp]").textContent()).trim();
    await clic(page, page.locator("#code"));
    await tape(page, totp(secret));
    await page.keyboard.press("Enter");
    await entre(page, "maison-selma");
    verifie(true, "la gérante de Maison Selma entre dans son backoffice");
  });

  await etape("ses codes, et ce qu'ils ont rapporté", async () => {
    await clic(page, page.locator(".app-cote").getByRole("link", { name: "Promotions" }));
    await page.waitForURL(/\/promotions$/);
    await page.waitForLoadState("networkidle");
    verifie((await page.locator(".pm-section").first().locator(".pm-carte").count()) >= 4, "les codes en cours d'abord (quatre au jeu de démo)");
    verifie((await carte("VENTE-PRIVEE").locator(".ui-etat").innerText()).includes("Programmé"), "la vente privée attend son premier jour : programmée");
    const ete = (await carte("ETE25").innerText()).replace(/\s+/g, " ");
    verifie(ete.includes("Terminé") && ete.includes("3 commandes") && ete.includes("184,250"), `les soldes de l'été : finis, trois commandes, la remise accordée (${ete.slice(0, 140)})`);
    verifie((await carte("ETE25").getByRole("button", { name: "Couper" }).count()) === 0 && (await carte("ETE25").getByRole("button", { name: "Retirer" }).count()) === 0,
      "un code fini par ses dates se règle (pour le prolonger) ; il a servi : il ne se retire pas");
    const partage = decodeURIComponent((await carte("LIVRAISON").locator("a[href^='https://wa.me/']").getAttribute("href")) ?? "");
    verifie(partage.includes("code LIVRAISON") && partage.includes("la livraison offerte"), "« Partager » : le message WhatsApp prêt, avec le code et ce qu'il offre");
    await capture(page, "gestion-codes-promo", true);
  });

  await etape("un code créé au clavier, coupé, refusé en double, retiré", async () => {
    verifie(!(await page.locator("details#nouveau").evaluate((d) => d.open)), "le formulaire d'un nouveau code attend, replié, en tête de la liste");
    await clic(page, page.locator(".page-actions").getByRole("button", { name: "Nouveau code" }));
    verifie(await page.locator("details#nouveau").evaluate((d) => d.open) && await page.evaluate(() => document.activeElement?.getAttribute("name") === "code"),
      "« Nouveau code » l'ouvre, le curseur dans le code");
    await clic(page, nouveau().getByLabel("Le code"));
    await tape(page, "rentree 15");
    verifie((await nouveau().getByLabel("Le code").inputValue()) === "RENTREE15", "tapé « rentree 15 » : écrit RENTREE15, en capitales, sans espace");
    await clic(page, nouveau().getByLabel(/^Un montant/));
    await clic(page, nouveau().getByLabel("Le montant"));
    await tape(page, "15");
    await clic(page, nouveau().getByLabel(/^Dès/));
    await tape(page, "120");
    await t.envoie(page, nouveau().getByRole("button", { name: "Créer le code" }));
    verifie((await page.locator(".message-succes").first().innerText()).includes("Code RENTREE15 créé"), "créé : la page le dit");
    // Le défilement vers le code est doux (sauf « réduire les animations ») :
    // on le laisse arriver, comme l'œil qui le suit.
    const vu = await page.waitForFunction(() => {
      const c = document.activeElement?.closest(".pm-carte");
      const r = c?.getBoundingClientRect();
      return Boolean(c?.textContent?.includes("RENTREE15") && r && r.top >= 0 && r.bottom <= innerHeight);
    }, null, { timeout: 3000, polling: 100 }).then(() => true, () => false);
    verifie(vu, "l'écran va au code créé, en haut de la liste, et le focus aussi");
    verifie((await carte("RENTREE15").innerText()).includes("−15,000 TND") && (await carte("RENTREE15").innerText()).includes("dès 120,000 TND"), "ce qu'il offre, à quelle condition");
    await t.envoie(page, carte("RENTREE15").getByRole("button", { name: "Couper" }));
    verifie((await carte("RENTREE15").locator(".ui-etat").innerText()).includes("Coupé"), "coupé : il passe avec les codes finis, « Réactiver » à la place");
    // Créé, le formulaire s'est replié : « Nouveau code » le rouvre, comme on le ferait.
    verifie(!(await page.locator("details#nouveau").evaluate((d) => d.open)), "le code créé, le formulaire se replie : la liste reprend la place");
    await clic(page, page.locator(".page-actions").getByRole("button", { name: "Nouveau code" }));
    await tape(page, "rentree15");
    await clic(page, nouveau().getByLabel(/^Un pourcentage/));
    await clic(page, nouveau().getByLabel("La remise"));
    await tape(page, "5");
    await t.envoie(page, nouveau().getByRole("button", { name: "Créer le code" }));
    verifie((await page.getByRole("alert").first().innerText()).includes("existe déjà"), "le même code deux fois : refusé");
    const rappel = await page.evaluate(() => {
      const e = document.querySelector("#nouveau .geste-refus");
      const r = e?.getBoundingClientRect();
      return Boolean(e?.textContent?.includes("existe déjà") && r && r.top >= 0 && r.bottom <= innerHeight);
    });
    verifie(rappel, "le refus, affiché en tête de page hors de l'écran, est redit près du bouton");
    await t.envoie(page, carte("RENTREE15").getByRole("button", { name: "Retirer" }));
    verifie((await carte("RENTREE15").count()) === 0 && (await page.locator(".message-succes").first().innerText()).includes("retiré"), "jamais servi : il se retire");
    const r = await posteBrut(ctx, "/gestion/maison-selma/promotions/action", { geste: "enregistrer", code: "ENORME", type: "pourcentage", valeur: "95" });
    verifie(r.status === 303 && decodeURIComponent(r.location.replace(/\+/g, " ")).includes("1 à 90"), `95 % posté à la main : la base refuse (${r.status})`);
  });

  await etape("les prix barrés d'un rayon : l'aperçu, le lancement, la vitrine, la fin", async () => {
    await clic(page, page.locator("nav.onglets").getByRole("link", { name: "Prix barrés" }));
    await page.waitForURL(/\/prix-barres$/);
    await page.waitForLoadState("networkidle");
    verifie((await page.locator(".pb-reglage").innerText()).includes("n'affiche pas les prix barrés"), "la vitrine de Selma cache les prix barrés : l'écran le dit d'emblée");
    const form = page.locator("#nouvelle form").first();
    await clic(page, form.getByLabel("Le nom de l'opération"));
    await tape(page, "Promo de la rentrée");
    const maille = await form.locator("select[name=rayon] option", { hasText: /^Maille/ }).getAttribute("value");
    await form.locator("select[name=rayon]").selectOption(maille);
    await clic(page, form.getByLabel("La remise"));
    await tape(page, "20");
    await t.envoie(page, form.getByRole("button", { name: "Voir ce que ça change" }));
    const apercu = page.locator("#apercu");
    await apercu.waitFor({ timeout: 8000 }).catch(() => {});
    const texteApercu = (await apercu.innerText().catch(() => "")).replace(/\s+/g, " ");
    verifie(texteApercu.includes("8 déclinaisons") && texteApercu.includes("199,000") && texteApercu.includes("159,000 TND"),
      `« Voir ce que ça change » : huit déclinaisons, des exemples de prix (${texteApercu.slice(0, 110)})`);
    verifie(await page.evaluate(() => document.activeElement?.id === "apercu"), "l'écran va à l'aperçu, le focus aussi");
    verifie((await page.locator("#t-en-cours .compte-onglet").innerText()).trim() === "0", "rien n'est encore lancé");
    verifie(await apercu.getByLabel("Afficher les prix barrés sur la vitrine").isChecked(), "« afficher les prix barrés » proposé, déjà coché");
    await capture(page, "gestion-prix-barres-apercu");
    await t.envoie(page, apercu.getByRole("button", { name: /Lancer à −20\s%/ }));
    const lancee = (await page.locator(".message-succes").first().innerText()).replace(/\s+/g, " ");
    verifie(lancee.includes("« Promo de la rentrée » lancée : 8 déclinaisons à −20 %") && lancee.includes("affiche maintenant les prix barrés"),
      `lancée : la page le dit (${lancee.slice(0, 90)}…)`);
    const operation = page.locator(".pm-carte", { hasText: "Promo de la rentrée" });
    const vue = await page.waitForFunction(() => {
      const c = document.activeElement?.closest(".pm-carte");
      const r = c?.getBoundingClientRect();
      return Boolean(c?.textContent?.includes("Promo de la rentrée") && r && r.top >= 0 && r.bottom <= innerHeight);
    }, null, { timeout: 3000, polling: 100 }).then(() => true, () => false);
    verifie(vue && (await operation.innerText()).includes("En cours"), "l'écran va à l'opération, en cours, le focus aussi");
    verifie((await page.locator(".pb-reglage").count()) === 0, "le réglage des prix barrés s'est allumé du même geste");

    // La vitrine. En CI, le parcours humain a vu ce rayon bien avant : une
    // page vue il y a plus de cinq minutes (revalidate = 300) sert encore
    // l'ancienne version une fois, le temps de se refaire.
    const vitrine = await ctx.newPage();
    t.espion(vitrine, "vitrine-prix-barres");
    const SE = t.adresse("mode.localhost");
    let rayon = "";
    for (let i = 0; i < 3 && !/−20\s%/.test(rayon); i++) {
      if (i) await pause(1500);
      await vitrine.goto(SE + "/categorie/maille", { waitUntil: "networkidle" });
      rayon = await vitrine.locator("main").innerText();
    }
    verifie(/−20\s%/.test(rayon), "la vitrine : les pièces de la maille marquées −20 %");
    await clic(vitrine, vitrine.locator(".ed-carte").first());
    await vitrine.waitForURL(/\/produit\//);
    await vitrine.waitForLoadState("networkidle");
    const barre = await vitrine.locator(".prix-barre").first().innerText().catch(() => "");
    verifie(/\d/.test(barre), `la fiche : l'ancien prix barré à côté du nouveau (${barre})`);
    await capture(vitrine, "vitrine-prix-barres-fiche");
    await vitrine.close();

    await clic(page, operation.locator("summary", { hasText: "Terminer" }));
    await t.envoie(page, operation.getByRole("button", { name: "Terminer et rendre les prix" }));
    verifie((await page.locator(".message-succes").first().innerText()).includes("« Promo de la rentrée » terminée : 8 prix rendus"), "terminée : les huit prix rendus");
    verifie((await operation.innerText()).includes("Terminée") && (await operation.getByRole("button").count()) === 0,
      "elle passe avec les terminées, sans geste");
  });
  await etape("le réassort : qui prévenir, le message prêt, le retour d'une pièce", async () => {
    const lien = page.locator(".app-cote").getByRole("link", { name: /^Réassort/ });
    const nav = (await lien.innerText()).replace(/\s+/g, " ");
    verifie(/Réassort\s*2/.test(nav), `la navigation : « Réassort », deux personnes à prévenir (${nav})`);
    await clic(page, lien);
    await page.waitForURL(/\/reassort$/);
    await page.waitForLoadState("networkidle");
    const chemise = page.locator(".ra-piece", { hasText: "Chemise en popeline de coton" }).filter({ hasText: "Bleu ciel · M" });
    const whatsapp = decodeURIComponent((await chemise.locator("a[href^='https://wa.me/']").first().getAttribute("href")) ?? "");
    verifie(whatsapp.includes("wa.me/21620400104") && whatsapp.includes("est de retour chez Maison Selma") && whatsapp.includes("/produit/chemise-popeline"),
      "de retour : le message WhatsApp prêt — la pièce, la boutique, le lien de sa fiche");
    verifie(((await chemise.locator("a[href^='mailto:']").getAttribute("href")) ?? "").startsWith("mailto:yasmine.demo@exemple.tn"), "et l'e-mail, pour qui l'a laissé");
    await capture(page, "gestion-reassort", true);
    await t.envoie(page, chemise.locator(".ra-contact").first().getByRole("button", { name: "Prévenue" }));
    verifie((await page.locator(".message-succes").first().innerText()).includes("Prévenue : son contact est effacé"), "« Prévenue » : son contact s'efface");
    verifie((await chemise.locator(".ra-contact").count()) === 1, "il reste une personne à prévenir");

    const robe = page.locator(".ra-piece", { hasText: "Robe midi en jersey" });
    verifie((await robe.innerText()).replace(/\s+/g, " ").includes("3 personnes l'attendent"), "attendue : la robe midi en XL, trois personnes");
    await clic(page, robe.getByRole("link", { name: "Réceptionner un arrivage" }));
    await page.waitForURL(/\/produits\/[0-9a-f-]{36}/);
    await page.waitForLoadState("networkidle");
    const xl = page.locator(".var", { hasText: "SEL03-GRI-XL" });
    await clic(page, xl.locator("summary", { hasText: "Mouvement de stock" }));
    await clic(page, xl.locator("input[name=quantite]"));
    await tape(page, "4");
    await t.envoie(page, xl.getByRole("button", { name: "Valider" }));
    verifie((await page.locator(".message-succes").first().innerText()).includes("Réception de 4 pièces"), "un arrivage de quatre robes en XL");
    await clic(page, page.locator(".app-cote").getByRole("link", { name: /^Réassort/ }));
    await page.waitForURL(/\/reassort$/);
    await page.waitForLoadState("networkidle");
    const revenue = page.locator(".ra-piece[data-revenue]", { hasText: "Robe midi en jersey" });
    verifie((await revenue.locator(".ra-contact").count()) === 3, "l'arrivage : les trois personnes passent « à prévenir »");
    await t.envoie(page, revenue.getByRole("button", { name: "Toutes prévenues" }));
    verifie((await page.locator(".message-succes").first().innerText()).includes("3 personnes prévenues"), "« Toutes prévenues » : trois contacts effacés d'un geste");
  });

  await etape("les paniers abandonnés : qui relancer, le message prêt, une fois", async () => {
    const lien = page.locator(".app-cote").getByRole("link", { name: /^Paniers/ });
    const nav = (await lien.innerText()).replace(/\s+/g, " ");
    const compte = Number(/Paniers\s*(\d+)/.exec(nav)?.[1] ?? 0);
    await clic(page, lien);
    await page.waitForURL(/\/paniers$/);
    await page.waitForLoadState("networkidle");
    const aRelancer = page.locator("section[aria-labelledby='t-a-relancer'] .pn-panier");
    verifie(compte >= 2 && (await aRelancer.count()) === compte, `la navigation compte les paniers à relancer, l'écran les montre (${nav})`);
    const premier = aRelancer.filter({ hasText: "20 700 101" });
    const texte = (await premier.innerText()).replace(/\s+/g, " ");
    verifie(texte.includes("Robe à bretelles en lin") && texte.includes("Pull col rond en laine mérinos") && texte.includes("418,000 TND") && /Laissé il y a \d+ h/.test(texte),
      `le panier : ce qu'il contient, son montant, depuis quand (${texte.slice(0, 140)})`);
    const whatsapp = decodeURIComponent((await premier.locator("a[href^='https://wa.me/']").getAttribute("href")) ?? "");
    verifie(whatsapp.includes("wa.me/21620700101") && whatsapp.includes("vous aviez laissé un panier chez Maison Selma") && /\/panier\/[0-9a-f-]{36}/.test(whatsapp),
      "le message WhatsApp prêt : le panier, la boutique, le lien qui le remet dans le navigateur");
    await capture(page, "gestion-paniers", true);
    await t.envoie(page, premier.getByRole("button", { name: "Relancé" }));
    verifie((await page.locator(".message-succes").first().innerText()).includes("Relancé"), "« Relancé » : la page le dit");
    const relance = page.locator("section[aria-labelledby='t-relances'] .pn-panier", { hasText: "20 700 101" });
    verifie((await relance.count()) === 1 && (await relance.getByRole("button").count()) === 0 && (await relance.innerText()).includes("Pas de commande depuis la relance"),
      "il passe avec les paniers relancés, sans plus de bouton : une fois pour toutes");
    const r = await posteBrut(ctx, "/gestion/maison-selma/paniers/action", { geste: "relance", panier: (await relance.getAttribute("id")).replace("panier-", "") });
    verifie(r.status === 303 && decodeURIComponent(r.location.replace(/\+/g, " ")).includes("déjà été traité"), `relancer deux fois, posté à la main : la base refuse (${r.status})`);
    // Le lien du message, ouvert sur un autre téléphone : le panier revient.
    const adresse = /https?:\/\/\S+\/panier\/[0-9a-f-]{36}/.exec(whatsapp)?.[0] ?? "";
    verifie(adresse !== "", `le message porte le lien du panier (${adresse || "absent"})`);
    const autre = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
    const tel = await autre.newPage();
    t.espion(tel, "selma-reprise");
    await tel.goto(adresse, { waitUntil: "networkidle" });
    const repris = (await tel.locator(".reprise .tunnel-ligne").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
    verifie(repris.length === 2 && repris[0].includes("Robe à bretelles en lin") && repris[1].includes("Pull col rond"),
      `sur un autre téléphone, le lien montre le panier (${repris.join(" | ").slice(0, 120)})`);
    await capture(tel, "gestion-paniers-lien");
    await tel.getByRole("button", { name: "Reprendre ma commande" }).tap();
    await tel.waitForURL(/\/commande$/);
    await tel.locator(".tunnel-ligne").first().waitFor({ state: "attached" });
    verifie((await tel.locator(".tunnel-ligne").count()) === 2, "« Reprendre ma commande » : le tunnel s'ouvre, le panier dedans");
    await autre.close();
  });

  await etape("les visites de la vitrine : combien, d'où, sur quoi, et la conversion", async () => {
    const lien = page.locator(".app-cote").getByRole("link", { name: "Visites" });
    verifie((await lien.count()) === 1, "Selma mesure son audience : « Visites » dans la navigation");
    await clic(page, lien);
    await page.waitForURL(/\/visites$/);
    await page.waitForLoadState("networkidle");
    const chiffres = (await page.locator(".tb-chiffre .tb-libelle").allInnerTexts()).join(" · ");
    verifie(chiffres === "Visiteurs · Pages vues · Commandes · Conversion", `les quatre chiffres (${chiffres})`);
    // Le compteur monte de zéro : on le lit une fois arrêté.
    const valeur = page.locator(".tb-chiffre").first().locator(".tb-valeur");
    let visiteurs = -1;
    for (let i = 0; i < 20; i++) {
      const lu = Number((await valeur.innerText()).replace(/\D/g, ""));
      if (lu === visiteurs) break;
      visiteurs = lu;
      await pause(250);
    }
    verifie(visiteurs > 500, `les visiteurs des trente derniers jours (${visiteurs})`);
    verifie((await page.locator(".tb-barres li").count()) === 30, "trente jours, jour par jour");
    const sources = await page.locator(".vi-sources .tb-origine-nom").allInnerTexts();
    verifie(sources.includes("Instagram") && sources.includes("Direct ou lien partagé") && new Set(sources).size === sources.length,
      `les sources, chacune une fois (${sources.join(", ")})`);
    verifie((await page.locator(".vi-pages .tb-produit-nom").allInnerTexts()).includes("Robe à bretelles en lin"), "les pages, sous le nom du produit qu'elles montrent");
    await capture(page, "gestion-visites", true);
    // Jusqu'où vont les visiteurs, et les campagnes (supabase/seed-entonnoir.sql).
    const etapes = await page.locator(".vi-entonnoir .vi-etape-nom").allInnerTexts();
    verifie(etapes.join(" · ") === "Visiteurs · Ont vu une fiche · Ont ajouté au panier · Ont ouvert la commande · Ont commandé",
      `le chemin vers la commande, en cinq étapes (${etapes.length})`);
    const n = (await page.locator(".vi-entonnoir .vi-etape-n").allInnerTexts()).map((x) => Number(x.replace(/\D/g, "")));
    verifie(n.length === 5 && n.every((x, i) => i === 0 || x <= n[i - 1]), `chaque étape, au plus l'étape d'avant (${n.join(" → ")})`);
    verifie((await page.locator(".vi-perte").innerText().catch(() => "")).includes("qu'on perd le plus de monde"), "et où l'on perd le plus de monde");
    const campagnes = await page.locator(".vi-campagnes .vi-campagne-nom").allInnerTexts();
    verifie(campagnes.includes("lin-d-ete") && campagnes.includes("vente-privee"), `les campagnes de la période (${campagnes.join(", ")})`);
    await clic(page, page.locator(".vi-composer > summary"));
    await page.getByLabel("Où vous le publiez").selectOption("facebook");
    await clic(page, page.getByLabel("Le nom de la campagne"));
    await tape(page, "Soldes d'Été");
    const lienCampagne = await page.locator(".vi-lien-adresse").innerText();
    verifie(/\?utm_source=facebook&utm_campaign=soldes-d-ete$/.test(lienCampagne), `le lien de campagne s'écrit à mesure (${lienCampagne})`);
    await clic(page, page.getByRole("link", { name: "7 jours" }));
    await page.waitForURL(/jours=7/);
    await page.waitForLoadState("networkidle");
    verifie((await page.locator(".tb-barres li").count()) === 7, "sept jours : sept barres");
  });

  await etape("l'objectif du mois : la jauge, le rythme, le changer au clavier", async () => {
    // Selma vise un chiffre chaque mois (supabase/seed-objectif.sql).
    const lisible = (x) => x.replace(/\s+/g, " ");
    await page.goto(`${C}/gestion/maison-selma/tableau`, { waitUntil: "networkidle" });
    const carte = page.locator("#objectif");
    verifie(/^Objectif d/.test(await carte.locator("#ob-titre").innerText()) && (await carte.locator(".ob-jauge").count()) === 1,
      "en tête du tableau de bord, l'objectif du mois et sa jauge");
    verifie((await carte.locator(".ob-histoire li").count()) === 6, "les six mois d'avant, visés et livrés");
    await clic(page, carte.getByText("Changer…"));
    const champ = carte.locator('input[name="montant"]').first();
    await champ.fill("");
    await clic(page, champ);
    await tape(page, "4800");
    await t.envoie(page, () => page.keyboard.press("Enter"));
    verifie(lisible(await page.locator(".message-succes").first().innerText()).includes("4 800 TND"), "Entrée : l'objectif est changé, la page le dit");
    verifie(lisible(await page.locator(".ob-chiffres").innerText()).includes("sur 4 800 TND"), "la jauge se mesure au nouveau chiffre");
    await capture(page, "gestion-objectif");
  });

  // L'accueil se compose dans l'éditeur de la vitrine, la vraie vitrine à côté.
  const VS = t.adresse("mode.localhost");
  const cadreSelma = () => page.frames().find((f) => f.url().startsWith(VS));
  const statutEditeur = () => page.locator(".ap-statut").innerText().catch(() => "");
  const attendre = async (fn, ms = 8000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await fn().catch(() => false)) return true; await pause(150); } return false; };
  const plan = () => page.locator(".pa-liste .ac-section-texte > b").evaluateAll((l) => l.map((b) => b.firstChild?.textContent?.trim() ?? ""));
  const titresCadre = async () => (await cadreSelma()?.evaluate(() => [...document.querySelectorAll("main h2")].map((h) => h.textContent.replace(/\s+/g, " ").trim())).catch(() => null)) ?? [];
  const avantRecit = async () => {
    const h = await titresCadre();
    const avis = h.findIndex((x) => x.startsWith("Ce qu'en disent"));
    const recit = h.findIndex((x) => x.startsWith("Moins de pièces"));
    return avis >= 0 && recit >= 0 ? avis < recit : null;
  };
  const brouillonEnregistre = () => attendre(async () => (await statutEditeur()).includes("Brouillon enregistré"), 10000);

  await etape("l'accueil, dans l'éditeur de la vitrine : le composer au clavier", async () => {
    // Selma montre ses avis et ses questions (supabase/seed-accueil.sql).
    // L'ancienne adresse de l'écran « Page d'accueil » mène à l'éditeur, sur l'accueil.
    await page.goto(`${C}/gestion/maison-selma/accueil`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/apparence\?panneau=accueil$/);
    verifie(await page.getByRole("tab", { name: "Accueil" }).getAttribute("aria-selected") === "true", "« Page d'accueil » mène à l'éditeur de la vitrine, sur l'accueil");
    verifie(await attendre(async () => (await avantRecit()) === false, 15000), "à côté, la vitrine de Selma : le récit, puis les avis");
    const avant = await plan();
    verifie(avant.includes("Avis clients") && avant.includes("Questions fréquentes"), `l'accueil de haut en bas (${avant.join(" > ")})`);
    await clic(page, page.getByRole("button", { name: "Ajouter une section" }));
    verifie((await page.locator(".pa-modeles .ac-modele").count()) === 12, "« Ajouter une section » : la bibliothèque, douze sections (bannières, lookbook et pièce de la saison compris)");
    verifie(await page.locator(".pa-modeles .ac-modele", { hasText: "Avis clients" }).isDisabled(), "une section déjà posée ne s'ajoute pas deux fois");
    await clic(page, page.getByRole("button", { name: "Ajouter une section" }));
    await page.getByRole("button", { name: "Monter « Avis clients »" }).focus();
    await page.keyboard.press("Enter");
    const apres = await plan();
    verifie(apres.indexOf("Avis clients") === avant.indexOf("Avis clients") - 1, "Entrée : la section monte d'un cran");
    verifie(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Monter « Avis clients »", "le focus la suit");
    await cadreSelma().evaluate(() => { window.__sansRecharger = true; });
    verifie(await brouillonEnregistre(), "le brouillon s'enregistre de lui-même");
    verifie(await attendre(async () => (await avantRecit()) === true, 12000), "l'aperçu se rend de nouveau : les avis passent avant le récit");
    verifie(await cadreSelma().evaluate(() => window.__sansRecharger === true), "rafraîchi sur place, sans recharger la page du cadre");
    await page.reload({ waitUntil: "networkidle" });
    await clic(page, page.getByRole("tab", { name: "Accueil" }));
    verifie(JSON.stringify(await plan()) === JSON.stringify(apres), "la page rechargée : la composition est dans le brouillon");
    await capture(page, "editeur-accueil", true);
    // Retirer, rétablir ; puis l'ordre d'avant.
    await clic(page, page.getByRole("button", { name: "Retirer « Questions fréquentes »" }));
    verifie(!(await plan()).includes("Questions fréquentes"), "retirée de l'accueil");
    await clic(page, page.locator(".pa-retour").getByRole("button", { name: "Rétablir" }));
    verifie(JSON.stringify(await plan()) === JSON.stringify(apres), "rétablie à sa place");
    await clic(page, page.getByRole("button", { name: "Descendre « Avis clients »" }));
    verifie(JSON.stringify(await plan()) === JSON.stringify(avant), "l'ordre d'avant");
    verifie(await attendre(async () => (await avantRecit()) === false, 12000), "et l'aperçu le suit");
  });

  await etape("cliquer une section sur l'aperçu la règle ; le titre tapé y paraît", async () => {
    const f = cadreSelma();
    const section = f.locator("[data-section]", { has: f.locator("h2", { hasText: /^Ce qu'en disent/ }) }).first();
    await section.scrollIntoViewIfNeeded();
    await section.hover({ position: { x: 60, y: 30 } });
    verifie(await attendre(async () => (await f.locator("#ap-nom-section").innerText()) === "Avis clients", 4000), "au survol, la section se signale par son nom");
    await capture(page, "editeur-accueil-survol");
    const url = f.url();
    await section.click({ position: { x: 60, y: 30 } });
    verifie(await attendre(async () => (await page.locator(".pa-liste .ac-section[data-ouverte] .ac-section-texte > b").innerText()).startsWith("Avis clients"), 4000),
      "un clic sur l'aperçu : ses réglages s'ouvrent dans le panneau");
    verifie(cadreSelma().url() === url, "et l'aperçu ne suit pas ses liens");
    const champ = page.locator(".pa-liste .ac-section[data-ouverte]").getByLabel("Titre", { exact: true });
    await clic(page, champ);
    await tape(page, "Elles l'ont portée");
    verifie(await attendre(async () => (await titresCadre()).includes("Elles l'ont portée"), 12000), "le titre tapé paraît dans l'aperçu, une seconde plus tard");
    await capture(page, "editeur-accueil-titre");
    await clic(page, page.getByRole("button", { name: "Défaire" }));
    verifie(await attendre(async () => !(await titresCadre()).includes("Elles l'ont portée") && (await titresCadre()).some((x) => x.startsWith("Ce qu'en disent")), 12000),
      "« Défaire » : toute la frappe d'un coup, le titre d'avant revient");
  });

  await etape("le lookbook, dans l'éditeur : un point déplacé au clavier, l'aperçu le suit", async () => {
    // Selma est en Immersif, avec un lookbook d'un point (supabase/seed-immersif.sql).
    const b = page.locator(".pa-liste [data-geste='ouvrir']", { hasText: "Lookbook" });
    if ((await b.getAttribute("aria-expanded")) !== "true") await clic(page, b);
    const point = page.locator(".pa-liste .ac-section[data-ouverte] .pl-point").first();
    verifie(/Combishort.*46 %.*32 %/.test(await point.getAttribute("aria-label")), "le point du combishort, à sa place (46 %, 32 %)");
    const cadreLeft = () => cadreSelma().evaluate(() => document.querySelector(".lk-point")?.style.left ?? "");
    verifie(await attendre(async () => (await cadreLeft()) === "46%", 8000), "le même point sur la photo de l'aperçu");
    await point.focus();
    await page.keyboard.press("Shift+ArrowRight");
    verifie(/51 %/.test(await point.getAttribute("aria-label")), "Maj+→ : le point avance de 5 %, et le dit");
    verifie(await brouillonEnregistre(), "le brouillon le garde");
    verifie(await attendre(async () => (await cadreLeft()) === "51%", 12000), "l'aperçu le suit, sans recharger");
    await capture(page, "editeur-lookbook-point");
    await clic(page, page.getByRole("button", { name: "Défaire" }));
    verifie(await attendre(async () => (await cadreLeft()) === "46%", 12000), "« Défaire » : le point revient sur la pièce");
  });

  await etape("les bannières, dans l'éditeur : ajoutées, une photo, deux bannières, l'aperçu les fait défiler", async () => {
    const photo = (l, h, c) => page.evaluate(([l, h, c]) => {
      const canvas = document.createElement("canvas");
      canvas.width = l; canvas.height = h;
      const g = canvas.getContext("2d");
      const d = g.createLinearGradient(0, 0, l, h);
      d.addColorStop(0, c); d.addColorStop(1, "#1f1f23");
      g.fillStyle = d; g.fillRect(0, 0, l, h);
      return canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
    }, [l, h, c]).then((b64) => Buffer.from(b64, "base64"));
    const diaposCadre = async () => (await cadreSelma()?.evaluate(() => [...document.querySelectorAll(".bnr .bnr-diapo")].map((d) => d.querySelector(".bnr-titre")?.textContent ?? "")).catch(() => null)) ?? [];
    await clic(page, page.getByRole("button", { name: "Ajouter une section" }));
    await clic(page, page.locator(".pa-modeles .ac-modele", { hasText: "Bannières" }));
    verifie((await plan()).at(-1) === "Bannières", "« Bannières » : ajoutée en bas de l'accueil, ouverte");
    const section = page.locator(".pa-liste .ac-section[data-ouverte]");
    const b1 = section.locator(".bd-diapo[data-diapo='0']");
    verifie((await section.locator(".bd-diapo").count()) === 1, "une première bannière, à régler");
    await b1.getByLabel("Choisir une photo").setInputFiles({ name: "IMG_4001.jpg", mimeType: "image/jpeg", buffer: await photo(3000, 1500, "#8a6d4a") });
    await b1.locator(".ac-photo > img").waitFor({ timeout: 20000 });
    const chemin = (await b1.locator(".ac-photo > img").getAttribute("src")).replace(/^.*\/fichiers\//, "");
    verifie(/^maison-selma\/accueil\/photo-[0-9a-f]{12}\.webp$/.test(chemin), `la photo de la bannière, déposée dans le dossier de la boutique : ${chemin}`);
    await clic(page, b1.getByLabel("Titre", { exact: true }));
    await tape(page, "La saison du lin");
    await b1.getByLabel("Le bouton mène à").selectOption("/catalogue");
    await clic(page, b1.getByLabel("Texte du bouton"));
    await tape(page, "Voir tout");
    await clic(page, section.getByRole("button", { name: "Ajouter une bannière" }));
    verifie(await page.evaluate(() => document.activeElement?.closest(".bd-diapo")?.getAttribute("data-diapo")) === "1", "« Ajouter une bannière » : la deuxième, le curseur dans son titre");
    await tape(page, "Payé à la livraison");
    verifie(await brouillonEnregistre(), "le brouillon les garde");
    verifie(await attendre(async () => JSON.stringify(await diaposCadre()) === JSON.stringify(["La saison du lin", "Payé à la livraison"]), 15000),
      `l'aperçu montre les deux bannières (${JSON.stringify(await diaposCadre())})`);
    verifie((await fichierLocal(chemin)).status === 200, "la photo de la bannière, employée par le brouillon, reste au dépôt");
    await cadreSelma().locator(".bnr").scrollIntoViewIfNeeded();
    await capture(page, "editeur-bannieres", true);
    await clic(page, section.getByRole("button", { name: "Monter la bannière 2" }));
    verifie(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Descendre la bannière 1", "montée en tête : le focus la suit");
    verifie(await attendre(async () => (await diaposCadre())[0] === "Payé à la livraison", 15000), "l'aperçu suit le nouvel ordre");
    await clic(page, page.getByRole("button", { name: "Retirer « Bannières »" }));
    verifie(!(await plan()).includes("Bannières"), "les bannières retirées de l'accueil");
    verifie(await attendre(async () => (await diaposCadre()).length === 0, 15000), "et de l'aperçu");
  });

  await etape("la photo d'ouverture, depuis l'éditeur : réduite, posée, publiée, puis retirée du dépôt", async () => {
    // Une « photo de téléphone » faite dans la page (JPEG).
    const photo = (l, h, c) => page.evaluate(([l, h, c]) => {
      const canvas = document.createElement("canvas");
      canvas.width = l; canvas.height = h;
      const g = canvas.getContext("2d");
      const d = g.createLinearGradient(0, 0, l, h);
      d.addColorStop(0, c); d.addColorStop(1, "#1f1f23");
      g.fillStyle = d; g.fillRect(0, 0, l, h);
      return canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
    }, [l, h, c]).then((b64) => Buffer.from(b64, "base64"));
    const vignette = () => page.locator(".pa-liste .ac-section[data-ouverte] .ac-photo > img");
    // Ouvrir l'ouverture (si elle ne l'est pas déjà : un clic de plus la refermerait).
    const ouvrirOuverture = async () => {
      const b = page.locator(".pa-liste [data-geste='ouvrir']", { hasText: "Ouverture" });
      if ((await b.getAttribute("aria-expanded")) !== "true") await clic(page, b);
    };
    // Le message « publiée » peut rester d'une publication d'avant : on attend la réponse de celle-ci.
    const publier = async () => {
      const reponse = page.waitForResponse((r) => r.request().method() === "POST" && /\/apparence\/action/.test(r.url())
        && (r.request().postData() ?? "").includes("publier"), { timeout: 15000 }).catch(() => null);
      await clic(page, page.getByRole("button", { name: "Publier" }));
      return !!(await reponse) && attendre(async () => (await page.locator(".ap-retour").first().innerText()).includes("publiée"), 12000);
    };
    await ouvrirOuverture();
    const demo = (await vignette().getAttribute("src")).replace(/^.*\/fichiers\//, "");
    await page.getByLabel("Changer la photo").setInputFiles({ name: "IMG_3001.jpg", mimeType: "image/jpeg", buffer: await photo(800, 500, "#a07050") });
    await page.locator(".ac-photo-erreur").waitFor({ timeout: 10000 });
    verifie((await page.locator(".ac-photo-erreur").innerText()).includes("trop petite"), "une photo trop petite : refusée avant l'envoi, la raison dite");
    await page.getByLabel("Changer la photo").setInputFiles({ name: "IMG_3002.jpg", mimeType: "image/jpeg", buffer: await photo(3000, 2000, "#6d8a9c") });
    await page.waitForFunction((d) => !document.querySelector(".pa-liste .ac-section[data-ouverte] .ac-photo > img")?.getAttribute("src")?.endsWith(d), demo, { timeout: 20000 });
    const chemin = (await vignette().getAttribute("src")).replace(/^.*\/fichiers\//, "");
    verifie(/^maison-selma\/accueil\/photo-[0-9a-f]{12}\.webp$/.test(chemin), `déposée dans le dossier de la boutique : ${chemin}`);
    const f = await fichierLocal(chemin);
    verifie(f.status === 200 && tailleWebp(f.octets)[0] === 2400, `réduite dans le navigateur, en WebP (${tailleWebp(f.octets).join(" × ")})`);
    verifie((await page.getByLabel("Choisir un cadrage").count()) === 1, "une autre photo, un autre sujet : son cadrage pour téléphone est à refaire");
    await page.getByLabel("Description de la photo").fill("Un dégradé bleu nuit");
    verifie(await attendre(async () => (await cadreSelma().evaluate((c) => [...document.querySelectorAll(".ed-ouverture img")].some((i) => (i.currentSrc || i.src).includes(c.split("/").pop())), chemin)), 15000),
      "l'aperçu montre la nouvelle photo, avant toute publication");
    verifie(await publier(), "« Publier » : la vitrine et son accueil, d'un coup");
    verifie((await fichierLocal(demo)).status === 200, "la photo de démonstration d'avant reste au dépôt (l'éditeur ne retire que les siennes)");
    await ouvrirOuverture();
    await clic(page, page.getByRole("button", { name: "Retirer la photo" }));
    verifie(await brouillonEnregistre(), "retirée : le brouillon le garde");
    verifie((await fichierLocal(chemin)).status === 200, "tant que ce n'est pas publié, la photo reste au dépôt (Ctrl+Z la retrouverait)");
    verifie(await publier(), "publié sans photo");
    verifie((await fichierLocal(chemin)).status === 404, "retirée et publiée : la photo quitte le dépôt");
    await capture(page, "editeur-accueil-photo");
    // « ← Backoffice » : le menu revient.
    await clic(page, page.locator(".ap-quitter"));
    await page.waitForURL(/\/gestion\/maison-selma$/);
    verifie(await page.locator(".app-cote").isVisible(), "« Backoffice » : retour au backoffice, le menu revient");
  });

  await etape("la lettre : les inscrits, une recherche, une adresse retirée à la demande", async () => {
    // Selma a une lettre (supabase/seed-lettre.sql) : 38 inscrits, plus ceux des parcours.
    const lien = page.locator(".app-cote").getByRole("link", { name: "Lettre" });
    verifie((await lien.count()) === 1, "Selma a une lettre : « Lettre » dans la navigation");
    await clic(page, lien);
    await page.waitForURL(/\/lettre$/);
    await page.waitForLoadState("networkidle");
    const libelles = (await page.locator(".tb-chiffre .tb-libelle").allInnerTexts()).join(" · ");
    verifie(libelles === "Inscrits · Nouveaux · À confirmer · Désinscrits", `les quatre chiffres (${libelles})`);
    verifie((await page.locator(".lt-barres li").count()) === 12, "douze semaines, semaine par semaine");
    const lignes = await page.locator(".lt-ligne").count();
    verifie(lignes >= 38, `les inscrits, les plus récents d'abord (${lignes})`);
    verifie((await page.getByRole("link", { name: "Exporter (CSV)" }).count()) === 1, "l'export, pour la propriétaire");
    await capture(page, "gestion-lettre", true);
    await clic(page, page.locator("#q"));
    await tape(page, "amira");
    await page.keyboard.press("Enter");
    await page.waitForURL(/q=amira/);
    await page.waitForLoadState("networkidle");
    const trouvee = page.locator(".lt-ligne");
    verifie((await trouvee.count()) === 1 && (await trouvee.first().innerText()).includes("amira.117@exemple.tn"), "« amira » : une adresse, et elle seule");
    await clic(page, trouvee.first().locator("summary"));
    verifie((await trouvee.first().innerText()).includes("Son adresse sera effacée"), "« Retirer… » demande d'abord : l'adresse sera effacée");
    await t.envoie(page, page.getByRole("button", { name: "Oui, retirer" }));
    verifie((await page.locator(".message-succes").first().innerText()).includes("Adresse retirée et effacée"), "retirée : la page le dit");
    verifie((await page.locator(".lt-ligne").count()) === 0, "et elle n'est plus dans la liste");
  });

  await etape("les photos d'un avis : les voir, en retirer une, l'avis reste", async () => {
    // Selma recueille des photos avec les avis (supabase/seed-avis-photos.sql) : l'avis du sac en a deux.
    await page.goto(`${C}/gestion/maison-selma/avis?filtre=publies`, { waitUntil: "networkidle" });
    const avis = page.locator(".av-carte", { hasText: "Le cuir est épais" });
    verifie((await avis.locator(".av-photo").count()) === 2, "l'avis du sac montre ses deux photos");
    await capture(page, "gestion-avis-photos");
    await t.envoie(page, avis.getByRole("button", { name: "Retirer la photo 2 de cet avis" }));
    verifie((await page.locator(".message-succes").first().innerText()).includes("Photo retirée"), "« Photo retirée » : la page le dit");
    verifie((await page.locator(".av-carte", { hasText: "Le cuir est épais" }).locator(".av-photo").count()) === 1, "l'avis reste, avec une photo");
    const fichier = await fetch(`${FICHIERS}/maison-selma/avis/sac-poche.webp`);
    verifie(fichier.status === 200, `une photo du jeu de démo n'est jamais effacée du dépôt (HTTP ${fichier.status})`);
  });

  await etape("les prix par quantité d'un pull : posés au clavier, vus sur la fiche, retirés", async () => {
    // Le pull en mérinos : 189,000 l'unité.
    await page.goto(`${C}/gestion/maison-selma/produits/00000000-0000-4000-8003-000000000109#paliers`, { waitUntil: "networkidle" });
    const bloc = page.locator("#paliers");
    verifie(!(await bloc.locator("details").evaluate((d) => d.open)), "sans prix par quantité, le bloc reste replié");
    await clic(page, bloc.getByRole("button", { name: "Poser des prix par quantité" }).or(bloc.locator("summary")).first());
    await clic(page, bloc.getByLabel("Pièces").first());
    await tape(page, "2");
    await clic(page, bloc.getByLabel(/Prix total/).first());
    await tape(page, "340,000");
    await clic(page, bloc.getByLabel("Pièces").nth(1));
    await tape(page, "3");
    await clic(page, bloc.getByLabel(/Prix total/).nth(1));
    await tape(page, "520,000");
    await t.envoie(page, bloc.getByRole("button", { name: "Enregistrer les prix par quantité" }));
    verifie((await page.locator(".message-erreur").first().innerText().catch(() => "")).includes("l'unité doit coûter moins"),
      "à 3 pièces, l'unité plus chère qu'à 2 : refusé, la raison dite");
    await bloc.getByLabel(/Prix total/).nth(1).fill("");
    await bloc.getByLabel("Pièces").nth(1).fill("");
    await clic(page, bloc.getByLabel(/Prix total/).first());
    await page.keyboard.press("Control+A");
    await tape(page, "340,000");
    await t.envoie(page, bloc.getByRole("button", { name: "Enregistrer les prix par quantité" }));
    verifie((await page.locator(".message-succes").first().innerText().catch(() => "")).includes("Prix par quantité enregistrés"), "2 pour 340,000 : enregistré");
    verifie((await bloc.innerText()).includes("170,000 TND l'unité"), "l'écran dit le prix à l'unité");
    await capture(page, "gestion-prix-quantite");
    // La fiche de la vitrine le propose, aussitôt.
    const v = await navigateur.newPage();
    await v.goto(`${VS}/produit/pull-merinos`, { waitUntil: "networkidle" });
    const offres = (await v.locator(".offres .offre").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
    verifie(offres.length === 2 && offres[1].includes("2 pièces") && offres[1].includes("340,000"), `la fiche propose « 2 pièces : 340,000 » (${offres.join(" | ")})`);
    await v.close();
    // Tout vider : plus de prix par quantité.
    await page.goto(`${C}/gestion/maison-selma/produits/00000000-0000-4000-8003-000000000109#paliers`, { waitUntil: "networkidle" });
    await bloc.getByLabel("Pièces").first().fill("");
    await bloc.getByLabel(/Prix total/).first().fill("");
    await t.envoie(page, bloc.getByRole("button", { name: "Enregistrer les prix par quantité" }));
    verifie((await page.locator(".message-succes").first().innerText().catch(() => "")).includes("Plus de prix par quantité"), "vidé : plus de prix par quantité");
  });

  await etape("la publicité : ses pixels, un identifiant illisible refusé sur place, un autre collé avec ses espaces", async () => {
    // Les pixels de Selma (supabase/seed-pixels.sql).
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const entetes = { apikey: cle, authorization: `Bearer ${cle}` };
    const lu = async (c) => (await (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/reglages?boutique_id=eq.00000000-0000-4000-8000-000000000003&cle=eq.${c}&select=valeur`, { headers: entetes })).json())[0]?.valeur;
    await page.goto(`${C}/gestion/maison-selma/reglages/publicite`, { waitUntil: "networkidle" });
    verifie((await page.locator("#pixel-meta").inputValue()) === "1000000000000003" && (await page.locator("#pixel-tiktok").inputValue()) === "CSELMA0000000000DEMO",
      "la section Publicité montre les deux pixels");
    const section = page.locator("section", { has: page.locator("#t-publicite") });
    await page.locator("#pixel-meta").focus();
    await page.keyboard.press("Control+a");
    await tape(page, "12345abc");
    await page.keyboard.press("Enter");
    await section.locator("[role=alert]").waitFor({ timeout: 8000 });
    const y = (await section.locator("[role=alert]").boundingBox())?.y ?? -1;
    verifie((await section.locator("[role=alert]").innerText()).includes("pixel Meta illisible") && y > 0 && y < 860 && (await lu("pub.pixel_meta")) === "1000000000000003",
      `Entrée : refusé, et le refus se lit dans la section, à l'écran (${Math.round(y)} px) ; le pixel d'avant reste`);
    await capture(page, "gestion-publicite-refus");
    await page.locator("#pixel-meta").focus();
    await page.keyboard.press("Control+a");
    await tape(page, "1234 5678 9012 3456");
    await page.keyboard.press("Enter");
    await section.locator("[role=status]").waitFor({ timeout: 8000 });
    verifie((await lu("pub.pixel_meta")) === "1234567890123456", "collé avec ses espaces : enregistré en chiffres seuls");
    // Le jeu de démo d'avant, pour la suite — tapé dès que le message paraît,
    // pendant l'animation : la saisie n'est ni effacée ni tenue pour un double envoi.
    await page.locator("#pixel-meta").focus();
    await page.keyboard.press("Control+a");
    await tape(page, "1000000000000003");
    await page.waitForFunction(() => !document.querySelector("form[data-envoi]") && !document.documentElement.hasAttribute("data-vt-geste"), null, { timeout: 5000 });
    verifie((await page.locator("#pixel-meta").inputValue()) === "1000000000000003", "la nouvelle saisie reste dans le champ, l'animation finie");
    await page.keyboard.press("Enter");
    // Le message d'avant est encore là : c'est la base qui dit quand c'est fait.
    for (let i = 0; i < 40 && (await lu("pub.pixel_meta")) !== "1000000000000003"; i++) await pause(250);
    verifie((await lu("pub.pixel_meta")) === "1000000000000003", "et remis comme avant");
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 5. Le préparateur d'une autre boutique ==");
if (section("5")) {
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 860 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "prepa", attendue);

  await etape("sa boutique, et ce que son rôle permet", async () => {
    await connexion(page, "prepa@quincaillerie.test");
    await entre(page, "quincaillerie-demo");
    verifie(true, "le préparateur entre dans le backoffice de la quincaillerie");
    verifie((await page.locator(".bo-etapes [aria-current=page]").innerText()).includes("À préparer"),
      "il arrive sur « À préparer » : son travail d'abord");
    await page.goto(`${C}/gestion/quincaillerie-demo?etape=a_confirmer`, { waitUntil: "networkidle" });
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
    verifie(await page.getByRole("link", { name: "Réception" }).count() === 1, "mais la réception d'un arrivage, oui : c'est lui qui déballe");
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

  await etape("une commande à retirer au magasin : prête, puis retirée", async () => {
    // Une commande en retrait, confirmée par le propriétaire (écrite en base,
    // comme la vitrine et l'appel de confirmation l'auraient fait).
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const entetes = { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json", prefer: "return=representation" };
    const rest = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/commandes`;
    const r = await fetch(rest, {
      method: "POST", headers: entetes,
      body: JSON.stringify({ boutique_id: "00000000-0000-4000-8000-000000000002", contact_nom: "Anis Kammoun", contact_telephone: "+21624681357",
        mode_livraison: "retrait", sous_total_millimes: 89000, total_millimes: 89000 }),
    });
    const [cmd] = r.ok ? await r.json() : [];
    const confirme = cmd ? await fetch(`${rest}?id=eq.${cmd.id}`, { method: "PATCH", headers: entetes, body: JSON.stringify({ statut: "confirmee" }) }) : null;
    verifie(Boolean(cmd?.numero) && confirme?.ok === true, `une commande à retirer, confirmée : ${cmd?.numero ?? r.status}`);

    await page.goto(`${C}/gestion/quincaillerie-demo?etape=a_preparer`, { waitUntil: "networkidle" });
    const ligne = page.locator(".bo-ligne", { hasText: cmd?.numero ?? "—" });
    verifie((await ligne.innerText()).includes("À retirer") && (await ligne.innerText()).includes("retrait en magasin"), "la liste la dit « à retirer »");
    await clic(page, ligne.locator(".bo-ligne-lien"));
    await page.waitForURL(/commandes\//);
    const action = page.locator(".bo-action");
    verifie((await action.innerText()).includes("Préparer la commande") && (await page.locator("#transporteur").count()) === 0
      && (await page.getByRole("link", { name: "Bordereau" }).count()) === 0,
      "préparer, sans transporteur ni bordereau");
    verifie((await page.locator(".bo-fiche-cote").innerText()).includes("Route de Tunis, km 3"), "la fiche dit à quel magasin elle attend");
    await t.envoie(page, page.getByRole("button", { name: "Prête au retrait" }));
    await page.waitForURL(/fait=expedier/);
    verifie((await page.getByRole("status").innerText()).includes("prête au retrait"), `« ${await page.getByRole("status").innerText()} »`);
    const prevenir = page.getByRole("link", { name: /c'est prêt/ });
    const message = decodeURIComponent((await prevenir.getAttribute("href"))?.split("text=")[1] ?? "");
    verifie(message.includes(cmd?.numero ?? "—") && message.includes("Route de Tunis, km 3") && message.includes("89,000 TND"),
      "le message WhatsApp « c'est prêt » : le numéro, le magasin, le montant");
    verifie((await page.locator(".bo-progression").innerText()).includes("Prête"), "la frise dit « prête »");
    await capture(page, "gestion-retrait-prete");
    await t.envoie(page, page.getByRole("button", { name: "Retirée, paiement encaissé" }));
    await page.waitForURL(/fait=livrer/);
    verifie((await page.getByRole("status").innerText()).includes("Retrait enregistré") && (await page.locator(".bo-fiche-tete").innerText()).includes("Retirée"),
      "retirée : le paiement est encaissé");
    await capture(page, "gestion-retrait-retiree");
  });

  await etape("les réglages, en lecture seule", async () => {
    await page.goto(`${C}/gestion/quincaillerie-demo/reglages`, { waitUntil: "networkidle" });
    verifie((await page.locator("main").innerText()).includes("Lecture seule"), "l'écran le dit");
    await page.goto(`${C}/gestion/quincaillerie-demo/reglages/livraison`, { waitUntil: "networkidle" });
    verifie((await page.locator("main").innerText()).includes("Lecture seule"), "chaque thème aussi");
    verifie(await page.getByRole("button", { name: /^Enregistrer/ }).count() === 0, "aucun bouton « Enregistrer »");
    verifie(await page.locator("fieldset:disabled").count() >= 3, "les champs sont grisés");
    const r = await posteBrut(ctx, "/gestion/quincaillerie-demo/reglages/enregistrer", { section: "commandes", "compte.obligatoire": "0" });
    verifie(r.status === 303 && decodeURIComponent(r.location.replace(/\+/g, " ")).includes("propriétaire"),
      `même en postant le formulaire à la main, la base refuse (${r.status})`);
  });

  await etape("l'abonnement, pas pour lui", async () => {
    await page.goto(`${C}/gestion/quincaillerie-demo/reglages`, { waitUntil: "networkidle" });
    verifie(await page.locator(".rg-tuile", { hasText: "Abonnement" }).count() === 0, "pas de tuile « Abonnement »");
    const r = await litBrut(ctx, "/gestion/quincaillerie-demo/abonnement");
    verifie(r === 404, `l'adresse tapée à la main n'existe pas pour le préparateur (HTTP ${r})`);
  });

  await etape("l'export des données, pas pour lui", async () => {
    await page.goto(`${C}/gestion/quincaillerie-demo/reglages`, { waitUntil: "networkidle" });
    verifie(await page.locator(".rg-tuile", { hasText: "Vos données" }).count() === 0, "pas de tuile « Vos données »");
    await page.goto(`${C}/gestion/quincaillerie-demo/export/clients`, { waitUntil: "networkidle" });
    verifie(decodeURIComponent(page.url().replace(/\+/g, " ")).includes("Seuls le propriétaire et l'administrateur exportent"),
      "l'adresse de l'export, tapée à la main : la base refuse");
  });

  await etape("les pages de la boutique : ni le lien, ni l'écriture", async () => {
    verifie(await page.locator(".app-cote a[href$='/apparence']").count() === 0, "pas d'« Éditeur de la vitrine » pour le préparateur");
    verifie(await page.locator(".app-cote a[href$='/accueil']").count() === 0, "ni « Page d'accueil »");
    // Comme l'éditeur l'enverrait : la base refuse.
    const r = await page.evaluate(async () => {
      const d = new FormData();
      d.set("geste", "page");
      d.set("slug", "essai");
      d.set("contenu", JSON.stringify({ titre_fr: "Essai", corps_fr: "Un essai", genre: "texte", publie: true, dans_pied: true }));
      const x = await fetch("/gestion/quincaillerie-demo/apparence/action", { method: "POST", body: d, headers: { accept: "application/json" } });
      return x.json();
    });
    verifie(r.ok === false && String(r.message).includes("Seuls le propriétaire et l'administrateur écrivent"), `écrire une page à la main : la base refuse (${r.message})`);
    const a = await posteBrut(ctx, "/gestion/quincaillerie-demo/apparence/action", {
      geste: "brouillon", version_brouillon: "",
      contenu: JSON.stringify({ code: "technique", couleurs: {}, polices: {}, style: {}, sections: [{ type: "hero" }] }),
    });
    verifie(a.status === 303 && decodeURIComponent(a.location.replace(/\+/g, " ")).includes("Seuls le propriétaire et l'administrateur règlent"),
      `composer l'accueil à la main : la base refuse (${a.status})`);
  });

  await etape("les devis : il lit, il ne chiffre pas", async () => {
    await page.goto(`${C}/gestion/quincaillerie-demo/devis/DEV-00002`, { waitUntil: "networkidle" });
    verifie(await page.locator(".dv-form").count() === 0, "la fiche d'un devis, sans le chiffrage");
    const r = await posteBrut(ctx, "/gestion/quincaillerie-demo/devis/DEV-00002/action", { action: "annuler", motif: "Essai" });
    verifie(r.status === 303 && decodeURIComponent(r.location.replace(/\+/g, " ")).includes("revient à la direction"),
      `annuler à la main : la base refuse (${r.status})`);
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

/* ------------------------------------------------------------------ */
console.log("\n== 6. L'apparence de la vitrine (Dar Alia) ==");
if (section("6")) {
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "apparence");
  const V = t.adresse("maison.localhost");
  const cadre = () => page.frames().find((f) => f.url().startsWith(V));
  const html = async (nom) => (await cadre()?.evaluate((n) => document.documentElement.getAttribute(n), nom).catch(() => null)) ?? null;
  const titre = async () => (await cadre()?.evaluate(() => getComputedStyle(document.querySelector("h1, h2")).fontFamily).catch(() => "")) ?? "";
  const attend = async (fn, ms = 6000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await fn()) return true; await pause(120); } return false; };
  const statut = () => page.locator(".ap-statut").innerText().catch(() => "");

  await etape("connexion, double authentification", async () => {
    await connexion(page, "gerant@dar-alia.test");
    await page.waitForURL(/double-authentification/, { timeout: 15000 });
    const secret = (await page.locator("[data-secret-totp]").textContent()).trim();
    await clic(page, page.locator("#code"));
    await tape(page, totp(secret));
    await page.keyboard.press("Enter");
    await entre(page, "dar-alia");
    verifie(true, "la gérante de Dar Alia entre dans son backoffice");
  });

  await etape("l'éditeur de la vitrine : la vraie vitrine à côté", async () => {
    await clic(page, page.locator(".app-cote").getByRole("link", { name: "Éditeur de la vitrine" }));
    await page.waitForURL(/\/apparence$/);
    await page.waitForLoadState("networkidle");
    verifie(await attend(async () => (await html("data-gabarit")) === "editorial", 10000), "le cadre montre la vitrine de Dar Alia, telle que publiée");
    verifie(await page.locator(".app-cote").isHidden() && await page.locator(".ap-quitter").isVisible(), "plein écran : le menu du backoffice se retire, « Backoffice » pour revenir");
    verifie((await statut()).includes("version publiée"), "rien à publier encore : « C'est la version publiée »");
    await capture(page, "apparence-ouverture");
  });

  await etape("une autre structure : le cadre rend le brouillon", async () => {
    verifie((await html("data-structure")) === "bento", "Dar Alia est en Bento");
    await clic(page, page.locator(".ap-option-large", { hasText: "Technique" }));
    verifie(await attend(async () => (await html("data-gabarit")) === "technique", 15000), "« Technique » : le cadre se recharge sur l'aperçu du brouillon, d'autres composants");
    await clic(page, page.locator(".ap-appareils button", { hasText: "Téléphone" }));
    await pause(1500);
    await capture(page, "apparence-technique-telephone");
    await clic(page, page.locator(".ap-option-large", { hasText: "Bento" }));
    verifie(await attend(async () => (await html("data-structure")) === "bento", 15000), "et revient au Bento");
    verifie((await html("data-coins")) === "ronds" && (await html("data-boutons")) === "pilule", "avec les coins ronds et les boutons en pilule qu'il conseille");
    await clic(page, page.locator(".ap-appareils button", { hasText: "Ordinateur" }));
  });

  await etape("le Monoproduit : la page de vente se pose en tête de l'accueil, puis « Défaire »", async () => {
    await clic(page, page.locator(".ap-option-large", { hasText: "Monoproduit" }));
    verifie(await attend(async () => (await html("data-structure")) === "monoproduit", 15000), "« Monoproduit » : le cadre rend le brouillon");
    verifie(await attend(async () => Boolean(await cadre()?.evaluate(() => Boolean(document.querySelector(".pv-vente .offres, .pv-vente .pv-commander") && document.getElementById("commande"))).catch(() => false)), 10000),
      "la page de vente en tête (le premier produit mis en avant), le formulaire de commande dessous");
    await clic(page, page.getByRole("tab", { name: /Accueil/ }));
    const premiere = await page.locator(".pa-liste .ac-section-texte > b").first().innerText().catch(() => "");
    verifie(premiere.startsWith("Le produit en vente"), `l'accueil reçoit sa section « Le produit en vente » en tête (${premiere})`);
    const ligne = (await page.locator(".pa-liste .ac-section").first().innerText()).replace(/\s+/g, " ");
    verifie(!ligne.includes("Masquée") && ligne.includes("premier produit mis en avant"), "sans produit choisi, elle n'est pas « masquée » : le premier mis en avant");
    await capture(page, "apparence-monoproduit");
    await clic(page, page.getByRole("button", { name: "Défaire" }));
    verifie(await attend(async () => (await html("data-structure")) === "bento", 15000), "« Défaire » : le Bento et ses sections reviennent");
    verifie(!(await page.locator(".pa-liste .ac-section-texte > b").first().innerText().catch(() => "")).startsWith("Le produit en vente"), "sans la section ajoutée");
    await clic(page, page.getByRole("tab", { name: /Style/ }));
  });

  await etape("les coins à la souris, les boutons au clavier", async () => {
    const angle = () => cadre().evaluate(() => getComputedStyle(document.querySelector(".ed-carte .cadre-image")).borderTopLeftRadius);
    const avant = await angle();
    await clic(page, page.locator(".ap-option", { hasText: "Arrondis" }));
    verifie(await attend(async () => (await html("data-coins")) === "arrondis"), "« Arrondis » : la vitrine du cadre change aussitôt, sans recharger");
    const apres = await angle();
    verifie(apres !== avant && apres === "16px", `les photos des cartes suivent (${avant} → ${apres})`);
    await clic(page, page.locator(".ap-option", { hasText: "Contour" }));
    verifie(await attend(async () => (await html("data-boutons")) === "contour"), "« Contour » à la souris");
    await page.locator("input[name='style.boutons'][value='contour']").focus();
    await page.keyboard.press("ArrowRight");
    verifie(await attend(async () => (await html("data-boutons")) === "pilule"), "la flèche du clavier passe à la forme suivante : « Pilule »");
  });

  await etape("une ambiance sombre, le brouillon s'enregistre seul", async () => {
    await clic(page, page.locator(".ap-ambiance", { has: page.locator(".ap-ambiance-nom", { hasText: /^Nuit$/ }) }));
    verifie(await attend(async () => (await html("data-mode")) === "sombre"), "« Nuit » : la vitrine passe en mode sombre");
    const fond = await cadre().evaluate(() => getComputedStyle(document.body).backgroundColor);
    verifie(fond === "rgb(18, 18, 18)", `son fond (${fond})`);
    const surPhoto = await cadre().evaluate(() => getComputedStyle(document.querySelector(".bn-une h1")).color);
    verifie(surPhoto === "rgb(255, 255, 255)", `le titre posé sur la photo d'ouverture reste blanc (${surPhoto})`);
    verifie((await page.locator(".ap-contrastes li[data-ok]").count()) === 3, "les trois contrastes se lisent (texte, texte secondaire, accent)");
    verifie(await attend(async () => (await statut()).includes("Brouillon enregistré"), 8000), "le brouillon s'enregistre de lui-même, une seconde plus tard");
    await capture(page, "apparence-nuit");
  });

  await etape("une police, défaite puis refaite", async () => {
    await clic(page, page.locator(".ap-police", { hasText: "Bodoni Moda" }));
    verifie(await attend(async () => (await titre()).includes("Bodoni")), "les titres de la vitrine en Bodoni Moda");
    await page.keyboard.press("Control+z");
    verifie(await attend(async () => !(await titre()).includes("Bodoni")), "Ctrl+Z : la police d'avant");
    await page.keyboard.press("Control+Shift+z");
    verifie(await attend(async () => (await titre()).includes("Bodoni")), "Ctrl+Maj+Z : Bodoni revient");
    await pause(1200);
    await capture(page, "apparence-bodoni");
  });

  await etape("le lien d'aperçu, hors du backoffice", async () => {
    await attend(async () => (await statut()).includes("Brouillon enregistré"), 8000);
    const lien = (await page.locator(".ap-lien code").innerText()).trim();
    verifie(/\?apercu=[0-9a-f-]{36}\.\d+$/.test(lien), "« Sur votre téléphone » : le lien du brouillon");
    const autre = await ctx.newPage();
    await autre.goto(lien, { waitUntil: "networkidle" });
    verifie(await autre.locator(".bandeau-apercu").isVisible(), "ouvert seul : le bandeau dit que c'est un aperçu");
    verifie((await autre.evaluate(() => document.documentElement.dataset.mode)) === "sombre", "et la vitrine montre le brouillon (sombre)");
    await capture(autre, "apparence-lien-apercu");
    await clic(autre, autre.getByRole("link", { name: "Quitter l'aperçu" }));
    await autre.waitForLoadState("networkidle");
    verifie((await autre.evaluate(() => document.documentElement.dataset.mode)) === "clair" && !(await autre.locator(".bandeau-apercu").count()),
      "« Quitter l'aperçu » : la version publiée, claire");
    await autre.close();
  });

  await etape("publier", async () => {
    await clic(page, page.getByRole("button", { name: "Publier" }));
    verifie(await attend(async () => (await page.locator(".ap-retour").first().innerText().catch(() => "")).includes("publiée"), 10000), "« Apparence publiée » : la page le dit");
    verifie((await statut()).includes("version publiée") && (await page.getByRole("button", { name: "Publier" }).isDisabled()), "plus rien à publier");
    // Ce que la base sert désormais à la vitrine (l'accueil, lui, reste cinq minutes en cache).
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/boutique_publique`, {
      method: "POST",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", "content-type": "application/json" },
      body: JSON.stringify({ p_slug: "dar-alia" }),
    });
    const style = (await r.json())?.theme?.style ?? {};
    verifie(style.mode === "sombre" && style.boutons === "pilule" && style.coins === "arrondis", `publiée : la vitrine reçoit sombre, pilules, coins arrondis (${JSON.stringify(style)})`);
    // Une page jamais gardée en cache (la recherche) la montre aussitôt.
    const vitrine = await ctx.newPage();
    await vitrine.goto(`${V}/recherche?q=lin`, { waitUntil: "networkidle" });
    const a = await vitrine.evaluate(() => ({ ...document.documentElement.dataset }));
    verifie(a.mode === "sombre" && a.boutons === "pilule" && a.coins === "arrondis", `la recherche de la vitrine, aussitôt : sombre, pilules, coins arrondis (${a.mode}, ${a.boutons}, ${a.coins})`);
    await vitrine.close();
  });

  await etape("l'en-tête et le pied de page : l'annonce tapée, un compte refusé puis corrigé, publiés", async () => {
    const entete = async () => (await cadre()?.evaluate(() => [...document.querySelectorAll("[data-zone='entete']")].map((e) => e.textContent).join(" ")).catch(() => "")) ?? "";
    await clic(page, page.getByRole("tab", { name: "En-tête et pied" }));
    // Dar Alia a déjà son annonce et son compte (seed-maison.sql) : tout sélectionner, puis taper.
    await clic(page, page.getByLabel("Annonce en tête du site"));
    await page.keyboard.press("Control+a");
    await tape(page, "Les soldes d'hiver commencent");
    verifie((await page.locator(".pc-compte").innerText()).startsWith("29/"), "le compteur suit la frappe (29/140)");
    verifie(await attend(async () => (await entete()).includes("Les soldes d'hiver commencent"), 12000), "l'annonce paraît en tête de la vitrine du cadre, une seconde plus tard");
    await capture(page, "editeur-annonce");
    await clic(page, page.getByLabel("Instagram"));
    await page.keyboard.press("Control+a");
    await tape(page, "pas un compte");
    verifie((await page.locator("#pc-contact-instagram-aide").innerText()).startsWith("Le compte"), "un compte illisible : dit sous le champ");
    verifie(await attend(async () => (await statut()).includes("à revoir"), 4000), "et il ne part pas (l'état le dit)");
    await page.keyboard.press("Control+a");
    await tape(page, "@atelier.alia");
    verifie(await attend(async () => (await statut()).includes("Brouillon enregistré"), 10000), "corrigé : le brouillon s'enregistre");
    // Le pied de page de l'aperçu, cliqué depuis l'accueil : son panneau s'ouvre.
    await clic(page, page.getByRole("tab", { name: "Accueil" }));
    const pied = cadre().locator("[data-zone='pied']").first();
    await pied.scrollIntoViewIfNeeded();
    await pied.click({ position: { x: 40, y: 40 } });
    verifie(await attend(async () => (await page.getByRole("tab", { name: "En-tête et pied" }).getAttribute("aria-selected")) === "true", 4000),
      "un clic sur le pied de page de l'aperçu : le panneau de l'en-tête et du pied s'ouvre");
    verifie(await attend(async () => (await cadre().locator("footer a[href*='instagram.com/atelier.alia']").count()) === 1, 12000), "le nouveau compte Instagram est au pied de la vitrine du cadre");
    await clic(page, page.getByRole("button", { name: "Publier" }));
    verifie(await attend(async () => (await page.locator(".ap-retour").first().innerText().catch(() => "")).includes("publiée"), 10000), "publiés avec le reste de la vitrine");
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/boutique_publique`, {
      method: "POST",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", "content-type": "application/json" },
      body: JSON.stringify({ p_slug: "dar-alia" }),
    });
    const reglages = (await r.json())?.configuration?.reglages ?? {};
    verifie(reglages["vitrine.annonce"] === "Les soldes d'hiver commencent" && reglages["contact.instagram"] === "@atelier.alia",
      `la vitrine reçoit l'annonce et Instagram (${reglages["vitrine.annonce"]}, ${reglages["contact.instagram"]})`);
    const vitrine = await ctx.newPage();
    await vitrine.goto(`${V}/recherche?q=lin`, { waitUntil: "networkidle" });
    verifie((await vitrine.locator(".ed-annonce").innerText()).includes("Les soldes d'hiver commencent"), "la recherche de la vitrine, aussitôt : l'annonce en tête");
    await vitrine.close();
  });

  await etape("écrire sur place, dans l'aperçu : le titre, puis un bouton annulé", async () => {
    await clic(page, page.getByRole("tab", { name: "Accueil" }));
    const titreCadre = cadre().locator("[data-section] h1[data-texte='titre']").first();
    await titreCadre.scrollIntoViewIfNeeded();
    const avant = (await titreCadre.innerText()).replace(/\s+/g, " ").trim();
    await titreCadre.click();
    verifie(await attend(async () => (await page.locator(".champ[data-lie] textarea, .champ[data-lie] input").count()) === 1, 4000),
      "un clic sur le titre de l'aperçu : sa section s'ouvre, son champ marqué « dans l'aperçu »");
    verifie(await cadre().evaluate(() => document.activeElement?.getAttribute("data-texte")) === "titre", "et l'on écrit dans l'aperçu (le focus y reste)");
    await page.keyboard.press("Control+End");
    await tape(page, " ici");
    const champTitre = page.locator(".champ[data-lie] textarea");
    verifie(await attend(async () => (await champTitre.inputValue()).endsWith(" ici"), 4000), "chaque frappe dans l'aperçu remplit le champ du panneau");
    verifie(await attend(async () => (await statut()).includes("Brouillon enregistré"), 10000), "et le brouillon s'enregistre, la page du cadre pas rendue sous les doigts");
    verifie((await titreCadre.innerText()).toLowerCase().replace(/\s+/g, " ").includes("ici"), "le texte tapé est toujours là, dans le titre");
    await capture(page, "editeur-ecrire-sur-place");
    await page.keyboard.press("Enter");
    verifie(await attend(async () => (await page.locator(".champ[data-lie]").count()) === 0, 4000), "Entrée : c'est écrit (le champ n'est plus marqué)");
    verifie(await attend(async () => {
      const h = cadre().locator("[data-section] h1[data-texte='titre']").first();
      return (await h.getAttribute("contenteditable").catch(() => "x")) === null && (await h.innerText().catch(() => "")).toLowerCase().includes("ici");
    }, 12000), `le cadre se rend de nouveau : le titre est celui du brouillon (« ${avant} » → « … ici »)`);

    // Cliqué là où on le voit : le centre du bouton affiché, rapporté à l'écran
    // (le cadre est réduit, et le texte de l'ouverture glisse au défilement).
    await cadre().evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await pause(500);
    // Le cadre vient de se rendre de nouveau : on attend que le bouton y soit
    // (sous la charge de la CI, il arrive après la pause).
    const bouton = cadre().locator("[data-section] [data-texte='cta']").first();
    await bouton.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    const libelle = (await bouton.innerText({ timeout: 10_000 })).trim();
    // Le centre du bouton une fois posé : deux relevés égaux à 150 ms d'écart
    // (sous la charge, le texte de l'ouverture glisse encore après la pause).
    const centre = () => bouton.evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, l: innerWidth }; });
    // Cliquer là où on le voit ; si le cadre a bougé entre le relevé et le clic
    // (le champ du panneau ne se marque pas), on relève et on reclique — comme
    // quelqu'un qui a cliqué à côté.
    for (let essai = 0; essai < 3; essai++) {
      let ici = await centre();
      for (let i = 0; i < 20; i++) {
        await pause(150);
        const encore = await centre();
        const pose = Math.abs(encore.x - ici.x) < 0.5 && Math.abs(encore.y - ici.y) < 0.5;
        ici = encore;
        if (pose) break;
      }
      const boite = await page.locator(".ap-scene iframe").boundingBox();
      const echelle = boite.width / ici.l;
      await page.mouse.click(boite.x + ici.x * echelle, boite.y + ici.y * echelle);
      if (await attend(async () => (await page.locator(".champ[data-lie] input").count()) > 0, 2500)) break;
      note("INFO  ", `clic à côté du bouton (essai ${essai + 1}) : on relève sa place et on reclique`);
    }
    await page.keyboard.press("Control+End");
    await tape(page, " vite");
    const champBouton = page.locator(".champ[data-lie] input");
    verifie(await attend(async () => (await champBouton.inputValue().catch(() => "")).endsWith(" vite"), 4000), "le bouton aussi s'écrit sur place");
    await page.keyboard.press("Escape");
    verifie(await attend(async () => (await bouton.innerText()).trim() === libelle, 4000), `Échap : le bouton redit « ${libelle} »`);
    verifie(await attend(async () => !(await page.locator(`.pa-liste input[id$='-cta']`).first().inputValue().catch(() => "")).includes("vite"), 4000), "et le champ du panneau revient à l'avant");
  });

  await etape("au téléphone : les réglages, puis l'aperçu", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle" });
    verifie(await page.locator(".ap-onglets").isVisible() && !(await page.locator(".ap-apercu").isVisible()), "au téléphone : deux onglets, les réglages d'abord");
    await clic(page, page.locator(".ap-option:has(input[name='style.coins'][value='ronds'])"));
    await capture(page, "apparence-tel-reglages");
    await clic(page, page.locator(".ap-onglets button", { hasText: "Aperçu" }));
    verifie(await attend(async () => (await html("data-coins")) === "ronds", 8000), "l'onglet Aperçu : la vitrine, en téléphone, coins ronds");
    verifie((await page.locator(".ap-appareils button[aria-pressed='true']").innerText()).includes("Téléphone"), "l'aperçu se met d'office en téléphone");
    await pause(1200);
    await capture(page, "apparence-tel-apercu");
    await clic(page, page.getByRole("button", { name: "Revenir à la version publiée" }));
    verifie(await attend(async () => (await html("data-coins")) === "arrondis", 8000), "« Revenir à la version publiée » : l'essai abandonné");
  });

  await etape("le site vitrine : réglé au backoffice, la fiche propose d'écrire ou d'appeler, puis retour à la boutique", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${C}/gestion/dar-alia/reglages/commandes`, { waitUntil: "networkidle" });
    const commandes = page.locator("section:has(#t-commandes)");
    const statut = () => page.getByRole("status").first().innerText().catch(() => "");
    verifie(await commandes.getByLabel("Une boutique en ligne").isChecked(), "au départ : une boutique en ligne");
    await clic(page, commandes.getByText("Un site vitrine", { exact: true }));
    await t.envoie(page, commandes.getByRole("button", { name: "Enregistrer" }));
    verifie((await statut()).includes("Réglages enregistrés"), `« ${await statut()} »`);
    const v = await ctx.newPage();
    t.espion(v, "site-vitrine");
    await v.goto(V + "/produit/mug-gres-emaille", { waitUntil: "networkidle" });
    verifie((await v.locator(".btn-ajout").count()) === 0 && (await v.locator("header .bouton-panier-compte").count()) === 0,
      "aussitôt sur la vitrine : ni « Ajouter au panier » ni panier dans l'en-tête");
    const contact = (await v.locator(".fiche-contact").innerText()).replace(/\s+/g, " ");
    verifie(contact.includes("Cette pièce vous intéresse") && contact.includes("Écrire sur WhatsApp") && contact.includes("+216 70 000 005"),
      "« Cette pièce vous intéresse ? » : WhatsApp, l'appel, l'e-mail");
    const lien = decodeURIComponent((await v.locator(".fiche-contact-whatsapp").getAttribute("href")) ?? "");
    verifie(lien.includes("Mug en grès émaillé (réf. DAR-MUG-GR)"), "le message WhatsApp nomme la pièce et sa référence");
    await capture(v, "site-vitrine-fiche");
    await v.goto(V + "/commande", { waitUntil: "networkidle" });
    verifie((await v.locator("main h1").innerText()).includes("ne prend pas de commande en ligne"), "/commande : la boutique dit comment la joindre");
    await v.close();
    await clic(page, commandes.getByText("Une boutique en ligne"));
    await t.envoie(page, commandes.getByRole("button", { name: "Enregistrer" }));
    verifie((await statut()).includes("Réglages enregistrés"), "retour à la boutique, enregistré");
    const w = await ctx.newPage();
    await w.goto(V + "/produit/mug-gres-emaille", { waitUntil: "networkidle" });
    verifie((await w.locator(".btn-ajout").count()) === 1 && (await w.locator(".fiche-contact").count()) === 0, "« Ajouter au panier » revient aussitôt");
    await w.close();
  });

  await etape("le « + » des cartes : coupé puis rallumé au backoffice, la vitrine suit aussitôt", async () => {
    await page.goto(`${C}/gestion/dar-alia/reglages/vitrine`, { waitUntil: "networkidle" });
    const vitrine = page.locator("section:has(#t-vitrine)");
    const statut = () => page.getByRole("status").first().innerText().catch(() => "");
    const caseAjout = vitrine.getByRole("checkbox", { name: /Ajouter au panier depuis la carte/ });
    verifie(await caseAjout.isChecked(), "« Ajouter au panier depuis la carte » : allumé chez Dar Alia");
    const plusDeLaVitrine = async () => {
      const v = await ctx.newPage();
      await v.goto(V + "/catalogue", { waitUntil: "networkidle" });
      const n = await v.locator(".ajc-plus").count();
      await v.close();
      return n;
    };
    verifie((await plusDeLaVitrine()) === 18, "sur la vitrine, un « + » sur chacune des 18 cartes");
    await clic(page, vitrine.getByText("Ajouter au panier depuis la carte"));
    await t.envoie(page, vitrine.getByRole("button", { name: "Enregistrer" }));
    verifie((await statut()).includes("Réglages enregistrés"), `coupé : « ${await statut()} »`);
    verifie((await plusDeLaVitrine()) === 0, "aussitôt, plus aucun « + » : les cartes mènent à leur fiche");
    await clic(page, page.locator("section:has(#t-vitrine)").getByText("Ajouter au panier depuis la carte"));
    await t.envoie(page, page.locator("section:has(#t-vitrine)").getByRole("button", { name: "Enregistrer" }));
    verifie((await plusDeLaVitrine()) === 18, "rallumé : les « + » reviennent");
  });

  await etape("la recherche en phrase : allumée puis coupée au backoffice, la vitrine suit aussitôt", async () => {
    await page.goto(`${C}/gestion/dar-alia/reglages/vitrine`, { waitUntil: "networkidle" });
    const vitrine = page.locator("section:has(#t-vitrine)");
    const statut = () => page.getByRole("status").first().innerText().catch(() => "");
    const casePhrase = vitrine.getByRole("checkbox", { name: /Recherche en phrase/ });
    verifie(!(await casePhrase.isChecked()), "« Recherche en phrase » : coupée par défaut chez Dar Alia");
    const compris = async () => {
      const v = await ctx.newPage();
      await v.goto(V + "/recherche?q=" + encodeURIComponent("luminaires en stock"), { waitUntil: "networkidle" });
      const morceaux = await v.locator(".recherche-comprise li").allInnerTexts();
      await v.close();
      return morceaux.join(" · ");
    };
    verifie((await compris()) === "", "coupée : « luminaires en stock » est cherché mot pour mot");
    await clic(page, vitrine.getByText("Recherche en phrase"));
    await t.envoie(page, vitrine.getByRole("button", { name: "Enregistrer" }));
    verifie((await statut()).includes("Réglages enregistrés"), `allumée : « ${await statut()} »`);
    const allumee = await compris();
    verifie(allumee === "Luminaires · En stock", `aussitôt, la vitrine comprend : ${allumee}`);
    await clic(page, page.locator("section:has(#t-vitrine)").getByText("Recherche en phrase"));
    await t.envoie(page, page.locator("section:has(#t-vitrine)").getByRole("button", { name: "Enregistrer" }));
    verifie((await compris()) === "", "recoupée : mot pour mot, comme avant");
  });
  await ctx.close();
}

console.log("\n== 7. La facturation SkanFact du gérant de Maymar (module skanfact) ==");
if (section("7")) {
  // SkanFact simulé par le relais (outils/skanfact-dev.mjs) : la page « Relier SkanEcom à SkanFact », l'entreprise du commerçant.
  const SF = `${process.env.RELAIS ?? "http://127.0.0.1:54321"}/skanfact-dev`;
  const E = "00000000-0000-4000-8888-00000000e001";
  const facturesSF = async () => (await (await fetch(`${SF}/commercant/factures?entreprise=${E}`)).json()).factures;
  const clesSF = async () => (await (await fetch(`${SF}/commercant/cles?entreprise=${E}`)).json()).cles;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rpc = async (nom, corps) => {
    const texte = await (await fetch(`${SUPA}/rest/v1/rpc/${nom}`, {
      method: "POST", headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json" }, body: JSON.stringify(corps) })).text();
    return texte ? JSON.parse(texte) : null;
  };
  const aLivrer = async (id) => (await fetch(`${SUPA}/rest/v1/commandes?select=numero,statut&boutique_id=eq.${id}&statut=in.(confirmee,expediee)&mode_livraison=eq.domicile&order=numero`, {
    headers: { apikey: cle, authorization: `Bearer ${cle}` } })).json();
  await fetch(`${SF}/reinitialiser`, { method: "POST", body: "{}" });
  // La console allume le module pour Maymar (le geste de son administrateur).
  const { users } = await (await fetch(`${SUPA}/auth/v1/admin/users?per_page=1000`, { headers: { apikey: cle, authorization: `Bearer ${cle}` } })).json();
  const admin = users.find((u) => u.email === "admin@skanecom.test");
  const maymar = (await rpc("console_boutique", { p_slug: "maymar" })).boutique;
  await rpc("console_changer_module", { p_acteur: admin.id, p_boutique_id: maymar.id, p_module: "skanfact", p_actif: true });
  await sansDoubleAuthentification("gerant@maymar.test");
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "skanfact");
  // Expédier (si besoin) puis livrer une commande, depuis sa fiche.
  const livrer = async (k) => {
    await page.goto(`${C}/gestion/maymar/commandes/${k.numero}`, { waitUntil: "networkidle" });
    if (k.statut === "confirmee") {
      await clic(page, page.getByRole("button", { name: /Marquer expédiée/ }));
      await page.getByRole("button", { name: /Livrée, paiement encaissé/ }).waitFor();
    }
    await clic(page, page.getByRole("button", { name: /Livrée, paiement encaissé/ }));
    await page.getByText("Livraison enregistrée", { exact: false }).first().waitFor();
    await page.locator("#t-skanfact").waitFor();
  };
  // Une commande livrée sans facture SkanFact (livrée avant la connexion).
  const livreeSansFacture = async (id) => {
    const lire = async (chemin) => (await fetch(`${SUPA}/rest/v1/${chemin}`, { headers: { apikey: cle, authorization: `Bearer ${cle}` } })).json();
    const faites = new Set((await lire(`skanfact_envois?select=commande_id&boutique_id=eq.${id}&genre=eq.facture`)).map((x) => x.commande_id));
    return (await lire(`commandes?select=id,numero&boutique_id=eq.${id}&statut=eq.livree&order=numero`)).find((k) => !faites.has(k.id));
  };

  await etape("connexion du gérant de Maymar", async () => {
    await connexion(page, "gerant@maymar.test");
    await page.waitForURL(/double-authentification/, { timeout: 15000 });
    const secret = (await page.locator("[data-secret-totp]").textContent()).trim();
    await clic(page, page.locator("#code"));
    await tape(page, totp(secret));
    await page.keyboard.press("Enter");
    await entre(page, "maymar");
    verifie(true, "le gérant entre dans son backoffice");
  });

  await etape("« Connecter SkanFact » : refusé, puis autorisé chez SkanFact", async () => {
    await clic(page, page.locator(".app-cote").getByRole("link", { name: "SkanFact" }));
    await page.waitForURL(/\/gestion\/maymar\/skanfact$/);
    // La page entière part chez SkanFact (l'envoi ordinaire) : SkanFact simulé,
    // comme le vrai, ne répond pas aux fetch d'un autre site (pas de CORS).
    verifie(await page.getByRole("button", { name: "Connecter SkanFact" }).evaluate((b) => b.form?.dataset.rechargement !== undefined),
      "« Connecter SkanFact » n'est pas envoyé en place : la page entière part chez SkanFact");
    await clic(page, page.getByRole("button", { name: "Connecter SkanFact" }));
    await page.waitForURL(/skanfact-dev\/connecter\?partenaire=skanecom/);
    verifie(new URL(page.url()).searchParams.get("retour") === `${C}/skanfact/retour`, "SkanFact reçoit l'adresse de retour exacte, sans paramètres");
    await clic(page, page.getByRole("button", { name: "Refuser" }));
    await page.getByText("Vous avez refusé la connexion", { exact: false }).first().waitFor();
    verifie(true, "refusé chez SkanFact : la page le dit, rien n'a changé");
    await clic(page, page.getByRole("button", { name: "Connecter SkanFact" }));
    await page.waitForURL(/skanfact-dev\/connecter/);
    await clic(page, page.getByRole("button", { name: "Autoriser" }));
    await page.getByText("Connecté à Comptoir du Lac SARL.", { exact: false }).first().waitFor();
    verifie(true, "autorisé : « Connecté à Comptoir du Lac SARL. »");
    await page.locator("#sf-tva-produits").selectOption("19");
    await page.locator("#sf-tva-livraison").selectOption("7");
    await clic(page, page.getByRole("button", { name: "Enregistrer les réglages" }));
    await page.getByText("Réglages enregistrés", { exact: false }).first().waitFor();
    verifie(true, "les taux de TVA choisis : 19 % et 7 %");
    await capture(page, "gestion-skanfact-connectee");
  });

  await etape("une commande livrée : sa facture naît dans le SkanFact du gérant", async () => {
    const [k] = await aLivrer(maymar.id);
    verifie(!!k, `une commande à livrer : ${k?.numero} (${k?.statut})`);
    await livrer(k);
    const f = (await facturesSF()).find((x) => x.reference === k.numero);
    verifie(!!f && f.paiements[0]?.mode === "especes" && f.lignes.some((l) => l.designation === "Livraison" && l.tauxTva === "7"),
      `SkanFact a reçu ${f?.numero} (${f?.net} DT) : la livraison à 7 %, encaissée en espèces`);
    verifie((await page.locator("#t-skanfact").innerText()).includes(f?.numero ?? "?"), "la fiche de la commande dit sa facture, « Voir la facture dans SkanFact »");
    await capture(page, "gestion-skanfact-commande");
  });

  await etape("SkanFact en panne : la livraison se fait, la facture repart à l'identique", async () => {
    const [k] = await aLivrer(maymar.id);
    if (!k) { verifie(true, "plus de commande à livrer : l'essai de panne est sauté"); return; }
    await fetch(`${SF}/panne`, { method: "POST", body: JSON.stringify({ active: true }) });
    await livrer(k);
    verifie(/En attente : SkanFact ne répond pas/.test(await page.locator("#t-skanfact").innerText()), "en panne : livrée quand même, la facture « En attente »");
    await fetch(`${SF}/panne`, { method: "POST", body: JSON.stringify({ active: false }) });
    await page.goto(`${C}/gestion/maymar/skanfact`, { waitUntil: "networkidle" });
    await clic(page, page.getByRole("button", { name: "Renvoyer maintenant" }));
    await page.waitForURL(/\/skanfact\?/);
    await page.waitForLoadState("networkidle");
    const f = (await facturesSF()).filter((x) => x.reference === k.numero);
    verifie(f.length === 1, `revenu : la facture ${f[0]?.numero} est faite, une seule fois`);
  });

  await etape("l'accès retiré dans SkanFact (401) : coupée, puis reconnectée", async () => {
    await fetch(`${SF}/commercant/revoquer`, { method: "POST", body: JSON.stringify({ entreprise: E }) });
    const k = await livreeSansFacture(maymar.id);
    verifie(!!k, `une commande livrée avant la connexion : ${k?.numero}`);
    await page.goto(`${C}/gestion/maymar/commandes/${k.numero}`, { waitUntil: "networkidle" });
    await clic(page, page.getByRole("button", { name: "Facturer dans SkanFact" }));
    await page.waitForURL(/erreur=/);
    await page.goto(`${C}/gestion/maymar/skanfact`, { waitUntil: "networkidle" });
    verifie(/La connexion à SkanFact est coupée/.test(await page.locator("body").innerText()), "401 : « La connexion à SkanFact est coupée »");
    await clic(page, page.getByRole("button", { name: "Reconnecter SkanFact" }));
    await page.waitForURL(/skanfact-dev\/connecter/);
    await clic(page, page.getByRole("button", { name: "Autoriser" }));
    await page.getByText("Connecté à Comptoir du Lac SARL.", { exact: false }).first().waitFor();
    let faite = false;
    for (let i = 0; i < 20 && !faite; i++) {
      faite = (await facturesSF()).some((x) => x.reference === k.numero);
      if (!faite) await pause(250);
    }
    verifie(faite, "reconnectée : la facture qui attendait est partie");
    verifie((await clesSF()).length === 1, "une seule clé valable chez SkanFact (un seul « SkanEcom (connexion) »)");
  });

  await etape("Déconnecter : la clé oubliée ici, et coupée dans SkanFact", async () => {
    const [ancienne] = await clesSF();
    verifie(!!ancienne, "la boutique a sa clé chez SkanFact");
    await page.goto(`${C}/gestion/maymar/skanfact`, { waitUntil: "networkidle" });
    await clic(page, page.locator(".fa-delier summary"));
    await clic(page, page.getByRole("button", { name: "Déconnecter la boutique" }));
    await page.getByText("coupée dans SkanFact", { exact: false }).first().waitFor();
    const r = await fetch(`${SF}/v1/entreprises/${E}/ventes?type=facture&limite=1`, { headers: { authorization: `Bearer ${ancienne}` } });
    verifie(r.status === 401, `l'ancienne clé reçoit ${r.status} de SkanFact (401 attendu) : l'accès est coupé des deux côtés`);
    verifie((await clesSF()).length === 0, "SkanFact ne garde aucune clé valable pour la boutique");
  });
  await ctx.close();
}

if (section("8")) {
  console.log("\n== 8. Une commande reçue hors de la vitrine, saisie par l'équipe ==");
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const lit = async (chemin) => (await fetch(`${SUPA}/rest/v1/${chemin}`, { headers: { apikey: cle, authorization: `Bearer ${cle}` } })).json();
  const MAYMAR = "00000000-0000-4000-8000-000000000001";
  const stockDe = async (sku) => (await lit(`variantes?select=stock&boutique_id=eq.${MAYMAR}&sku=eq.${sku}`))[0]?.stock;
  await sansDoubleAuthentification("gerant@maymar.test");
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "saisie");
  const recap = () => page.locator(".sc-recap").innerText();

  await etape("le gérant saisit une commande WhatsApp, à la souris et au clavier", async () => {
    await connexion(page, "gerant@maymar.test");
    await page.waitForURL(/double-authentification/, { timeout: 15000 });
    await clic(page, page.locator("#code"));
    await tape(page, totp((await page.locator("[data-secret-totp]").textContent()).trim()));
    await page.keyboard.press("Enter");
    await entre(page, "maymar");
    await clic(page, page.getByRole("link", { name: "Saisir une commande" }));
    await page.getByRole("heading", { name: "Saisir une commande" }).waitFor();
    verifie(/Il manque d'où vient la commande/.test(await recap()) && await page.locator(".sc-recap .sc-envoyer").isDisabled(),
      "écran vide : le récapitulatif dit ce qui manque, le bouton attend");

    await clic(page, page.locator(".sc-canal", { hasText: "Téléphone" }));
    await page.keyboard.press("ArrowRight");
    verifie(await page.locator("input[name=canal][value=whatsapp]").isChecked(), "le canal : à la souris, puis aux flèches (WhatsApp)");
    await clic(page, page.getByLabel("Numéro du client"));
    await tape(page, "23 119 065");
    verifie(await attend(async () => (await page.getByLabel("Nom", { exact: true }).inputValue()) === "Nadia Belhaj"), "un numéro connu : le nom de la cliente s'écrit seul");
    await clic(page, page.getByRole("button", { name: /Livrer à sa dernière adresse/ }));
    verifie(await page.getByLabel("Gouvernorat").inputValue() === "ben-arous", "« Livrer à sa dernière adresse » reprend son adresse et son gouvernorat");

    const recherche = page.getByRole("combobox", { name: "Chercher un article" });
    await clic(page, recherche);
    await tape(page, "souple 55 noir");
    await page.locator(".sc-resultat").first().waitFor();
    await page.keyboard.press("Enter");
    verifie(await page.locator(".sc-ligne").count() === 1 && (await recherche.inputValue()) === "", "Entrée ajoute l'article ; la recherche se vide pour le suivant");
    await clic(page, page.getByRole("button", { name: /Une de plus : Valise souple extensible/ }));
    const chiffre = () => attend(async () => (await page.locator(".sc-montants").getAttribute("aria-busy")) === "false");
    verifie(await chiffre() && /Articles \(2\)/.test(await recap()) && /Livraison · Grand Tunis/.test(await recap()), "deux pièces, la livraison chiffrée par la base (Grand Tunis)");
    const avant = (await page.locator(".sc-total dd").innerText()).trim();
    await clic(page, page.getByLabel(/Remise accordée/));
    await tape(page, "10");
    await clic(page, page.getByLabel("Livraison offerte"));
    verifie(await attend(async () => /Remise\s*− 10,000/.test(await recap()) && /Offerte/.test(await recap())) && await chiffre(),
      `la direction : 10 TND de remise, la livraison offerte (${avant} → ${(await page.locator(".sc-total dd").innerText()).trim()})`);
    await capture(page, "gestion-saisie-prete", true);

    const stockAvant = await stockDe("VAL-SPL-55-NOI");
    await t.envoie(page, page.locator(".sc-recap .sc-envoyer"));
    await page.getByText("Commande enregistrée.").waitFor({ timeout: 15000 });
    const numero = new URL(page.url()).pathname.split("/").pop();
    verifie(/Reçue sur WhatsApp, saisie par gerant@maymar\.test/.test(await page.locator("main").innerText()), `la fiche ${numero} dit d'où elle vient et qui l'a saisie`);
    verifie(/Confirmée/.test(await statut(page)), "confirmée avec la cliente : elle est à préparer");
    const [c] = await lit(`commandes?select=origine,canal,remise_millimes,frais_livraison_millimes&boutique_id=eq.${MAYMAR}&numero=eq.${numero}`);
    verifie(c?.origine === "manuelle" && c?.canal === "whatsapp" && c?.remise_millimes === 10000 && c?.frais_livraison_millimes === 0,
      "en base : origine manuelle, WhatsApp, la remise et la livraison offerte");
    verifie(await stockDe("VAL-SPL-55-NOI") === stockAvant - 2, "le stock est réservé (2 pièces)");
    await capture(page, "gestion-saisie-fiche");
  });

  await etape("« E-mails au client » allumé : la commande saisie avec son adresse la lui envoie, aux couleurs de Maymar", async () => {
    await page.goto(`${C}/gestion/maymar/reglages/commandes`, { waitUntil: "networkidle" });
    const reglage = page.locator("section:has(#t-commandes)");
    verifie(await reglage.getByLabel(/Pas d'e-mail/).isChecked(), "par défaut : pas d'e-mail au client");
    await clic(page, reglage.getByText("Un e-mail à chaque étape"));
    await t.envoie(page, reglage.getByRole("button", { name: "Enregistrer" }));
    verifie(await reglage.getByLabel(/Un e-mail à chaque étape/).isChecked(), "enregistré : un e-mail à chaque étape");

    const adresse = `sami.${Date.now().toString(36)}@exemple.tn`;
    await page.goto(`${C}/gestion/maymar/commandes/nouvelle`, { waitUntil: "networkidle" });
    await clic(page, page.locator(".sc-canal", { hasText: "Téléphone" }));
    await clic(page, page.getByLabel("Numéro du client"));
    await tape(page, "50 600 700");
    await page.locator(".sc-client", { hasText: "Nouveau client" }).waitFor();
    await clic(page, page.getByLabel("Nom", { exact: true })); await tape(page, "Sami Trabelsi");
    await clic(page, page.getByLabel(/^E-mail/)); await tape(page, adresse);
    await clic(page, page.getByRole("combobox", { name: "Chercher un article" }));
    await tape(page, "cabine business");
    await page.locator(".sc-resultat").first().waitFor();
    await page.keyboard.press("Enter");
    await clic(page, page.getByLabel("Adresse", { exact: true })); await tape(page, "8 rue d'Alger");
    await clic(page, page.getByLabel("Ville ou délégation")); await tape(page, "Tunis");
    await page.getByLabel("Gouvernorat").selectOption("tunis");
    const confirme = page.getByLabel(/Le client a confirmé sa commande/);
    if (!(await confirme.isChecked())) await clic(page, confirme);
    await t.envoie(page, page.locator(".sc-recap .sc-envoyer"));
    await page.getByText("Commande enregistrée.").waitFor({ timeout: 15000 });
    const numero = new URL(page.url()).pathname.split("/").pop();
    const lu = async () => (await fetch(`${process.env.RELAIS ?? "http://127.0.0.1:54321"}/email-dev/rendu/dernier?email=${encodeURIComponent(adresse)}`)).json().catch(() => null);
    let courriel = null;
    verifie(await attend(async () => { courriel = await lu(); return Boolean(courriel?.sujet?.includes(numero)); }, 15000),
      `l'e-mail part : « ${courriel?.sujet} »`);
    verifie(courriel?.nom === "Maymar" && /confirmée/.test(courriel?.sujet ?? ""), "au nom de Maymar : « confirmée »");
    verifie(/Business/i.test(courriel?.texte ?? "") && /Total : /.test(courriel?.texte ?? "") && /À la livraison, en espèces/.test(courriel?.texte ?? ""),
      "avec ses lignes, son total et le paiement à la livraison");
    verifie(/Pour la suivre, gardez son numéro/.test(courriel?.texte ?? ""), "saisie par l'équipe : le suivi par numéro (pas de compte)");
  });

  await etape("une vente au comptoir, remise et payée d'un geste ; d'où viennent les commandes", async () => {
    await page.goto(`${C}/gestion/maymar/commandes/nouvelle`, { waitUntil: "networkidle" });
    await clic(page, page.locator(".sc-canal", { hasText: "Au magasin" }));
    verifie(await page.getByLabel("Remis sur place").isChecked() && await page.getByLabel("Adresse", { exact: true }).count() === 0,
      "« Au magasin » : remis sur place d'emblée, sans adresse");
    await clic(page, page.getByLabel("Numéro du client"));
    await tape(page, "97 111 222");
    await page.locator(".sc-client", { hasText: "Nouveau client" }).waitFor();
    await clic(page, page.getByLabel("Nom", { exact: true }));
    await tape(page, "Hédi Mansour");
    await clic(page, page.getByRole("combobox", { name: "Chercher un article" }));
    await tape(page, "business noir");
    await page.locator(".sc-resultat").first().waitFor();
    await page.keyboard.press("Enter");
    const caisse = page.locator(".sc-recap .sc-envoyer");
    verifie(await attend(async () => /^Encaisser · /.test((await caisse.innerText()).trim()) && !(await caisse.isDisabled())), "le bouton dit « Encaisser » et le total, sans livraison");
    await t.envoie(page, caisse);
    await page.getByText("Vente enregistrée : remise et payée au comptoir.").waitFor({ timeout: 15000 });
    verifie(/Vendue au comptoir/.test(await page.locator(".bo-fiche-tete").innerText()) && /Retirée/.test(await statut(page)), "la vente est remise, payée, close");
    verifie(/Remise au client, payée au comptoir/.test(await page.locator("main").innerText()), "l'historique le dit");
    await capture(page, "gestion-saisie-comptoir");
    await page.goto(`${C}/gestion/maymar/tableau`, { waitUntil: "networkidle" });
    const canaux = page.locator("section", { has: page.getByRole("heading", { name: "D'où viennent les commandes" }) });
    const texte = await canaux.innerText().catch(() => "");
    verifie(/La vitrine/.test(texte) && /WhatsApp/.test(texte) && /Au magasin/.test(texte), "le tableau de bord dit d'où viennent les commandes : la vitrine, WhatsApp, le comptoir");
  });
  await ctx.close();

  await etape("l'employé des appels, au téléphone : sans remise, à confirmer", async () => {
    const tel = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
    const m = await tel.newPage();
    t.espion(m, "saisie-telephone");
    await connexion(m, "appels@maymar.test", true);
    await entre(m, "maymar");
    await m.goto(`${C}/gestion/maymar/commandes/nouvelle`, { waitUntil: "networkidle" });
    verifie(await m.getByLabel(/Remise accordée/).count() === 0, "l'employé des appels ne voit ni remise ni livraison offerte");
    await m.locator(".sc-canal", { hasText: "Instagram" }).tap();
    await m.getByLabel("Numéro du client").tap();
    await tape(m, "51 234 567");
    await m.locator(".sc-client", { hasText: "Nouveau client" }).waitFor();
    await m.getByLabel("Nom", { exact: true }).tap();
    await tape(m, "Rania Ben Amor");
    await m.getByRole("combobox", { name: "Chercher un article" }).tap();
    await tape(m, "cabine business");
    await m.locator(".sc-resultat").first().tap();
    await m.getByLabel("Adresse", { exact: true }).tap();
    await tape(m, "5 rue de Carthage");
    await m.getByLabel("Ville ou délégation").tap();
    await tape(m, "La Marsa");
    await m.getByLabel("Gouvernorat").selectOption("tunis");
    await m.getByText("Le client a confirmé sa commande").tap();
    const barre = m.locator(".sc-barre");
    verifie(await attend(async () => !(await barre.getByRole("button", { name: "Enregistrer", exact: true }).isDisabled())), "le total et « Enregistrer » restent sous le pouce, en bas de l'écran");
    const b = await barre.boundingBox();
    verifie(b && b.y + b.height <= 844 && b.height < 100, "la barre tient sur une ligne, au-dessus de la barre d'onglets");
    await capture(m, "gestion-saisie-telephone");
    await t.envoie(m, barre.getByRole("button", { name: "Enregistrer", exact: true }));
    await m.getByText("Commande enregistrée.").waitFor({ timeout: 15000 });
    verifie(/Reçue sur Instagram, saisie par appels@maymar\.test/.test(await m.locator("main").innerText()) && /confirmer/i.test(await statut(m)),
      "la commande Instagram attend sa confirmation, saisie par l'employé");
    await tel.close();
  });
}

if (section("9")) {
  console.log("\n== 9. Les gestes groupés : remettre au livreur, le point du livreur ==");
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const lit = async (chemin) => (await fetch(`${SUPA}/rest/v1/${chemin}`, { headers: { apikey: cle, authorization: `Bearer ${cle}` } })).json();
  const MAYMAR = "00000000-0000-4000-8000-000000000001";
  const statutDe = async (numero) => (await lit(`commandes?select=statut,transporteur,statut_paiement&boutique_id=eq.${MAYMAR}&numero=eq.${numero}`))[0];
  await sansDoubleAuthentification("gerant@maymar.test");
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "lot");

  await etape("remettre au livreur d'un geste, puis le point du livreur", async () => {
    await connexion(page, "gerant@maymar.test");
    await page.waitForURL(/double-authentification/, { timeout: 15000 });
    await clic(page, page.locator("#code"));
    await tape(page, totp((await page.locator("[data-secret-totp]").textContent()).trim()));
    await page.keyboard.press("Enter");
    await entre(page, "maymar");
    // Deux colis au moins à remettre (les sections d'avant en ont expédié) : des commandes reçues, confirmées.
    const aPreparer = await lit(`commandes?select=numero&boutique_id=eq.${MAYMAR}&statut=eq.confirmee&mode_livraison=eq.domicile`);
    if (aPreparer.length < 2) {
      const recues = await lit(`commandes?select=numero&boutique_id=eq.${MAYMAR}&statut=eq.recue&mode_livraison=eq.domicile&order=numero&limit=${2 - aPreparer.length}`);
      for (const r of recues) {
        await fetch(`${SUPA}/rest/v1/commandes?boutique_id=eq.${MAYMAR}&numero=eq.${r.numero}`, {
          method: "PATCH", body: JSON.stringify({ statut: "confirmee" }),
          headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json", prefer: "return=minimal" } });
      }
    }
    await page.goto(`${C}/gestion/maymar?etape=a_preparer`, { waitUntil: "networkidle" });
    const cases = page.locator(".bo-coche input");
    const n = await cases.count();
    const remettre = page.getByRole("button", { name: /Remettre au livreur/ });
    verifie(n >= 2 && await remettre.isDisabled(), `« À préparer » : une case par colis (${n}), le bouton attend`);
    await clic(page, page.getByLabel("Tout cocher"));
    await clic(page, cases.nth(0));            // la souris en décoche un
    await cases.nth(0).focus();
    await page.keyboard.press("Space");        // le clavier le recoche
    verifie((await remettre.innerText()).includes(`(${n})`), `« Tout cocher », puis souris et clavier : « ${(await remettre.innerText()).trim()} »`);
    const numeros = await cases.evaluateAll((l) => l.map((c) => c.value));
    await clic(page, page.getByLabel("Transporteur"));
    await tape(page, "Aramex");
    await capture(page, "gestion-lot-remettre");
    await t.envoie(page, remettre);
    verifie(await attend(async () => (await message(page)).includes(`${n} commande${n > 1 ? "s" : ""} remise${n > 1 ? "s" : ""} au livreur.`)), "le bilan : les colis remis au livreur");
    const apres = await Promise.all(numeros.map(statutDe));
    verifie(apres.every((c) => c?.statut === "expediee" && c?.transporteur === "Aramex"), "en base : expédiées, avec Aramex");
    verifie(await page.locator(".bo-coche input").count() === 0, "« À préparer » est vide");

    await page.goto(`${C}/gestion/maymar?etape=expediees`, { waitUntil: "networkidle" });
    const exp = page.locator(".bo-coche input");
    const m = await exp.count();
    await clic(page, page.getByLabel("Tout cocher"));
    const garde = await exp.nth(m - 1).getAttribute("value");
    await clic(page, exp.nth(m - 1));           // celui qui est revenu refusé reste à part
    const livrer = page.getByRole("button", { name: /Marquer livrées, payées/ });
    await t.envoie(page, livrer);
    verifie(await attend(async () => (await message(page)).includes(`${m - 1} colis livré`)), `le point du livreur : ${m - 1} colis livrés d'un geste`);
    verifie((await statutDe(numeros[0]))?.statut_paiement === "paye" && (await statutDe(garde))?.statut === "expediee",
      "livrés et payés ; le décoché reste chez le livreur, pour son refus");
  });
  await ctx.close();
}

if (section("10")) {
  console.log("\n== 10. Le paiement en ligne de Maymar (Konnect, sur le compte de la boutique) ==");
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const RELAIS = process.env.RELAIS ?? "http://127.0.0.1:54321";
  const V = t.adresse("maymar.localhost");
  const rpc = async (nom, corps) => {
    const texte = await (await fetch(`${SUPA}/rest/v1/rpc/${nom}`, {
      method: "POST", headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json" }, body: JSON.stringify(corps) })).text();
    return texte ? JSON.parse(texte) : null;
  };
  const lit = async (chemin) => (await fetch(`${SUPA}/rest/v1/${chemin}`, { headers: { apikey: cle, authorization: `Bearer ${cle}` } })).json();
  const codeRecu = async (numero) => {
    for (let i = 0; i < 40; i++) {
      const r = await fetch(`${RELAIS}/sms-dev/dernier?telephone=216${numero}`).catch(() => null);
      if (r?.ok) return (await r.json()).code;
      await pause(250);
    }
    throw new Error(`aucun SMS pour le ${numero}`);
  };
  // La console allume le module pour Maymar (le geste de son administrateur).
  const { users } = await (await fetch(`${SUPA}/auth/v1/admin/users?per_page=1000`, { headers: { apikey: cle, authorization: `Bearer ${cle}` } })).json();
  const admin = users.find((u) => u.email === "admin@skanecom.test");
  const maymar = (await rpc("console_boutique", { p_slug: "maymar" })).boutique;
  await rpc("console_changer_module", { p_acteur: admin.id, p_boutique_id: maymar.id, p_module: "paiement_en_ligne", p_actif: true });
  await sansDoubleAuthentification("gerant@maymar.test");
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "konnect");
  const carte = page.locator("section:has(#t-konnect)");
  const moyens = page.locator("section:has(#t-paiement)");
  let numero = "";

  await etape("connexion du gérant de Maymar", async () => {
    await connexion(page, "gerant@maymar.test");
    await page.waitForURL(/double-authentification/, { timeout: 15000 });
    const secret = (await page.locator("[data-secret-totp]").textContent()).trim();
    await clic(page, page.locator("#code"));
    await tape(page, totp(secret));
    await page.keyboard.press("Enter");
    await entre(page, "maymar");
    verifie(true, "le gérant entre dans son backoffice");
  });

  await etape("Réglages → Paiement : le compte Konnect, une clé refusée puis la bonne", async () => {
    await page.goto(`${C}/gestion/maymar/reglages/paiement`, { waitUntil: "networkidle" });
    verifie(await moyens.getByLabel("Paiement en ligne (Konnect), compte à brancher").isDisabled(),
      "sans compte, l'interrupteur du paiement en ligne reste grisé");
    await clic(page, carte.getByLabel("Identifiant du portefeuille"));
    await tape(page, "5f7a209aeb3f76490ac4a3d1");
    await clic(page, carte.getByLabel("Clé d'API"));
    await tape(page, "sk_cle_refusee_par_konnect");
    await t.envoie(page, carte.getByRole("button", { name: "Brancher mon compte Konnect" }));
    verifie(await attend(async () => (await carte.innerText()).includes("Konnect refuse cette clé en mode essai")),
      "une clé que Konnect refuse : la carte le dit, rien n'est gardé");
    verifie(await carte.getByLabel("Identifiant du portefeuille").inputValue() === "5f7a209aeb3f76490ac4a3d1", "le portefeuille tapé reste là, pour corriger la clé");
    await clic(page, carte.getByLabel("Clé d'API"));
    await page.keyboard.press("ControlOrMeta+A");   // la clé refusée est restée dans le champ : on la remplace
    await tape(page, "sk_essai_maymar_0001");
    await t.envoie(page, carte.getByRole("button", { name: "Brancher mon compte Konnect" }));
    verifie(await attend(async () => (await carte.innerText()).includes("Compte Konnect branché, en mode essai")), "la bonne clé : le compte est branché, en essai");
    verifie((await carte.innerText()).includes("…0001") && !(await page.content()).includes("sk_essai_maymar_0001"),
      "la clé ne revient jamais à l'écran : ses quatre derniers caractères");
    await capture(page, "gestion-konnect-branche");
  });

  await etape("le paiement en ligne s'allume", async () => {
    const inter = moyens.getByRole("checkbox", { name: /Paiement en ligne \(Konnect\)/ });
    verifie(!(await inter.isDisabled()) && !(await inter.isChecked()), "branché : l'interrupteur se libère, encore éteint");
    await clic(page, inter);
    await t.envoie(page, moyens.getByRole("button", { name: "Enregistrer" }));
    await page.reload({ waitUntil: "networkidle" });
    verifie(await moyens.getByRole("checkbox", { name: /Paiement en ligne \(Konnect\)/ }).isChecked(), "enregistré : le paiement en ligne est allumé");
  });

  await etape("l'acheteur, au téléphone : carte refusée chez Konnect, réessayé, payé", async () => {
    const tel = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "fr-FR" });
    const p = await tel.newPage();
    t.espion(p, "konnect-acheteur");
    await p.goto(V + "/produit/valise-cabine-business", { waitUntil: "networkidle" });
    verifie((await p.locator("main").innerText()).includes("Ou en ligne, par carte"), "la fiche dit les deux moyens de payer");
    await p.locator(".achat .btn-ajout").tap();
    await p.goto(V + "/commande", { waitUntil: "networkidle" });
    verifie((await p.locator(".tunnel-tete").innerText()).includes("Payez en ligne par carte ou e-dinar, ou au livreur"), "le chapeau de la commande le dit aussi");
    // Un numéro neuf à chaque passage : un même numéro n'a qu'un SMS par minute.
    const telephone = `29${String(Date.now() % 1_000_000).padStart(6, "0")}`;
    await p.getByLabel("Téléphone").fill(telephone);
    await p.getByRole("button", { name: "Recevoir le code" }).tap();
    await p.getByLabel("Code reçu par SMS").fill(await codeRecu(telephone));
    await p.locator(".tunnel-identite").waitFor({ timeout: 8000 });
    await p.getByLabel("Nom et prénom").fill("Ines Gharbi");
    await p.getByLabel(/^Adresse/).fill("8 rue d'Alger");
    await p.getByLabel("Ville ou délégation").fill("Sousse");
    await p.getByLabel("Gouvernorat", { exact: true }).selectOption({ label: "Sousse" });
    await p.locator(".tunnel-livraison").waitFor({ timeout: 8000 });
    await p.getByText("Payer en ligne", { exact: true }).tap();
    verifie((await p.locator(".tunnel-mode:has(input:checked)").innerText()).includes("Payer en ligne"), "la carte choisie se voit : « Payer en ligne »");
    await p.locator("input[type=checkbox]").last().tap();
    const bouton = p.locator("button.tunnel-bouton");
    verifie((await bouton.innerText()).includes("Confirmer et payer en ligne"), "le bouton dit ce qui va se passer");
    await bouton.tap();
    await p.waitForURL(/\/konnect-dev\/payer\//, { timeout: 15000 });
    verifie((await p.locator("body").innerText()).includes("Maymar"), "la page de paiement de Konnect (simulée) : la commande de Maymar");
    // La carte se saisit chez Konnect, jamais chez SkanEcom : une carte que la banque refuse, puis on renonce.
    const carte = async (numero) => {
      await p.getByLabel("Nom sur la carte").fill("INES GHARBI");
      await p.getByLabel("Numéro de carte").fill(numero);
      await p.getByLabel("Expiration").fill("12/29");
      await p.getByLabel("Code de sécurité").fill("123");
      await p.getByRole("button", { name: /^Payer \d/ }).tap();
    };
    await carte("4000 0000 0000 0002");
    await p.locator(".refus").waitFor({ timeout: 8000 });
    verifie((await p.locator(".refus").innerText()).includes("refusé par votre banque"), "une carte refusée : la page de paiement le dit, rien n'est prélevé");
    await p.getByRole("button", { name: "Annuler et revenir à la boutique" }).tap();
    await p.waitForURL(/\/commande\/merci\?paiement=retour/, { timeout: 15000 });
    const bloc = p.locator(".merci-paiement");
    verifie((await bloc.innerText()).includes("aucun montant n'a été prélevé"), "refusé : rien n'est prélevé, la page le dit");
    await capture(p, "vitrine-konnect-refuse");
    numero = (await p.locator(".merci-tete .chapo").innerText()).match(/MAY-\d{4}-\d{5}/)?.[0] ?? "";
    await bloc.getByRole("button", { name: "Réessayer le paiement" }).tap();
    await p.waitForURL(/\/konnect-dev\/payer\//, { timeout: 15000 });
    await carte("4242 4242 4242 4242");
    await p.waitForURL(/\/commande\/merci\?paiement=retour/, { timeout: 15000 });
    verifie((await p.locator(".merci-paiement").innerText()).includes("est reçu"), "réessayé, payé : « Votre paiement … est reçu »");
    verifie((await p.locator(".merci-suite").innerText()).includes("réglés en ligne, par Konnect"), "la suite : l'étape payée est cochée, rien à régler au livreur");
    await capture(p, "vitrine-konnect-paye");
    const [c] = await lit(`commandes?select=mode_paiement,statut_paiement&boutique_id=eq.${maymar.id}&numero=eq.${numero}`);
    verifie(c?.mode_paiement === "konnect" && c?.statut_paiement === "paye", `en base : ${numero} payée en ligne`);
    await tel.close();
  });

  await etape("la fiche : « Payée en ligne » ; le bordereau : rien à encaisser", async () => {
    await page.goto(`${C}/gestion/maymar/commandes/${numero}`, { waitUntil: "networkidle" });
    verifie((await page.locator(".bo-fiche-tete").innerText()).includes("Payée en ligne"), "la fiche porte « Payée en ligne »");
    verifie((await page.locator("main").innerText()).includes("payés en ligne"), "et la somme est dite payée en ligne, pas « à la livraison »");
    await clic(page, page.getByRole("button", { name: "Confirmée", exact: true }));
    await page.getByText("Commande confirmée", { exact: false }).first().waitFor();
    await page.goto(`${C}/gestion/maymar/bordereaux?n=${encodeURIComponent(numero)}`, { waitUntil: "networkidle" });
    const montant = page.locator(".bdx-montant");
    verifie((await montant.innerText()).includes("Rien à encaisser"), "le bordereau du livreur : « Rien à encaisser »");
    await capture(page, "gestion-konnect-bordereau");
  });

  await etape("retirer le compte : le paiement à la livraison revient", async () => {
    await page.goto(`${C}/gestion/maymar/reglages/paiement`, { waitUntil: "networkidle" });
    verifie(/[1-9]\d* paiements? reçus?/.test(await carte.innerText()), "le mois : le paiement reçu est compté");
    await t.envoie(page, carte.getByRole("button", { name: "Retirer le compte" }));
    verifie(await attend(async () => (await carte.innerText()).includes("Compte Konnect retiré")), "retiré : la carte le dit");
    await page.reload({ waitUntil: "networkidle" });
    verifie(await moyens.getByLabel("Paiement à la livraison").isChecked()
      && await moyens.getByLabel("Paiement en ligne (Konnect), compte à brancher").isDisabled(),
      "le paiement à la livraison est allumé, le paiement en ligne éteint");
  });
  await ctx.close();
}

await navigateur.close();
await pause(10);
process.exit(t.bilan());
