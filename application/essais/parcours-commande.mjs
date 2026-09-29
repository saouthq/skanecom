import { creeTesteur } from "./testeur.mjs";

/* ============================================================================
   PARCOURS DE COMMANDE — un acheteur qui commande pour de vrai, dans les deux
   gabarits : panier, « Commander », numéro de téléphone, code reçu par SMS,
   adresse, frais du gouvernorat, confirmation, page de fin. Puis le même sur
   téléphone, avec les erreurs d'un formulaire envoyé vide.

     cd application && bun run parcours:commande     # vitrine sur 127.0.0.1:4200

   Le « fournisseur de SMS » local est le relais de l'API (outils/api-locale.sh) :
   le code se relit sur http://127.0.0.1:54321/sms-dev/dernier?telephone=…
   Jeu de démo requis (supabase/seed.sql), base fraîche de préférence : les
   numéros de commande vérifiés sont les premiers de chaque boutique.
   ========================================================================== */

const t = creeTesteur();
const { pause, note, verifie, capture, clic, tape, etape } = t;
const S = t.adresse("mode.localhost");
const Q = t.adresse("quincaillerie.localhost");
const RELAIS = process.env.RELAIS ?? "http://127.0.0.1:54321";
const navigateur = await t.navigateur();
const annee = new Date().getFullYear();

