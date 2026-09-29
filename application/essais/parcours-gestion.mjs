import { createHmac } from "node:crypto";
import { creeTesteur } from "./testeur.mjs";

/* ============================================================================
   PARCOURS DU BACKOFFICE — l'équipe de Maymar traite ses commandes.

   1. L'employé des appels (confirmateur, sans double authentification) :
      la liste par étape, un appel sans réponse, une confirmation par
      WhatsApp, la recherche, une boutique qui n'est pas la sienne, et deux
      écrans ouverts sur la même commande (le geste périmé est refusé).
   2. Le gérant (propriétaire, double authentification) : expédier, livrer,
      refuser à la livraison avec son origine, annuler, noter.
   3. Le même employé sur téléphone.
   4. Le préparateur d'une autre boutique : pas de bouton de confirmation.

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
  await ctx.close();
}

await navigateur.close();
await pause(10);
process.exit(t.bilan());
