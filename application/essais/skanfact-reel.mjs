import { createDecipheriv, createHmac } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

/* ============================================================================
   LE VRAI SKANFACT, DE BOUT EN BOUT — SkanEcom (la console sur le poste)
   contre un serveur d'essai de SkanFact (docs/boutique.md de la plateforme,
   B0, « Essayer de bout en bout sur un poste »), dans un navigateur.

   0. Chez SkanFact, par son API : la commerçante, son compte (code par
      application), son entreprise « Comptoir du Lac SARL ».
   1. « Connecter SkanFact » : la page entière part chez SkanFact (connexion,
      code, « Autoriser »), revient, « Connecté à Comptoir du Lac SARL. ».
   2. B1 à la confirmation, B3 à la livraison (la facture soldée).
   3. B4 : le SAV rembourse une valise (l'avoir et l'argent rendu).
   4. B4 : une commande refusée à la livraison (l'avoir de toute la facture).
   5. Renouveler : la nouvelle clé vaut, l'ancienne reçoit 401 (brique 135).
   6. Déconnecter : l'ancienne clé reçoit 401. Avec SKANFACT_REEL_ARRETER et
      SKANFACT_REEL_LANCER (deux commandes du poste), SkanFact est arrêté
      pendant le geste : la boutique est déconnectée quand même, la coupure
      attend, puis « Renvoyer maintenant », SkanFact relancé, la coupe.

   Le serveur d'essai de SkanFact (SKANFACT_ENVIRONNEMENT=test) déclare
   SkanEcom avec le retour http://console.localhost:4200/skanfact/retour et
   l'empreinte SHA-256 du secret de développement (outils/api-locale.sh) ;
   puis, base fraîche :
     SKANFACT_REEL=http://127.0.0.1:8090 outils/api-locale.sh demarrer
     (vitrine relancée) ; cd application && bun run essai:skanfact-reel
   Ne tourne pas en CI : il faut le serveur de SkanFact.
   ========================================================================== */

const SF = process.env.SKANFACT_REEL ?? "http://127.0.0.1:8090";
const C = `http://console.localhost:${process.env.PORT_VITRINE ?? "4200"}`;
const M = "/gestion/maymar";
const D = process.env.CAPTURES ?? "../.outils/captures/skanfact-reel";
const arreter = process.env.SKANFACT_REEL_ARRETER;
const lancer = process.env.SKANFACT_REEL_LANCER;
mkdirSync(D, { recursive: true });

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const notes = [];
const verifie = (c, t) => { notes.push(c); console.log(`${c ? "OK    " : "DÉFAUT"}  ${t}`); };
const psql = `${process.env.PG_BIN ?? "/usr/lib/postgresql/16/bin"}/psql`;
const sql = (q) => execFileSync(psql, ["-X", "-tA", "-h", "127.0.0.1", "-p", process.env.BASE_LOCALE_PORT ?? "54322", "-U", "postgres",
  "-d", process.env.BASE_LOCALE_NOM ?? "skanecom", "-c", q], { encoding: "utf8" }).trim();