async function codeRecu(numero) {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${RELAIS}/sms-dev/dernier?telephone=216${numero}`).catch(() => null);
    if (r?.ok) return (await r.json()).code;
    await pause(250);
  }
  throw new Error(`aucun SMS pour le ${numero}`);
}

/** Le numéro, le code du SMS, puis « Numéro confirmé ». */
async function confirmeNumero(page, numero, lisible) {
  await clic(page, page.getByLabel("Téléphone"));
  await tape(page, lisible);
  await clic(page, page.getByRole("button", { name: "Recevoir le code" }));
  await page.getByLabel("Code reçu par SMS").waitFor();
  verifie((await page.locator(".tunnel-etape").first().innerText()).includes("Code envoyé au +216"), "le SMS est annoncé avec le numéro");
  const code = await codeRecu(numero);
  note("INFO  ", `code reçu : ${code}`);
  await tape(page, code);
  await page.locator(".tunnel-identite").waitFor({ timeout: 8000 });
  verifie((await page.locator(".tunnel-identite").innerText()).includes("Numéro confirmé"), "six chiffres tapés : le numéro est confirmé, sans autre clic");
}

async function remplitAdresse(page, { nom, adresse, ville, gouvernorat }) {
  await clic(page, page.getByLabel("Nom et prénom"));
  await tape(page, nom);
  await clic(page, page.getByLabel(/^Adresse/));
  await tape(page, adresse);
  await clic(page, page.getByLabel("Ville ou délégation"));
  await tape(page, ville);
  await page.getByLabel("Gouvernorat", { exact: true }).selectOption({ label: gouvernorat });
  await page.locator(".tunnel-livraison").waitFor({ timeout: 8000 });
}

/* ------------------------------------------------------------------ */
console.log("\n== 1. Maison Selma (gabarit éditorial), grand écran ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "selma-commande");

  await etape("fiche → panier → « Commander »", async () => {
    await page.goto(S + "/produit/robe-bretelles-terracotta", { waitUntil: "networkidle" });
    await clic(page, page.locator(".valeur", { hasText: /^M$/ }));
    await clic(page, page.locator(".achat .btn-ajout"));
    await page.locator(".tiroir-panier[role=dialog]").waitFor();
    const commander = page.locator(".tiroir-panier").getByRole("link", { name: "Commander" });
    verifie(await commander.isVisible(), "le tiroir du panier propose « Commander »");
    await capture(page, "selma-tiroir-commander");
    await clic(page, commander);
    await page.waitForURL(/\/commande$/);
    await page.locator(".tunnel-ligne").first().waitFor();
    await page.locator(".tunnel-totaux").waitFor();
    verifie(await page.evaluate(() => window.scrollY) === 0, "la page de commande s'ouvre en haut");
    verifie((await page.locator(".tunnel-choix").count()) === 0, "sans le module retrait en magasin : pas de choix, la livraison à domicile");
  });

  await etape("la page de commande : récapitulatif relu en base", async () => {
    const ligne = await page.locator(".tunnel-ligne").first().innerText();
    verifie(ligne.includes("Robe à bretelles en lin") && ligne.includes("229,000"), "la ligne dit le produit et le prix lu en base");
    verifie((await page.locator(".tunnel-totaux").innerText()).includes("Selon le gouvernorat"), "sans gouvernorat, les frais ne sont pas devinés");
    const titres = await page.locator(".tunnel-etape > legend").allInnerTexts();
    verifie(titres.join("|").replace(/\s+/g, " ") === "1Vos coordonnées|2Livraison|3Paiement".replace(/\s+/g, " ") || titres.length === 3, `trois temps : ${titres.map((x) => x.replace(/\s+/g, " ").trim()).join(" · ")}`);
    await capture(page, "selma-commande-vide");
  });

  await etape("numéro confirmé par SMS", async () => {
    await confirmeNumero(page, "20555123", "20 555 123");
    await capture(page, "selma-commande-numero-confirme");
  });

  await etape("adresse et gouvernorat : les frais arrivent", async () => {
    await remplitAdresse(page, { nom: "Amel Ben Salah", adresse: "12 rue de Marseille, 3e étage", ville: "Tunis", gouvernorat: "Tunis" });
    const livraison = await page.locator(".tunnel-livraison").innerText();
    note("INFO  ", `livraison : ${livraison.replace(/\s+/g, " ")}`);
    verifie(/7,000/.test(livraison), "Tunis : les frais de la boutique (7,000 TND) s'affichent sous le gouvernorat");
    const total = await page.locator(".tunnel-total").innerText();
    verifie(/236,000/.test(total), `le total suit : 229,000 + 7,000 (${total.replace(/\s+/g, " ")})`);
    verifie((await page.locator(".tunnel-bouton").innerText()).includes("236,000"), "le bouton annonce le montant");
    await capture(page, "selma-commande-remplie");
    await capture(page, "selma-commande-remplie-pleine", true);
  });

  await etape("les conditions de vente, acceptées explicitement", async () => {
    await clic(page, page.locator(".tunnel-bouton"));
    await pause(300);
    verifie((await page.locator(".tunnel-alerte").innerText()).includes("acceptez les conditions de vente"), "sans la case cochée, la commande ne part pas");
    verifie(await page.evaluate(() => document.activeElement?.getAttribute("type")) === "checkbox", "le focus va à la case à cocher");
    const conditions = page.locator(".tunnel-conditions");
    verifie((await conditions.innerText()).includes("rétracter dans les 10 jours ouvrables"), "le délai de rétractation est rappelé");
    verifie(await conditions.locator("a[href='/conditions-de-vente']").count() === 1 && await conditions.locator("a[href='/confidentialite']").count() === 1,
      "les conditions et la politique de confidentialité sont à un clic");
    await capture(page, "selma-commande-conditions");
    await clic(page, conditions.locator("input[type=checkbox]"));
  });

  await etape("confirmer : la page de fin", async () => {
    await clic(page, page.locator(".tunnel-bouton"));
    await page.waitForURL(/\/commande\/merci$/, { timeout: 15000 });
    await page.locator(".merci").waitFor();
    await pause(400);
    verifie(await page.evaluate(() => window.scrollY) === 0, "la page de fin s'ouvre en haut, le titre visible");
    const texte = await page.locator(".merci").innerText();
    verifie(texte.includes("Merci, Amel."), "« Merci, Amel. »");
    verifie(texte.includes(`SEL-${annee}-00001`), "le numéro de la commande est donné");
    verifie(texte.includes("Appel de confirmation") && texte.includes("+216 20 555 123"), "la suite annonce l'appel de confirmation, au bon numéro");
    verifie(texte.includes("236,000"), "le montant à régler au livreur est rappelé");
    verifie((await page.locator("header .bouton-panier-compte").innerText().catch(() => "")) === "0", "le panier s'est vidé");
    await capture(page, "selma-merci");
    await capture(page, "selma-merci-pleine", true);
  });

  await etape("revenir sur /commande : panier vide", async () => {
    await page.goto(S + "/commande", { waitUntil: "networkidle" });
    verifie((await page.locator(".tunnel-vide").innerText()).includes("Votre panier est vide"), "le tunnel dit que le panier est vide");
  });

  await etape("les pages légales, depuis le pied de page", async () => {
    await page.goto(S + "/", { waitUntil: "networkidle" });
    const pied = page.locator("footer .pied-legal");
    verifie((await pied.locator("a").allInnerTexts()).join(" · ") === "Conditions de vente · Mentions légales · Confidentialité",
      "le pied de page mène aux trois pages");
    await clic(page, pied.getByRole("link", { name: "Conditions de vente" }));
    await page.waitForURL(/\/conditions-de-vente$/);
    await page.waitForLoadState("networkidle");
    await pause(1200); // (le défilement en douceur remonte la page)
    verifie(await page.evaluate(() => window.scrollY) < 10, `la page s'ouvre en haut (${await page.evaluate(() => window.scrollY)})`);
    const cgv = await page.locator("main").innerText();
    verifie((await page.locator("h1").innerText()) === "Conditions de vente", "les conditions de vente");
    verifie(cgv.includes("10 jours ouvrables") && cgv.includes("loi n° 2000-83"), "la rétractation, selon la loi n° 2000-83");
    verifie(cgv.includes("à la livraison, en espèces") && cgv.includes("Les frais de livraison sont de 7,000"), "ce que fait vraiment la boutique : paiement à la livraison, 7,000 TND de livraison");
    verifie(cgv.includes("refuser le colis"), "le refus à la livraison est dit");
    await capture(page, "selma-conditions-de-vente");
    await capture(page, "selma-conditions-de-vente-pleine", true);
    await page.goto(S + "/mentions-legales", { waitUntil: "networkidle" });
    verifie((await page.locator("main").innerText()).includes("Maison Selma") && (await page.locator("main").innerText()).includes("SkanEcom"),
      "les mentions légales : l'éditeur et la plateforme");
    await page.goto(S + "/confidentialite", { waitUntil: "networkidle" });
    const conf = await page.locator("main").innerText();
    verifie(conf.includes("2004-63") && conf.includes("Union européenne"), "la confidentialité : la loi, et où sont les données");
    verifie(!conf.includes("INPDP), sous la référence"), "aucune déclaration INPDP n'est annoncée tant qu'elle n'est pas renseignée");
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 2. Maison Selma, sur téléphone ==");
{
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR",
  });
  const page = await ctx.newPage();
  t.espion(page, "selma-telephone", (url, texte) => /\/commande\/passer/.test(url) && texte === "409");

  await etape("un article, puis la commande", async () => {
    await page.goto(S + "/produit/robe-bretelles-terracotta", { waitUntil: "networkidle" });
    await page.locator(".valeur", { hasText: /^S$/ }).tap();
    await page.locator(".achat .btn-ajout").tap();
    await page.locator(".tiroir-panier[role=dialog]").waitFor();
    await page.locator(".tiroir-panier").getByRole("link", { name: "Commander" }).tap();
    await page.waitForURL(/\/commande$/);
    await page.locator(".tunnel-recap-bascule").waitFor();
    await pause(500);
    verifie(await page.evaluate(() => window.scrollY) === 0, "sur téléphone aussi, la page s'ouvre en haut (quittée défilée)");
    verifie(!(await page.locator(".tunnel-recap-corps").isVisible()), "sur téléphone, le récapitulatif est replié");
    verifie(/TND/.test(await page.locator(".tunnel-recap-bascule").innerText()), "le montant reste visible en tête");
    await capture(page, "selma-telephone-commande");
    await page.locator(".tunnel-recap-bascule").tap();
    await pause(300);
    verifie(await page.locator(".tunnel-recap-corps").isVisible(), "un appui le déplie");
    await capture(page, "selma-telephone-recap-ouvert");
  });

  await etape("envoyé vide : les erreurs, au bon endroit", async () => {
    await page.locator(".tunnel-bouton").tap();
    await pause(400);
    verifie((await page.locator(".tunnel-alerte").innerText()).includes("Quelques informations manquent"), "une alerte résume");
    const erreurs = await page.locator(".champ-erreur:not(:empty)").allInnerTexts();
    verifie(erreurs.length >= 4, `chaque champ manquant dit ce qu'il attend (${erreurs.length})`);
    const actif = await page.evaluate(() => document.activeElement?.getAttribute("type") ?? document.activeElement?.tagName);
    note("INFO  ", `focus après l'envoi : ${actif}`);
    await capture(page, "selma-telephone-erreurs", true);
  });

  await etape("une page légale sur téléphone", async () => {
    await page.goto(S + "/conditions-de-vente", { waitUntil: "networkidle" });
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    verifie(!deborde, "rien ne déborde en largeur");
    await capture(page, "selma-telephone-conditions");
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 3. Quincaillerie du Sud (gabarit technique), grand écran ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "quincaillerie-commande");

  await etape("fiche perceuse → panier → commande", async () => {
    await page.goto(Q + "/produit/perceuse-visseuse-14v", { waitUntil: "networkidle" });
    const kit = page.locator(".valeur", { hasText: /Kit 2 batteries/ });
    if (await kit.count()) await clic(page, kit);
    await clic(page, page.locator(".achat .btn-ajout"));
    await page.locator(".tiroir-panier[role=dialog]").waitFor();
    await clic(page, page.locator(".tiroir-panier").getByRole("link", { name: "Commander" }));
    await page.waitForURL(/\/commande$/);
    await page.locator(".tunnel-totaux").waitFor();
    await capture(page, "quincaillerie-commande-vide");
  });

  await etape("numéro, adresse à Sfax, puis le retrait en magasin", async () => {
    await confirmeNumero(page, "98765432", "98 765 432");
    const choix = page.locator(".tunnel-choix");
    verifie((await choix.count()) === 1 && (await choix.locator('input[value="domicile"]').isChecked()),
      "le retrait est proposé ; la livraison à domicile reste le choix par défaut");
    verifie((await choix.innerText()).includes("Au magasin de Sfax. Prête sous 2 heures"), `le magasin et son temps de préparation : « ${(await choix.locator(".tunnel-mode").nth(1).innerText()).replace(/\s+/g, " ")} »`);
    await remplitAdresse(page, { nom: "Karim Trabelsi", adresse: "Route de Gabès km 4", ville: "Sfax", gouvernorat: "Sfax" });
    note("INFO  ", `livraison : ${(await page.locator(".tunnel-livraison").innerText()).replace(/\s+/g, " ")}`);
    await capture(page, "quincaillerie-commande-remplie");
    const totalDomicile = await page.locator(".tunnel-bouton").innerText();

    // Finalement, il passe au comptoir.
    await clic(page, choix.getByText("Retrait en magasin"));
    await page.waitForFunction(() => document.querySelector(".tunnel-totaux")?.textContent?.includes("Gratuit"), null, { timeout: 5000 }).catch(() => {});
    const sousTotal = (await page.locator(".tunnel-totaux > div").first().innerText()).replace(/\D/g, "");
    const totalRetrait = await page.locator(".tunnel-bouton").innerText();
    verifie((await page.locator(`input[autocomplete="address-line1"]`).count()) === 0 && (await page.locator(".tunnel-magasin").innerText()).includes("Route de Tunis, km 3"),
      "plus d'adresse à saisir : le magasin à la place, avec ses horaires");
    verifie((await page.locator(".tunnel-totaux").innerText()).includes("Retrait en magasin") && totalRetrait.replace(/\D/g, "") === sousTotal && totalRetrait !== totalDomicile,
      `le récapitulatif relu en base : retrait gratuit, total ${totalRetrait.replace(/\s+/g, " ")} (au lieu de ${totalDomicile.replace(/\s+/g, " ")})`);
    verifie((await page.locator(".tunnel-mode").last().innerText()).includes("au comptoir"), "le paiement se fait au comptoir");
    await capture(page, "quincaillerie-commande-retrait", true);
    await clic(page, page.locator(".tunnel-conditions input[type=checkbox]"));
    await clic(page, page.locator(".tunnel-bouton"));
    await page.waitForURL(/\/commande\/merci$/, { timeout: 15000 });
    await page.locator(".merci").waitFor();
    await pause(400);
    const merci = await page.locator(".merci").innerText();
    verifie(merci.includes(`QDS-${annee}-00001`), "numéro de commande de la quincaillerie (son préfixe, son compteur)");
    verifie(merci.includes("À retirer au magasin") && merci.includes("Route de Tunis, km 3") && merci.includes("Retrait et paiement"),
      "la page de fin : où la retirer, et le paiement au comptoir");
    await capture(page, "quincaillerie-merci");
  });

  await etape("mes commandes : la commande, où la retirer ; puis un autre numéro", async () => {
    await clic(page, page.locator(".merci-actions").getByRole("link", { name: "Suivre mes commandes" }));
    await page.waitForURL(/\/compte$/);
    await page.locator(".compte-carte").first().waitFor({ timeout: 8000 });
    const carte = await page.locator(".compte-carte").first().innerText();
    verifie(carte.includes(`QDS-${annee}-00001`) && carte.includes("À retirer : Route de Tunis, km 3, Sfax")
      && carte.includes("La boutique vous appelle pour la confirmer"),
      "sa commande, où la retirer, et où elle en est");
    verifie((await page.locator(".compte-identite").innerText()).includes("+216 98 765 432"), "connecté avec le numéro confirmé au tunnel");
    await capture(page, "quincaillerie-mes-commandes");
    // Un autre numéro, sans commande : la connexion par SMS, puis la liste vide.
    await clic(page, page.getByRole("button", { name: "Se déconnecter" }));
    await page.locator(".compte-connexion").waitFor();
    await clic(page, page.getByLabel("Téléphone"));
    await tape(page, "22 333 444");
    await clic(page, page.getByRole("button", { name: "Recevoir le code" }));
    await page.getByLabel("Code reçu par SMS").waitFor();
    await tape(page, await codeRecu("22333444"));
    await page.locator(".compte-vide").waitFor({ timeout: 8000 });
    verifie((await page.locator(".compte-vide").innerText()).includes("Aucune commande"), "un numéro sans commande : la page le dit, et propose le catalogue");
    await capture(page, "quincaillerie-mes-commandes-vide");
  });

  await etape("les conditions de vente, gabarit technique", async () => {
    await page.goto(Q + "/conditions-de-vente", { waitUntil: "networkidle" });
    verifie((await page.locator("main").innerText()).includes("offerte à partir de 500,000"), "le seuil de livraison offerte de la quincaillerie");
    verifie((await page.locator("main").innerText()).includes("retirer sa commande au magasin, sans frais : Route de Tunis, km 3, Sfax"),
      "et le retrait en magasin, avec son adresse");
    await capture(page, "quincaillerie-conditions-de-vente");
  });
  await ctx.close();
}

await navigateur.close();
process.exit(t.bilan());
