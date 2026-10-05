import { creeTesteur } from "./testeur.mjs";

/* ============================================================================
   PARCOURS DE COMMANDE — un acheteur qui commande pour de vrai, dans les deux
   gabarits : panier, « Commander », numéro de téléphone, code reçu par SMS,
   adresse, frais du gouvernorat, confirmation, page de fin. Puis le même sur
   téléphone, avec les erreurs d'un formulaire envoyé vide.

     cd application && bun run parcours:commande     # vitrine sur 127.0.0.1:4200

   Le « fournisseur de SMS » local est le relais de l'API (outils/api-locale.sh) :
   le code se relit sur http://127.0.0.1:54321/sms-dev/dernier?telephone=…
   De même pour les e-mails (connexion par code e-mail, réglage
   compte.verification) : http://127.0.0.1:54321/email-dev/dernier?email=…
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

async function codeEmail(adresse) {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${RELAIS}/email-dev/dernier?email=${encodeURIComponent(adresse)}`).catch(() => null);
    if (r?.ok) return (await r.json()).code;
    await pause(250);
  }
  throw new Error(`aucun e-mail pour ${adresse}`);
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
  // Cette cliente a accepté les pixels de Selma (supabase/seed-pixels.sql) : le
  // tunnel et la page de fin leur disent la commande (scripts : le bouchon du testeur).
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR", consentementPub: "accepte" });
  const filesPub = (page) => page.evaluate(() => ({
    meta: (window.fbq?.queue ?? []).filter((a) => a[0] === "track").map((a) => ({ nom: a[1], ids: a[2]?.content_ids ?? [], valeur: a[2]?.value, evenement: a[3]?.eventID })),
    tiktok: (Array.isArray(window.ttq) ? window.ttq : []).filter((a) => a[0] === "track").map((a) => ({ nom: a[1], valeur: a[2]?.value, evenement: a[3]?.event_id })),
  }));
  const page = await ctx.newPage();
  t.espion(page, "selma-commande");

  await etape("fiche → panier → « Commander »", async () => {
    await page.goto(S + "/produit/robe-bretelles-terracotta", { waitUntil: "networkidle" });
    await clic(page, page.locator(".valeur", { hasText: /^M$/ }));
    await clic(page, page.locator(".achat .btn-ajout"));
    await page.locator(".confirmation-ajout").waitFor({ timeout: 3000 });
    const commander = page.locator(".confirmation-ajout").getByRole("link", { name: /^Commander/ });
    verifie(await commander.isVisible(), "la confirmation de l'ajout propose « Commander »");
    await capture(page, "selma-confirmation-commander");
    await clic(page, commander);
    await page.waitForURL(/\/commande$/);
    await page.locator(".tunnel-ligne").first().waitFor();
    await page.locator(".tunnel-totaux").waitFor();
    verifie(await page.evaluate(() => window.scrollY) === 0, "la page de commande s'ouvre en haut");
    verifie((await page.locator(".tunnel-choix").count()) === 0, "sans le module retrait en magasin : pas de choix, la livraison à domicile");
    const debut = (await filesPub(page)).meta.find((e) => e.nom === "InitiateCheckout");
    verifie(debut && debut.ids.join(",") === "SEL01-TER-M" && debut.valeur === 229 && (await page.locator(".pub-consentement").count()) === 0,
      `pixels acceptés : la commande ouverte (InitiateCheckout, ${debut?.ids.join(",")}, ${debut?.valeur} TND), aucun bandeau dans le tunnel`);
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
    // Selma relance ses paniers abandonnés (supabase/seed-paniers.sql) : la
    // cliente connectée le lit sous son identité, avant de rien remplir.
    const relance = page.locator(".tunnel-relance");
    verifie(await relance.isVisible() && (await relance.innerText()).includes("pourra vous écrire une fois"),
      "connectée : le tunnel dit que la boutique pourra lui rappeler son panier, une fois");
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
    const achat = await filesPub(page);
    const meta = achat.meta.find((e) => e.nom === "Purchase");
    const tiktok = achat.tiktok.find((e) => e.nom === "CompletePayment");
    verifie(meta?.evenement === `SEL-${annee}-00001` && meta?.valeur === 229 && tiktok?.evenement === `SEL-${annee}-00001`,
      `l'achat, une fois, chez Meta (Purchase) et TikTok (CompletePayment), le numéro pour identifiant (${meta?.evenement}, ${meta?.valeur} TND)`);
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
    verifie(conf.includes("le texte et les photos jointes"), "elle dit que les photos jointes à un avis sont gardées et publiées avec lui");
  });

  await etape("livrée : l'avis avec une photo, réduite par le navigateur", async () => {
    // Une commande livrée pour Amel, connectée (numéro confirmé plus haut) :
    // posée par la clé de service de l'API locale, comme la vivrait l'équipe.
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const rest = async (chemin, methode = "GET", corps) => {
      const r = await fetch(`${RELAIS}/rest/v1/${chemin}`, {
        method: methode,
        headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json", prefer: "return=representation" },
        body: corps ? JSON.stringify(corps) : undefined,
      });
      return r.ok ? r.json() : Promise.reject(new Error(`${methode} ${chemin} : ${r.status} ${await r.text()}`));
    };
    const SELMA = "00000000-0000-4000-8000-000000000003";
    const [client] = await rest(`clients?boutique_id=eq.${SELMA}&telephone=eq.%2B21620555123&user_id=not.is.null&select=id`);
    const [chemise] = await rest(`variantes?boutique_id=eq.${SELMA}&sku=eq.SEL13-BLA-M&select=id,prix_millimes`);
    const [commande] = await rest("commandes", "POST", {
      boutique_id: SELMA, numero: `SEL-${annee}-00991`, origine: "vitrine", client_id: client.id, contact_nom: "Amel Ben Salah",
      contact_telephone: "+21620555123", livraison_ligne1: "12 rue de Marseille", livraison_ville: "Tunis", livraison_gouvernorat: "tunis",
    });
    await rest("commande_lignes", "POST", {
      boutique_id: SELMA, commande_id: commande.id, variante_id: chemise.id, produit_nom: "Chemise ample en lin", variante_libelle: "Blanc, M",
      sku: "SEL13-BLA-M", prix_unitaire_millimes: chemise.prix_millimes, quantite: 1, total_ligne_millimes: chemise.prix_millimes,
    });
    await rest("confirmations", "POST", { boutique_id: SELMA, commande_id: commande.id, canal: "appel", resultat: "confirmee" });
    for (const etat of [{ statut: "confirmee" }, { statut: "expediee", transporteur: "Aramex", numero_suivi: "TN47999002" }, { statut: "livree", statut_paiement: "paye" }]) {
      await rest(`commandes?id=eq.${commande.id}`, "PATCH", etat);
    }
    await page.goto(S + "/compte", { waitUntil: "networkidle" });
    const bloc = page.locator(".compte-carte", { hasText: `SEL-${annee}-00991` }).locator(".avis-commande");
    await bloc.waitFor({ timeout: 8000 });
    await clic(page, bloc.getByRole("button", { name: "Donner mon avis" }));
    const f = bloc.locator(".avis-formulaire");
    await clic(page, f.locator(".avis-saisie-etoiles label").nth(4));
    await clic(page, f.getByLabel(/Votre avis/));
    await tape(page, "Le lin est doux, la coupe ample.");
    // Une photo de téléphone : 2 400 × 1 800, lourde ; le navigateur la réduit avant l'envoi.
    const lourde = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 2400; c.height = 1800;
      const g = c.getContext("2d");
      for (let i = 0; i < 2400; i += 3) { g.fillStyle = `hsl(${18 + (i % 23)}, 55%, ${45 + (i % 17)}%)`; g.fillRect(i, 0, 3, 1800); }
      const b = await new Promise((r) => c.toBlob(r, "image/png"));
      return [...new Uint8Array(await b.arrayBuffer())];
    });
    await f.locator("input[type=file]").setInputFiles({ name: "IMG_2041.png", mimeType: "image/png", buffer: Buffer.from(lourde) });
    await f.locator(".avis-depot-apercu").waitFor({ timeout: 3000 });
    verifie((await f.locator(".avis-depot-apercu").count()) === 1 && (await f.getByRole("button", { name: "Retirer la photo 1" }).count()) === 1,
      "la photo choisie se voit avant l'envoi, et se retire");
    await capture(page, "selma-avis-photo-choisie");
    await clic(page, f.getByRole("button", { name: "Publier mon avis" }));
    await bloc.locator(".avis-merci").waitFor({ timeout: 15000 });
    verifie((await bloc.locator(".avis-merci").innerText()).includes("Avec 1 photo."), "« Merci ! … Avec 1 photo. »");
    const photos = await rest(`avis_photos?boutique_id=eq.${SELMA}&select=chemin,largeur,hauteur,avis!inner(commande_id)&avis.commande_id=eq.${commande.id}`);
    verifie(photos.length === 1 && /^maison-selma\/avis\/[0-9a-f-]{36}\/[a-z0-9]{12}\.(webp|jpg)$/.test(photos[0].chemin) && photos[0].largeur <= 1600,
      `en base : rangée sous le dossier de l'avis, réduite (${photos[0]?.chemin} ${photos[0]?.largeur}×${photos[0]?.hauteur})`);
    const fichier = await fetch(`${process.env.NEXT_PUBLIC_FICHIERS_URL ?? `${RELAIS}/fichiers`}/${photos[0]?.chemin}`);
    const poids = (await fichier.arrayBuffer()).byteLength;
    verifie(fichier.ok && poids < lourde.length / 3, `le fichier est déposé, bien plus léger que l'original (${poids} octets contre ${lourde.length})`);
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
    await page.locator(".confirmation-ajout").waitFor({ timeout: 3000 });
    await page.locator(".confirmation-ajout").getByRole("link", { name: /^Commander/ }).tap();
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

  await etape("achat express : un autre article, droit à la commande, le panier intact", async () => {
    // Selma a le réglage commande.achat_express (jeu de démo) ; la robe S de
    // l'étape d'avant attend dans le panier.
    await page.goto(S + "/produit/robe-longue-boheme", { waitUntil: "networkidle" });
    await page.locator(".valeur", { hasText: /^M$/ }).tap();
    const express = page.locator(".fiche-express .btn-express");
    verifie((await express.innerText()).includes("Commander maintenant"), "la fiche propose « Commander maintenant » sous l'ajout au panier");
    await capture(page, "selma-telephone-fiche-express");
    await express.tap();
    await page.waitForURL(/\/commande\?article=/);
    await page.locator(".tunnel-recap-bascule").waitFor();
    verifie((await page.locator(".tunnel-tete").innerText()).includes("votre panier n'est pas touché"), "le tunnel dit que le panier n'est pas touché");
    await page.locator(".tunnel-recap-bascule").tap();
    const recap = page.locator(".tunnel-recap-corps");
    verifie((await recap.locator(".tunnel-ligne").count()) === 1 && (await recap.innerText()).includes("Robe longue"), "le récapitulatif : cette robe seule");
    verifie((await page.getByRole("button", { name: "Modifier le panier" }).count()) === 0, "rien à modifier : l'article vient de sa fiche");
    await capture(page, "selma-telephone-tunnel-express");
    await confirmeNumero(page, "20555777", "20 555 777");
    await remplitAdresse(page, { nom: "Leila Gharbi", adresse: "3 avenue Habib Bourguiba", ville: "Sousse", gouvernorat: "Sousse" });
    await page.locator(".tunnel-conditions input[type=checkbox]").check();
    await page.locator(".tunnel-bouton").tap();
    await page.waitForURL(/\/commande\/merci$/, { timeout: 15000 });
    await page.locator(".merci").waitFor();
    verifie((await page.locator(".merci").innerText()).includes("289,000"), "la commande : la robe longue, à son prix");
    await pause(400);
    verifie((await page.locator("header .bouton-panier-compte").innerText().catch(() => "")).trim() === "1", "le panier garde la robe S de tout à l'heure");
    await capture(page, "selma-telephone-merci-express");
  });

  await etape("par e-mail : un code sans SMS, puis le numéro du livreur", async () => {
    // Selma garde le réglage par défaut : SMS ou e-mail, au choix.
    await page.goto(S + "/commande", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Changer de numéro" }).tap();
    await page.locator(".identification-canaux").waitFor();
    verifie(await page.getByRole("radio", { name: "SMS" }).isChecked(), "deux façons de recevoir le code : le SMS d'abord");
    await capture(page, "selma-telephone-connexion-choix");
    await page.getByRole("radio", { name: "E-mail" }).check();
    const adresse = page.getByLabel("Adresse e-mail");
    await adresse.tap();
    await tape(page, "Leila.Gharbi@exemple.tn");
    await page.getByRole("button", { name: "Recevoir le code" }).tap();
    await page.getByLabel("Code reçu par e-mail").waitFor();
    verifie((await page.locator(".tunnel-etape").first().innerText()).includes("Code envoyé à leila.gharbi@exemple.tn"), "l'e-mail est annoncé, à l'adresse en minuscules");
    await capture(page, "selma-telephone-code-email");
    await tape(page, await codeEmail("leila.gharbi@exemple.tn"));
    await page.locator(".tunnel-identite").waitFor({ timeout: 8000 });
    verifie((await page.locator(".tunnel-identite").innerText()).includes("Adresse confirmée : leila.gharbi@exemple.tn"), "six chiffres tapés : l'adresse est confirmée");
    const numero = page.getByLabel("Téléphone");
    verifie(await numero.isVisible() && (await numero.inputValue()) === "", "reste le numéro du livreur, à saisir : un compte e-mail n'en a pas");
    // Le formulaire garde l'adresse saisie avant le changement de compte : on la réécrit.
    await page.getByLabel("Nom et prénom").fill("Leila Gharbi");
    await page.getByLabel("Adresse", { exact: true }).fill("3 avenue Habib Bourguiba");
    await page.getByLabel("Ville ou délégation").fill("Sousse");
    await page.getByLabel("Gouvernorat", { exact: true }).selectOption({ label: "Sousse" });
    await page.locator(".tunnel-livraison").waitFor({ timeout: 8000 });
    await page.locator(".tunnel-conditions input[type=checkbox]").check();
    await page.locator(".tunnel-bouton").tap();
    await pause(300);
    verifie((await page.locator(".tunnel-etape").first().innerText()).includes("Numéro tunisien à 8 chiffres attendu"), "sans numéro, la commande ne part pas");
    verifie(await page.evaluate(() => document.activeElement?.getAttribute("type")) === "tel", "le focus va au numéro");
    await tape(page, "50 111 222");
    const sousEntete = await page.evaluate(() => {
      const champ = document.activeElement?.getBoundingClientRect();
      const entete = document.querySelector("header")?.getBoundingClientRect();
      return Boolean(champ && entete && champ.top < entete.bottom);
    });
    verifie(!sousEntete, "le champ du numéro reste visible sous l'en-tête collant");
    await capture(page, "selma-telephone-identite-email");
    await page.locator(".tunnel-bouton").tap();
    await page.waitForURL(/\/commande\/merci$/, { timeout: 15000 });
    await page.locator(".merci").waitFor();
    verifie((await page.locator(".merci").innerText()).includes("+216 50 111 222"), "l'appel de confirmation se fera au numéro saisi");
  });

  await etape("mes commandes, connectée par e-mail", async () => {
    await page.goto(S + "/compte", { waitUntil: "networkidle" });
    await page.locator(".compte-carte").first().waitFor({ timeout: 8000 });
    verifie((await page.locator(".compte-identite").innerText()).includes("Connecté avec leila.gharbi@exemple.tn"), "le compte, c'est l'adresse e-mail");
    await page.getByRole("button", { name: "Se déconnecter" }).tap();
    await page.locator(".compte-connexion").waitFor();
    verifie((await page.locator(".compte-connexion").innerText()).includes("par SMS ou par e-mail"), "on se reconnecte comme à la commande, par SMS ou par e-mail");
    await page.getByRole("radio", { name: "E-mail" }).check();
    await page.getByLabel("Adresse e-mail").fill("leila.gharbi@exemple.tn");
    await page.getByRole("button", { name: "Recevoir le code" }).tap();
    // Le champ du code d'abord : le relais garde encore le code d'avant tant que le nouveau n'est pas parti.
    const champCode = page.getByLabel("Code reçu par e-mail");
    await champCode.waitFor();
    await champCode.fill(await codeEmail("leila.gharbi@exemple.tn"));
    await page.locator(".compte-carte").first().waitFor({ timeout: 8000 });
    verifie((await page.locator(".compte-carte").count()) === 1, "sa commande est là (celles du compte SMS sont à part)");
    await capture(page, "selma-telephone-mes-commandes-email");
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 2 bis. Maison Selma : un code promo, au clavier ==");
{
  // Selma a le module promotions (supabase/seed-promotions.sql) : BIENVENUE10
  // (−10 % dès 100 TND, une fois par client), LIVRAISON (offerte dès 150 TND).
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "selma-code-promo");
  const retirer = () => page.locator(".tunnel-promo-applique").getByRole("button", { name: "Retirer le code" });
  const dansLeChamp = () => page.evaluate(() => Boolean(document.activeElement?.id?.endsWith("-code")));

  await etape("le code, replié tant qu'on n'en a pas", async () => {
    await page.goto(S + "/produit/robe-bretelles-terracotta", { waitUntil: "networkidle" });
    await clic(page, page.locator(".valeur", { hasText: /^M$/ }));
    await clic(page, page.locator(".achat .btn-ajout"));
    await page.locator(".confirmation-ajout").waitFor({ timeout: 3000 });
    await clic(page, page.locator(".confirmation-ajout").getByRole("link", { name: /^Commander/ }));
    await page.waitForURL(/\/commande$/);
    await page.locator(".tunnel-totaux").waitFor();
    await confirmeNumero(page, "20555999", "20 555 999");
    await remplitAdresse(page, { nom: "Emna Trabelsi", adresse: "8 rue d'Alger", ville: "Tunis", gouvernorat: "Tunis" });
    const lien = page.locator(".tunnel-promo-ouvrir");
    verifie((await lien.innerText()).includes("Vous avez un code promo ?") && (await page.locator(".tunnel-promo input").count()) === 0,
      "un lien discret, pas un champ vide qui enverrait chercher un code ailleurs");
    await lien.focus();
    await page.keyboard.press("Enter");
    await pause(150);
    verifie(await dansLeChamp(), "Entrée l'ouvre, le focus dans le champ");
  });

  await etape("un code inconnu, puis BIENVENUE10", async () => {
    await tape(page, "noel");
    await page.keyboard.press("Enter");
    await page.locator(".tunnel-promo .champ-erreur:not(:empty)").waitFor({ timeout: 5000 });
    verifie(/\/commande$/.test(page.url()) && (await page.locator(".tunnel-promo .champ-erreur").innerText()).includes("n'existe pas"),
      "Entrée applique le code sans envoyer la commande ; inconnu, c'est dit sous le champ");
    await page.keyboard.press("Control+A");
    await tape(page, "bienvenue10");
    await page.keyboard.press("Enter");
    await page.locator(".tunnel-promo-applique").waitFor({ timeout: 5000 });
    verifie((await page.locator(".tunnel-promo-applique").innerText()).includes("Vous économisez 22,900"), "tapé en minuscules, reconnu : −10 %, soit 22,900 TND");
    verifie(await page.evaluate(() => Boolean(document.activeElement?.classList.contains("tunnel-promo-applique"))), "le focus passe à la pastille (lue aux lecteurs d'écran)");
    const totaux = (await page.locator(".tunnel-totaux").innerText()).replace(/\s+/g, " ");
    verifie(totaux.includes("Code BIENVENUE10") && totaux.includes("213,100"), `le récapitulatif : la remise, le total (${totaux})`);
    verifie((await page.locator(".tunnel-bouton").innerText()).includes("213,100"), "le bouton annonce le montant remisé");
    await capture(page, "selma-code-promo");
  });

  await etape("la livraison offerte, puis la commande", async () => {
    await clic(page, retirer());
    await pause(150);
    verifie(await dansLeChamp(), "retiré : le focus revient au champ");
    await page.keyboard.press("Control+A");
    await tape(page, "LIVRAISON");
    await page.keyboard.press("Enter");
    await page.locator(".tunnel-promo-applique").waitFor({ timeout: 5000 });
    verifie((await page.locator(".tunnel-total").innerText()).includes("229,000") && (await page.locator(".tunnel-livraison").innerText()).includes("Offerte"),
      "LIVRAISON : les frais s'effacent (229,000 TND)");
    await clic(page, retirer());
    await pause(150);
    await page.keyboard.press("Control+A");
    await tape(page, "BIENVENUE10");
    await page.keyboard.press("Enter");
    await page.locator(".tunnel-promo-applique").waitFor({ timeout: 5000 });
    await page.locator(".tunnel-conditions input[type=checkbox]").check();
    await clic(page, page.locator(".tunnel-bouton"));
    await page.waitForURL(/\/commande\/merci$/, { timeout: 15000 });
    await page.locator(".merci").waitFor();
    const recap = (await page.locator(".merci-recap").innerText()).replace(/\s+/g, " ");
    verifie(recap.includes("Code BIENVENUE10") && recap.includes("213,100"), "la page de fin : le code, la remise, le total");
    await capture(page, "selma-code-promo-merci");
  });

  await etape("une fois par client", async () => {
    await page.goto(S + "/produit/robe-longue-boheme", { waitUntil: "networkidle" });
    await clic(page, page.locator(".valeur", { hasText: /^M$/ }));
    await clic(page, page.locator(".achat .btn-ajout"));
    await page.goto(S + "/commande", { waitUntil: "networkidle" });
    await page.locator(".tunnel-totaux").waitFor();
    await clic(page, page.locator(".tunnel-promo-ouvrir"));
    await pause(150);
    await tape(page, "BIENVENUE10");
    await page.keyboard.press("Enter");
    await page.locator(".tunnel-promo .champ-erreur:not(:empty)").waitFor({ timeout: 5000 });
    verifie((await page.locator(".tunnel-promo .champ-erreur").innerText()).includes("déjà utilisé"), "le même compte ne le reprend pas : « déjà utilisé »");
    // Les paniers abandonnés : ce panier laissé en route est gardé par la
    // base (le récapitulatif d'une cliente connectée), pour une relance.
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const garde = await (await fetch(`${RELAIS}/rest/v1/paniers_suivis?boutique_id=eq.00000000-0000-4000-8000-000000000003&telephone=eq.${encodeURIComponent("+21620555999")}&select=articles,sous_total_millimes,relance_le`, {
      headers: { apikey: cle, authorization: `Bearer ${cle}` },
    })).json();
    verifie(Array.isArray(garde) && garde.length === 1 && garde[0].articles === 1 && garde[0].sous_total_millimes === 289000 && garde[0].relance_le === null,
      `commandé puis rempli de nouveau : un panier neuf, relançable (${JSON.stringify(garde).slice(0, 90)})`);
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 2 ter. Maison Selma : un pack, commandé ==");
{
  // Selma a ses packs (supabase/seed-lots.sql) : « La tenue du week-end », la
  // chemise en lin et les mocassins, 359,000 au lieu de 408,000.
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "selma-pack");
  const sansEspaces = (s) => s.replace(/[\s  ]/g, "");

  await etape("la fiche propose le pack ; les tailles se choisissent dans sa carte", async () => {
    await page.goto(S + "/produit/chemise-lin-ample", { waitUntil: "networkidle" });
    const appel = page.locator(".fiche-appel-lot");
    verifie(sansEspaces(await appel.innerText()).includes("359,000"), "sous le bloc d'achat : « En pack · La tenue du week-end · 359,000 »");
    await clic(page, appel);
    const carte = page.locator(".lot-carte", { hasText: "La tenue du week-end" });
    await carte.waitFor();
    verifie(sansEspaces(await carte.innerText()).includes("Vouséconomisez49,000"), "la carte du pack : « Vous économisez 49,000 TND »");
    await clic(page, carte.getByRole("button", { name: "Ajouter le pack au panier" }));
    verifie(await carte.locator(".lot-manque").isVisible(), "sans taille choisie, la carte le demande au lieu d'ajouter");
    for (let i = 0; i < 2; i++) await carte.locator("select").nth(i).selectOption({ index: 1 });
    await clic(page, carte.getByRole("button", { name: "Ajouter le pack au panier" }));
    await page.locator(".confirmation-ajout").waitFor({ timeout: 5000 });
    await capture(page, "selma-pack-fiche");
  });

  await etape("le tiroir l'applique, la commande le garde", async () => {
    await clic(page, page.locator(".confirmation-ajout").getByRole("button", { name: /Voir le panier/ }));
    await page.locator(".panier-lot-remise").waitFor({ timeout: 8000 });
    const tiroir = sansEspaces(await page.locator(".tiroir-panier").innerText());
    verifie(tiroir.includes("−49,000") && tiroir.includes("Totaldesarticles359,000"), "le tiroir : le pack, −49,000 ; le total 359,000");
    await clic(page, page.locator(".panier-commander"));
    await page.waitForURL(/\/commande$/);
    await page.locator(".tunnel-lot").waitFor({ timeout: 8000 });
    verifie(sansEspaces(await page.locator(".tunnel-recap").innerText()).includes("Vouséconomisez49,000"), "la page de commande relit le pack en base");
    await confirmeNumero(page, "20555444", "20 555 444");
    await remplitAdresse(page, { nom: "Sonia Mejri", adresse: "4 rue de Palestine", ville: "Tunis", gouvernorat: "Tunis" });
    await page.locator(".tunnel-conditions input[type=checkbox]").check();
    await clic(page, page.locator(".tunnel-bouton"));
    await page.waitForURL(/\/commande\/merci$/, { timeout: 15000 });
    await page.locator(".merci").waitFor();
    const merci = await page.locator(".merci").innerText();
    verifie(merci.includes("Pack « La tenue du week-end »") && sansEspaces(merci).includes("359,000"), "la page de fin : chaque pièce dit son pack, 359,000 TND");
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const lignes = await (await fetch(`${RELAIS}/rest/v1/commande_lignes?boutique_id=eq.00000000-0000-4000-8000-000000000003&lot_nom=eq.${encodeURIComponent("La tenue du week-end")}&select=sku,remise_lot_millimes`, {
      headers: { apikey: cle, authorization: `Bearer ${cle}` },
    })).json();
    verifie(Array.isArray(lignes) && lignes.length === 2 && lignes.reduce((s, l) => s + l.remise_lot_millimes, 0) === 49000,
      `en base : deux lignes, le pack leur retire 49,000 en tout (${JSON.stringify(lignes)})`);
    await capture(page, "selma-pack-merci");
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
    await page.locator(".confirmation-ajout").waitFor({ timeout: 3000 });
    await clic(page, page.locator(".confirmation-ajout").getByRole("link", { name: /^Commander/ }));
    await page.waitForURL(/\/commande$/);
    await page.locator(".tunnel-totaux").waitFor();
    await capture(page, "quincaillerie-commande-vide");
  });

  await etape("numéro, adresse à Sfax, puis le retrait en magasin", async () => {
    await confirmeNumero(page, "98765432", "98 765 432");
    verifie((await page.locator(".tunnel-relance").count()) === 0, "la quincaillerie ne relance pas ses paniers : le tunnel n'en dit rien");
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

  await etape("retirée : l'avis sur l'article reçu, relu, puis sur la fiche", async () => {
    await page.goto(Q + "/compte", { waitUntil: "networkidle" });
    const bloc = page.locator(".compte-carte").first().locator(".avis-commande");
    await bloc.waitFor({ timeout: 8000 });
    verifie((await bloc.innerText()).includes("Perceuse"), "sous la commande retirée : l'article reçu, à noter");
    await clic(page, bloc.getByRole("button", { name: "Donner mon avis" }));
    const f = bloc.locator(".avis-formulaire");
    await clic(page, f.getByRole("button", { name: "Publier mon avis" }));
    verifie((await f.getByRole("alert").innerText()).includes("Choisissez une note"), "sans note, rien ne part");
    await clic(page, f.locator(".avis-saisie-etoiles label").nth(4));
    verifie((await f.locator(".avis-saisie-mot").innerText()).includes("Excellent"), "cinq étoiles : « Excellent »");
    await clic(page, f.getByLabel(/Votre avis/));
    await tape(page, "Puissante et légère, la batterie de rechange change tout sur un chantier.");
    await capture(page, "quincaillerie-avis-formulaire");
    await clic(page, f.getByRole("button", { name: "Publier mon avis" }));
    await bloc.locator(".avis-merci").waitFor({ timeout: 8000 });
    verifie((await bloc.locator(".avis-merci").innerText()).includes("après relecture"), "l'avis part, relu avant publication (réglage par défaut)");
    await pause(600);
    verifie((await bloc.innerText()).includes("En relecture"), "l'article dit « En relecture »");
    // Ce que la vitrine lit (public.avis_produit, la fonction de la fiche — la
    // page, elle, se renouvelle dans les cinq minutes de son cache).
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const lue = async () => (await (await fetch(`${RELAIS}/rest/v1/rpc/avis_produit`, {
      method: "POST",
      headers: { apikey: anon, authorization: `Bearer ${anon}`, "content-type": "application/json" },
      body: JSON.stringify({ p_boutique_id: "00000000-0000-4000-8000-000000000002",
        p_produit_id: (await (await fetch(`${RELAIS}/rest/v1/vitrine_produits?boutique_id=eq.00000000-0000-4000-8000-000000000002&slug=eq.perceuse-visseuse-14v&select=id`,
          { headers: { apikey: anon, authorization: `Bearer ${anon}` } })).json())[0]?.id }),
    })).json());
    verifie((await lue()).total === 0, "en relecture : la vitrine n'en montre rien");
    // La boutique le publie (clé de service de l'API locale, comme le ferait le backoffice).
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const r = await fetch(`${RELAIS}/rest/v1/avis?boutique_id=eq.00000000-0000-4000-8000-000000000002&statut=eq.en_attente`, {
      method: "PATCH",
      headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ statut: "publie", modere_le: new Date().toISOString() }),
    });
    verifie(r.ok, `la boutique le publie (${r.status})`);
    const publie = await lue();
    verifie(publie.total === 1 && publie.moyenne === 5 && publie.avis[0].texte.includes("la batterie de rechange change tout") && !("client" in publie.avis[0]),
      "publié : la vitrine lit la note et l'avis (sans rien du client que son prénom)");
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
    await page.locator(".confirmation-ajout").waitFor({ timeout: 3000 });
    verifie((await page.locator(".confirmation-ajout").innerText()).includes("131,000"), "la confirmation de l'ajout : au prix pro");
    await clic(page, page.locator(".confirmation-ajout").getByRole("button", { name: /^Voir le panier/ }));
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
    await page.locator(".confirmation-ajout").waitFor({ timeout: 3000 });
    await clic(page, page.locator(".confirmation-ajout").getByRole("button", { name: /^Voir le panier/ }));
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
    const connexion = p.locator(".tunnel-vide .compte-connexion");
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