const photo = (p, nom) => p.screenshot({ path: `${D}/${nom}.jpg`, type: "jpeg", quality: 82 });
const pret = async (p, texte) => { await p.getByText(texte, { exact: false }).first().waitFor({ timeout: 20000 }).catch(() => {}); await pause(700); };

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
  const k = h[h.length - 1] & 15;
  return String((h.readUInt32BE(k) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/* La clé SkanFact de la boutique, déchiffrée comme le serveur le fait (AES-GCM, la boutique en contexte). */
const chiffre = Buffer.from(/^SKANFACT_CHIFFRE=(.+)$/m.exec(readFileSync(".dev.vars", "utf8"))[1].trim(), "base64");
function dechiffrer(range, contexte) {
  const tout = Buffer.from(range, "base64");
  const d = createDecipheriv("aes-256-gcm", chiffre, tout.subarray(0, 12));
  d.setAAD(Buffer.from(contexte, "utf8"));
  d.setAuthTag(tout.subarray(tout.length - 16));
  return Buffer.concat([d.update(tout.subarray(12, tout.length - 16)), d.final()]).toString("utf8");
}

/* L'API de SkanFact. */
const api = async (methode, chemin, jeton, corps) => {
  const r = await fetch(`${SF}/v1${chemin}`, {
    method: methode,
    headers: { ...(jeton ? { authorization: `Bearer ${jeton}` } : {}), ...(corps === undefined ? {} : { "content-type": "application/json" }) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const t = await r.text();
  return { statut: r.status, corps: t ? JSON.parse(t) : {} };
};

/* 0 · Chez SkanFact : la commerçante, son compte, son entreprise. */
const email = `nadia-${Date.now()}@exemple.tn`;
const MDP = "Un-bon-mot-de-passe";
await api("POST", "/inscription", undefined, { email, nom: "Nadia", motDePasse: MDP });
const jeton = String((await api("POST", "/connexion", undefined, { email, motDePasse: MDP, appareil: { nom: "Préparation", type: "navigateur" } })).corps.jeton);
const secretTotp = /secret=([A-Z2-7]+)/.exec(String((await api("POST", "/moi/code", jeton, { methode: "application" })).corps.adresseApplication))?.[1] ?? "";
const entreprise = String((await api("POST", "/entreprises", jeton, { raisonSociale: "Comptoir du Lac SARL" })).corps.id);
verifie(/^[0-9a-f-]{36}$/.test(entreprise) && secretTotp.length > 10, `SkanFact : Nadia et son entreprise « Comptoir du Lac SARL » (${entreprise.slice(0, 8)}…)`);
const commande = async (numero) => api("GET", `/entreprises/${entreprise}/commandes-en-ligne/${numero}`, jeton);
const ventes = async (cle) => (await fetch(`${SF}/v1/entreprises/${entreprise}/ventes?type=facture&limite=1`, { headers: { authorization: `Bearer ${cle}` } })).status;

/* SkanEcom : le module allumé par l'administrateur de la console. */
const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const entetes = { apikey: cleService, authorization: `Bearer ${cleService}` };
const rpc = async (nom, corps) => {
  const t = await (await fetch(`${SUPA}/rest/v1/rpc/${nom}`, { method: "POST", headers: { ...entetes, "content-type": "application/json" }, body: JSON.stringify(corps) })).text();
  return t ? JSON.parse(t) : null;
};
const auth = `${SUPA}/auth/v1`;
const { users } = await (await fetch(`${auth}/admin/users?per_page=1000`, { headers: entetes })).json();
const maymar = (await rpc("console_boutique", { p_slug: "maymar" })).boutique;
await rpc("console_changer_module", { p_acteur: users.find((u) => u.email === "admin@skanecom.test").id, p_boutique_id: maymar.id, p_module: "skanfact", p_actif: true });

const executable = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
const nav = await chromium.launch({ executablePath: executable, args: ["--no-sandbox", "--host-resolver-rules=MAP *.localhost 127.0.0.1"] });
const g = await (await nav.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" })).newPage();
const erreurs = [];
g.on("pageerror", (e) => erreurs.push(e.message));

/* Le gérant de Maymar dans son backoffice (double authentification). */
const gerant = users.find((u) => u.email === "gerant@maymar.test");
for (const f of (await (await fetch(`${auth}/admin/users/${gerant.id}/factors`, { headers: entetes })).json()) ?? []) {
  await fetch(`${auth}/admin/users/${gerant.id}/factors/${f.id}`, { method: "DELETE", headers: entetes });
}
await g.goto(`${C}/connexion`, { waitUntil: "networkidle" });
await g.locator("#email").fill("gerant@maymar.test");
await g.locator("#mot_de_passe").fill("equipe-locale-skanecom");
await g.keyboard.press("Enter");
await g.waitForURL(/double-authentification/, { timeout: 15000 });
await g.locator("#code").fill(totp((await g.locator("[data-secret-totp]").textContent()).trim()));
await g.keyboard.press("Enter");
await g.waitForURL((u) => !/double-authentification/.test(u.pathname), { timeout: 15000 });

/* Chez SkanFact : la connexion de Nadia (si elle n'y est pas déjà), puis « Relier SkanEcom à SkanFact ». */
const champSF = (libelle) => g.locator("label.field").filter({ hasText: libelle }).locator("input");
async function autoriserChezSkanFact(nomPhoto) {
  await g.waitForURL((u) => u.origin === new URL(SF).origin, { timeout: 20000 });
  const relier = g.getByRole("heading", { level: 1, name: "Relier SkanEcom à SkanFact" });
  const connexion = g.getByRole("heading", { level: 1, name: "Se connecter à SkanFact" });
  await Promise.race([relier.waitFor({ timeout: 20000 }), connexion.waitFor({ timeout: 20000 })]).catch(() => {});
  if (await connexion.isVisible().catch(() => false)) {
    await champSF("Adresse e-mail").fill(email);
    await champSF("Mot de passe").fill(MDP);
    await g.getByRole("button", { name: "Se connecter", exact: true }).click();
    await g.getByRole("heading", { level: 1, name: "Le code de ton téléphone" }).waitFor({ timeout: 20000 });
    await champSF("Code").fill(totp(secretTotp));
    await g.getByRole("button", { name: "Valider le code", exact: true }).click();
  }
  await relier.waitFor({ timeout: 20000 });
  // Une seule entreprise à relier : SkanFact la nomme ; plusieurs : une liste.
  const liste = g.locator("label.field").filter({ hasText: "L'entreprise à relier" }).locator("select");
  if (await liste.count()) await liste.selectOption({ label: "Comptoir du Lac SARL" });
  else await g.getByText(/Comptoir du Lac SARL/).first().waitFor({ timeout: 5000 });
  if (nomPhoto) await photo(g, nomPhoto);
  await g.getByRole("button", { name: "Autoriser", exact: true }).click();
  await g.waitForURL((u) => u.origin === C && u.pathname === `${M}/skanfact`, { timeout: 20000 });
}

/* 1 · Connecter SkanFact : la page entière part chez SkanFact, et revient. */
await g.goto(`${C}${M}/skanfact`, { waitUntil: "networkidle" });
await g.getByRole("button", { name: "Connecter SkanFact" }).click();
await autoriserChezSkanFact("01-skanfact-relier");
await pret(g, "Connecté à");
verifie(/Connecté à Comptoir du Lac SARL\./.test(await g.locator("body").innerText()), "autorisé chez SkanFact, le code échangé : « Connecté à Comptoir du Lac SARL. »");
await photo(g, "02-connecte");
await g.locator("#sf-tva-produits").selectOption("19");
await g.locator("#sf-tva-livraison").selectOption("7");
await g.getByRole("button", { name: "Enregistrer les réglages" }).click();
await pret(g, "Réglages enregistrés");

/* 2 · B1 à la confirmation, B3 à la livraison. */
const numero = (n) => `MAY-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
const fiche = (n) => `${C}${M}/commandes/${numero(n)}`;
await g.goto(fiche(9), { waitUntil: "networkidle" });
await g.getByRole("button", { name: /Confirmée/ }).click();
await g.waitForURL(/fait=appel-confirmee/);
await pret(g, "Voir la facture dans SkanFact");
let c9 = await commande(numero(9));
verifie(c9.statut === 200 && /^FAC/.test(String(c9.corps.facture?.numero ?? "")), `confirmée : SkanFact émet ${c9.corps.facture?.numero} (${c9.corps.facture?.netAPayer}, reste ${c9.corps.facture?.reste})`);
const lien = await g.getByRole("link", { name: /Voir la facture .* dans SkanFact/ }).getAttribute("href");
verifie(lien?.startsWith(`${SF}/`) && (await fetch(lien)).status === 200, "« Voir la facture dans SkanFact » ouvre SkanFact");
await g.locator("#t-skanfact").scrollIntoViewIfNeeded();
await photo(g, "03-facturee");
await g.getByRole("button", { name: "Marquer expédiée" }).click();
await g.waitForURL(/fait=expedier/);
await g.getByRole("button", { name: /Livrée, paiement encaissé/ }).click();
await g.waitForURL(/fait=livrer/);
await pret(g, "Paiement à la livraison");
c9 = await commande(numero(9));
verifie(c9.corps.facture?.reste === "0.000", `livrée : le paiement à la livraison solde la facture (reste ${c9.corps.facture?.reste})`);

/* 3 · B4 : le SAV rembourse la valise de la commande 5 (livrée avant la connexion, facturée à la main). */
await g.goto(fiche(5), { waitUntil: "networkidle" });
await g.getByRole("button", { name: "Facturer dans SkanFact" }).click();
await pret(g, "Voir la facture dans SkanFact");
const c5avant = await commande(numero(5));
verifie(c5avant.corps.facture?.reste === "0.000", `facturée à la main avec son encaissement : ${c5avant.corps.facture?.numero}, ${c5avant.corps.facture?.netAPayer}`);
await g.goto(`${C}${M}/sav/SAV-00002`, { waitUntil: "networkidle" });
await g.getByRole("button", { name: /Prendre en charge/ }).click();
await g.waitForURL(/fait=prendre/);
await g.locator(".sav-clore summary", { hasText: "Résolue" }).click();
await g.locator("input[name=issue][value=remboursement]").check();
await g.getByRole("button", { name: /Enregistrer : résolue/ }).click();
await g.waitForURL(/fait=resoudre/);
await pause(1500);
const retourSav = JSON.parse(sql("select coalesce(reponse::text, 'null') from public.skanfact_envois where genre = 'retour' and cle = 'sav-SAV-00002'") || "null");
const c5 = await commande(numero(5));
verifie(/^AVO/.test(String(retourSav?.avoir?.numero ?? "")) && retourSav?.avoir?.montant === "189.000" && retourSav?.rembourse === "189.000" && c5.corps.facture?.reste === "0.000",
  `remboursé au SAV : l'avoir ${retourSav?.avoir?.numero} de ${retourSav?.avoir?.montant}, ${retourSav?.rembourse} rendus, reste ${c5.corps.facture?.reste}`);
await g.goto(fiche(5), { waitUntil: "networkidle" });
await g.locator("#t-skanfact").scrollIntoViewIfNeeded();
await photo(g, "04-sav-rembourse");

/* 4 · B4 : refusée à la livraison après sa facture (commande 10). */
await g.goto(fiche(10), { waitUntil: "networkidle" });
await g.getByRole("button", { name: /Confirmée/ }).click();
await g.waitForURL(/fait=appel-confirmee/);
await pret(g, "Voir la facture dans SkanFact");
await g.getByRole("button", { name: "Marquer expédiée" }).click();
await g.waitForURL(/fait=expedier/);
await g.getByText("Refusée à la livraison").first().click();
await g.locator("input[name=origine][value=client]").check();
await g.getByRole("button", { name: "Enregistrer le refus" }).click();
await g.waitForURL(/fait=refuser/);
await pause(1500);
const refus = JSON.parse(sql("select coalesce(reponse::text, 'null') from public.skanfact_envois where genre = 'retour' and cle = 'refus'") || "null");
const c10 = await commande(numero(10));
verifie(/^AVO/.test(String(refus?.avoir?.numero ?? "")) && c10.corps.facture?.reste === "0.000", `refusée : l'avoir ${refus?.avoir?.numero} de toute la commande (${refus?.avoir?.montant}), la facture soldée`);
await g.locator("#t-skanfact").scrollIntoViewIfNeeded();
await photo(g, "05-refusee");

/* 5 · Renouveler : une nouvelle clé, l'ancienne coupée dans SkanFact. */
const cleDe = () => dechiffrer(sql("select cle_chiffree from plateforme.skanfact_connexions"), maymar.id);
const premiere = cleDe();
verifie(await ventes(premiere) === 200, "la clé de la boutique vaut chez SkanFact");
sql("update plateforme.skanfact_connexions set expire_le = now() + interval '12 days'");
await g.goto(`${C}${M}/skanfact`, { waitUntil: "networkidle" });
await g.getByRole("button", { name: "Renouveler la connexion" }).click();
await autoriserChezSkanFact(null);
await pret(g, "Connecté à");
await pause(2500);
const seconde = cleDe();
verifie(seconde !== premiere && await ventes(seconde) === 200 && await ventes(premiere) === 401,
  "renouvelée : la nouvelle clé vaut, l'ancienne reçoit 401 de SkanFact");

/* 6 · Déconnecter : l'ancienne clé coupée dans SkanFact (SkanFact arrêté pendant le geste, si le poste sait l'arrêter). */
if (arreter) { execSync(arreter); await pause(800); }
await g.goto(`${C}${M}/skanfact`, { waitUntil: "networkidle" });
await g.locator(".fa-delier summary").click();
await g.getByRole("button", { name: "Déconnecter la boutique" }).click();
await pret(g, "Boutique déconnectée");
verifie(sql("select count(*) from plateforme.skanfact_connexions") === "0", "déconnectée : la boutique n'a plus de clé");
if (arreter && lancer) {
  verifie(/la coupure de l'accès lui sera renvoyée/.test(await g.locator("body").innerText()), "SkanFact arrêté : déconnectée quand même, la coupure attend");
  await photo(g, "06-deconnectee-skanfact-arrete");
  execSync(lancer);
  verifie(await ventes(seconde) === 200, "SkanFact relancé : la clé quittée vaut encore (la coupure n'est pas passée)");
  await g.getByRole("button", { name: "Renvoyer maintenant" }).click();
  await pret(g, "coupé dans SkanFact");
  verifie(/L'ancien accès est coupé dans SkanFact/.test(await g.locator("body").innerText()), "« Renvoyer maintenant » : « L'ancien accès est coupé dans SkanFact. »");
} else {
  verifie(/coupée dans SkanFact/.test(await g.locator("body").innerText()), "« oubliée chez SkanEcom et coupée dans SkanFact »");
}
verifie(await ventes(seconde) === 401, "l'ancienne clé reçoit 401 de SkanFact");
verifie(sql("select count(*) from plateforme.skanfact_coupures") === "0", "la file des coupures est vide");
await pause(800);
await photo(g, "07-coupee");

await nav.close();
verifie(erreurs.length === 0, `aucune erreur de page${erreurs.length ? ` : ${erreurs.join(" ; ")}` : ""}`);
const defauts = notes.filter((n) => !n).length;
console.log(`\n${notes.length - defauts} OK, ${defauts} DÉFAUT — captures dans ${D}`);
process.exit(defauts ? 1 : 0);
