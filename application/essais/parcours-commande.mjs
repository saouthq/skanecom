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
    const etapeDuMoment = page.locator(".compte-carte").first().locator(".compte-frise [aria-current=step]");
    verifie((await etapeDuMoment.innerText()).trim() === "Reçue", "la frise de suivi marque « Reçue » (retrait : Reçue, Confirmée, Prête, Retirée)");
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

  await etape("retirée : un problème avec un article (service après-vente)", async () => {
    // La commande est retirée au comptoir : la base le note (clé de service
    // de l'API locale, comme le ferait le backoffice).
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const r = await fetch(`${RELAIS}/rest/v1/commandes?numero=eq.QDS-${annee}-00001`, {
      method: "PATCH",
      headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ statut: "livree" }),
    });
    verifie(r.ok, `la commande est retirée (${r.status})`);
    await clic(page, page.getByRole("button", { name: "Se déconnecter" }));
    await page.locator(".compte-connexion").waitFor();
    await clic(page, page.getByLabel("Téléphone"));
    await tape(page, "98 765 432");
    await clic(page, page.getByRole("button", { name: "Recevoir le code" }));
    await page.getByLabel("Code reçu par SMS").waitFor();
    await tape(page, await codeRecu("98765432"));
    const carte = page.locator(".compte-carte").first();
    await carte.locator(".sav-signaler").waitFor({ timeout: 8000 });
    await clic(page, carte.getByRole("button", { name: "Un problème avec un article ?" }));
    const formulaire = carte.locator(".sav-formulaire");
    verifie((await formulaire.innerText()).includes("Perceuse"), "l'article de la commande est là, sans rien à chercher");
    await clic(page, formulaire.getByLabel("Ce qui ne va pas"));
    await tape(page, "Ne marche");
    await clic(page, formulaire.getByRole("button", { name: "Envoyer la demande" }));
    verifie((await formulaire.getByRole("alert").innerText()).includes("10 caractères"), "une description trop courte est signalée, rien ne part");
    await tape(page, " plus : la batterie ne tient pas la charge plus de dix minutes.");
    await clic(page, formulaire.getByLabel(/Numéro de série/));
    await tape(page, "PV14-2026-0457");
    await capture(page, "quincaillerie-sav-formulaire");
    await clic(page, formulaire.getByRole("button", { name: "Envoyer la demande" }));
    await carte.locator(".sav-envoyee").waitFor({ timeout: 8000 });
    verifie((await carte.locator(".sav-envoyee").innerText()).includes("Demande SAV-00001 envoyée"), "la demande est numérotée, la boutique rappelle");
    await page.locator(".sav-mes").waitFor({ timeout: 8000 });
    verifie((await page.locator(".sav-mes").innerText()).includes("Reçue : la boutique vous rappelle"), "« Mes demandes » dit où elle en est");
    verifie((await carte.innerText()).includes("Retirée au magasin : Route de Tunis, km 3, Sfax"), "la commande dit qu'elle a été retirée");
    verifie((await carte.locator(".compte-frise [data-faite]").count()) === 4 && (await carte.locator(".compte-frise [aria-current=step]").innerText()).trim() === "Retirée",
      "la frise est complète, jusqu'à « Retirée »");
    await capture(page, "quincaillerie-sav-envoyee", true);
    await clic(page, carte.getByRole("button", { name: "Un problème avec un article ?" }));
    verifie((await carte.locator(".sav-formulaire").innerText()).includes("demande SAV-00001 en cours")
      && await carte.getByRole("button", { name: "Envoyer la demande" }).isDisabled(),
      "une seconde demande sur le même article : la première est rappelée, rien ne part");
    await clic(page, carte.getByRole("button", { name: "Annuler" }));
    await page.goto(Q + "/garantie-et-sav", { waitUntil: "networkidle" });
    const g = await page.locator("main").innerText();
    verifie(g.includes("Garantie 12 mois") && g.includes("Revendeur officiel Atelier Pro") && g.includes("Faire une demande"),
      "la page Garantie et SAV : la garantie annoncée, le revendeur officiel, comment faire");
    await capture(page, "quincaillerie-garantie-sav", true);
  });

  await etape("les conditions de vente, gabarit technique", async () => {
    await page.goto(Q + "/conditions-de-vente", { waitUntil: "networkidle" });
    verifie((await page.locator("main").innerText()).includes("offerte à partir de 500,000"), "le seuil de livraison offerte de la quincaillerie");
    verifie((await page.locator("main").innerText()).includes("retirer sa commande au magasin, sans frais : Route de Tunis, km 3, Sfax"),
      "et le retrait en magasin, avec son adresse");
    await capture(page, "quincaillerie-conditions-de-vente");
  });

  await etape("compte professionnel : demandé, validé, prix pro jusqu'au devis", async () => {
    await page.goto(Q + "/compte", { waitUntil: "networkidle" });
    const espace = page.locator(".pro-espace");
    await espace.waitFor({ timeout: 8000 });
    verifie((await espace.innerText()).includes("Vous êtes un professionnel"), "« Mes commandes » invite à demander un compte pro");
    await clic(page, espace.getByRole("button", { name: "Demander un compte pro" }));
    await clic(page, page.getByLabel("Raison sociale"));
    await tape(page, "Atelier Hédi");
    await clic(page, espace.getByRole("button", { name: "Envoyer la demande" }));
    await page.locator(".pro-espace[data-statut=demande]").waitFor({ timeout: 8000 });
    verifie((await espace.innerText()).includes("Demande envoyée"), "la demande part, la page le dit");
    await capture(page, "quincaillerie-compte-pro-demande");
    // La boutique valide (clé de service de l'API locale, comme le ferait le backoffice).
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const r = await fetch(`${RELAIS}/rest/v1/comptes_pro?raison_sociale=eq.${encodeURIComponent("Atelier Hédi")}`, {
      method: "PATCH",
      headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ statut: "valide", decide_le: new Date().toISOString() }),
    });
    verifie(r.ok, `la boutique valide le compte (${r.status})`);
    await page.goto(Q + "/produit/perceuse-visseuse-14v", { waitUntil: "networkidle" });
    const bloc = page.locator(".fiche-prix-pro");
    await bloc.waitFor({ timeout: 8000 });
    const texte = (await bloc.innerText()).replace(/\s+/g, " ");
    verifie(texte.includes("131,000") && texte.includes("149,000"), `la fiche : le prix pro, le public barré à côté (${texte})`);
    await capture(page, "quincaillerie-fiche-prix-pro");
    await clic(page, page.locator(".achat .btn-ajout"));
    await page.locator(".tiroir-panier[role=dialog]").waitFor();
    verifie((await page.locator(".tiroir-panier .panier-ligne").first().innerText()).includes("131,000"), "le panier : au prix pro");
    await clic(page, page.locator(".tiroir-panier").getByRole("link", { name: "Commander" }));
    await page.waitForURL(/\/commande$/);
    // Le devis lit la session de l'acheteur, comme la commande : même prix des deux côtés.
    await page.locator(".tunnel-tarif-pro").waitFor({ timeout: 8000 });
    verifie((await page.locator(".tunnel-tarif-pro").innerText()).includes("18,000"), "le récapitulatif : tarif pro, 18 TND d'économie");
    await capture(page, "quincaillerie-tunnel-tarif-pro");
    // Les cartes d'un rayon aussi : « Pro » et le prix pro, en une lecture pour la page.
    await page.goto(Q + "/categorie/outillage", { waitUntil: "networkidle" });
    const carte = page.locator(".te-carte", { hasText: "Perceuse-visseuse" });
    await carte.locator(".carte-pro").waitFor({ timeout: 8000 });
    verifie((await carte.locator(".te-carte-prix").innerText()).includes("131,000"), "les cartes du rayon : la pastille « Pro », dès le prix pro");
    verifie((await page.locator(".te-carte [data-pro]").count()) === (await page.locator(".te-carte").count()), "chaque carte du rayon a son prix pro");
    await capture(page, "quincaillerie-rayon-prix-pro");
  });

  await etape("devis : le panier demandé, chiffré, accepté au tunnel", async () => {
    // Le panier : dix forets seulement (la perceuse de l'étape d'avant en sort), envoyés en demande de devis.
    await page.goto(Q + "/produit/forets-metal-cobalt", { waitUntil: "networkidle" });
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("skanecom.panier.")) localStorage.removeItem(k); });
    await page.reload({ waitUntil: "networkidle" });
    for (let i = 0; i < 9; i++) await page.locator(".achat .qte button").last().click();
    await clic(page, page.locator(".achat .btn-ajout"));
    const tiroir = page.locator(".tiroir-panier[role=dialog]");
    await tiroir.waitFor();
    await clic(page, tiroir.locator(".panier-devis"));
    await page.waitForURL(/\/devis$/);
    await page.locator(".devis-formulaire").waitFor({ timeout: 8000 });
    verifie((await page.locator(".devis-ligne").count()) >= 1, "la page de demande reprend le panier");
    await clic(page, page.getByLabel(/Votre chantier/));
    await tape(page, "Atelier à Gabès, livraison avant la fin du mois");
    await clic(page, page.getByRole("button", { name: "Envoyer la demande de devis" }));
    await page.locator(".devis-envoyee").waitFor({ timeout: 8000 });
    const numero = (await page.locator(".devis-envoyee h2").innerText()).match(/DEV-\d+/)?.[0] ?? "";
    verifie(numero === "DEV-00003", `la demande part (${numero}), le panier devient une demande`);
    await capture(page, "quincaillerie-devis-envoye");
    // La boutique chiffre et envoie (clé de service de l'API locale, comme le ferait le backoffice).
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const entetes = { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json", prefer: "return=minimal" };
    const ici = "boutique_id=eq.00000000-0000-4000-8000-000000000002";
    const [{ id }] = await (await fetch(`${RELAIS}/rest/v1/devis?${ici}&numero=eq.${numero}&select=id`, { headers: entetes })).json();
    await fetch(`${RELAIS}/rest/v1/devis_lignes?${ici}&devis_id=eq.${id}`, { method: "PATCH", headers: entetes, body: JSON.stringify({ prix_devis_millimes: 3500 }) });
    const valide = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const r = await fetch(`${RELAIS}/rest/v1/devis?${ici}&id=eq.${id}`, { method: "PATCH", headers: entetes,
      body: JSON.stringify({ statut: "envoye", envoye_le: new Date().toISOString(), valide_jusqu_au: valide, frais_livraison_millimes: 0, note_boutique: "Prix atelier" }) });
    verifie(r.ok, `la boutique l'envoie (${r.status})`);
    // « Mes devis » : prêt, accepté au tunnel, à ses prix.
    await page.goto(Q + "/compte", { waitUntil: "networkidle" });
    const carte = page.locator(".devis-carte", { hasText: numero });
    await carte.waitFor({ timeout: 8000 });
    verifie((await carte.innerText()).includes("Prêt") && (await carte.innerText()).includes("35,000"), "« Mes devis » : prêt, 10 × 3,500 = 35,000 TND");
    await capture(page, "quincaillerie-mes-devis");
    await clic(page, carte.getByRole("link", { name: "Accepter et commander" }));
    await page.waitForURL(/\/commande\?devis=/);
    await page.locator(".tunnel-tarif-devis").waitFor({ timeout: 8000 });
    verifie((await page.getByRole("button", { name: "Modifier le panier" }).count()) === 0, "au tunnel du devis, ses lignes sont figées");
    for (const [label, valeur] of [["Nom et prénom", "Hédi Mansouri"], [/^Adresse/, "Zone industrielle, lot 12"], ["Ville ou délégation", "Gabès"]]) {
      await page.getByLabel(label).fill(valeur);
    }
    await page.getByLabel("Gouvernorat", { exact: true }).selectOption({ label: "Gabès" });
    await page.waitForTimeout(800);
    verifie((await page.locator(".tunnel-totaux").innerText()).includes("35,000"), "le récapitulatif : les prix du devis, livraison offerte");
    await capture(page, "quincaillerie-tunnel-devis");
    await page.locator(".tunnel-conditions input[type=checkbox]").check();
    await clic(page, page.locator(".tunnel-bouton"));
    await page.waitForURL(/\/commande\/merci$/, { timeout: 15000 });
    await page.locator(".merci").waitFor();
    verifie((await page.locator(".merci").innerText()).includes("35,000"), "la commande naît aux prix du devis (35,000 TND)");
    await capture(page, "quincaillerie-merci-devis");
  });

  await etape("devis : le lien ouvert sans session, la connexion sur place", async () => {
    // L'électricienne du jeu de démo (compte relié par outils/api-locale.sh) ouvre
    // le lien de son devis sur un autre téléphone : pas de session.
    const tel = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "fr-FR" });
    const p = await tel.newPage();
    await p.goto(Q + "/commande?devis=DEV-00002", { waitUntil: "networkidle" });
    const connexion = p.locator(".tunnel-vide .connexion-sms");
    await connexion.waitFor({ timeout: 8000 });
    verifie((await connexion.innerText()).includes("Votre devis vous attend"), "sans session : la connexion par SMS, pas une erreur");
    await p.getByLabel("Téléphone").fill("22 345 002");
    await p.getByRole("button", { name: "Recevoir le code" }).click();
    await p.getByLabel("Code reçu par SMS").fill(await codeRecu("22345002"));
    await p.locator(".tunnel-tarif-devis").waitFor({ state: "attached", timeout: 8000 });
    verifie((await p.locator(".tunnel-recap").textContent()).includes("Prix du devis DEV-00002"), "connectée : le devis s'ouvre, à ses prix");
    await capture(p, "quincaillerie-devis-lien-connexion");
    await tel.close();
  });
  await ctx.close();
}

await navigateur.close();
process.exit(t.bilan());
