import { creeTesteur } from "./testeur.mjs";

/* ============================================================================
   PARCOURS HUMAIN DE LA VITRINE — un testeur qui bouge la souris, clique,
   tape au clavier avec des pauses, passe au téléphone, et regarde l'écran.

   Il complète outils/essai-vitrine.sh (qui vérifie les RÉPONSES du serveur) :
   ici on vérifie ce qu'une personne vit, dans les DEUX gabarits — l'en-tête
   posé sur la photo d'ouverture, le tiroir de filtres qui se rouvre après
   chaque case, le focus au clavier, le panier qui s'ouvre après un ajout,
   la barre d'achat du téléphone. Chaque étape laisse une capture.

     cd application && bun run parcours            # vitrine sur 127.0.0.1:4200
     CAPTURES=dossier CHROMIUM=/chemin/chrome bun run parcours

   Jeu de démo requis (supabase/seed.sql). Code de sortie 1 au premier défaut
   constaté, après avoir tout parcouru.
   ========================================================================== */

const t = creeTesteur();
const { pause, note, verifie, capture, clic, tape, etape } = t;
const M = t.adresse("maymar.localhost");
const Q = t.adresse("quincaillerie.localhost");
const S = t.adresse("mode.localhost");
// Les pages introuvables sont visitées exprès.
const espion = (page, nom) => t.espion(page, nom, (url) => /\/produit\/(perceuse|robe-)/.test(url));
const navigateur = await t.navigateur();
const compte = (page) => page.locator("header .bouton-panier-compte").innerText().catch(() => "");
const tiroirOuvert = (page, classe) => page.locator(`.tiroir.${classe}[role=dialog]`).isVisible().catch(() => false);

/* ------------------------------------------------------------------ */
console.log("\n== 1. Maison Selma (gabarit éditorial), à la souris ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  espion(page, "selma-souris");

  await etape("accueil : l'en-tête posé sur la photo", async () => {
    await page.goto(S + "/", { waitUntil: "networkidle" });
    await capture(page, "selma-accueil");
    const entete = page.locator("header.ed-entete");
    verifie(await entete.getAttribute("data-transparent") !== null, "en haut de page, l'en-tête est transparent sur la photo");
    await page.mouse.wheel(0, 700); await pause(600);
    verifie(await entete.getAttribute("data-transparent") === null, "après défilement, l'en-tête redevient opaque");
    await capture(page, "selma-accueil-defile");
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); } });
    await page.waitForLoadState("networkidle");
    await capture(page, "selma-accueil-complete", true);
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    verifie(!deborde, "pas de défilement horizontal");
  });

  await etape("collection « Robes » depuis l'accueil", async () => {
    await page.evaluate(() => window.scrollTo(0, 0)); await pause(300);
    const tuile = page.locator(".ed-collections a", { hasText: "Robes" });
    await clic(page, tuile);
    await page.waitForURL(/\/categorie\/robes$/);
    await page.waitForLoadState("networkidle");
    await capture(page, "selma-rayon-robes");
    verifie(await page.getByRole("navigation", { name: /principale/i }).getByRole("link", { name: "Robes" }).getAttribute("aria-current") === "page", "le rayon ouvert est marqué dans l'en-tête");
  });

  await etape("survol d'une carte : la deuxième photo", async () => {
    const carte = page.locator(".ed-carte", { hasText: "Robe à bretelles en lin" });
    await carte.scrollIntoViewIfNeeded();
    const b = await carte.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 3, { steps: 10 });
    await pause(800);
    const opacite = await carte.locator(".photo-survol").evaluate((e) => getComputedStyle(e).opacity);
    verifie(opacite === "1", `au survol, la deuxième photo apparaît (opacité ${opacite})`);
    await capture(page, "selma-survol-carte");
  });

  await etape("tiroir de filtres : cocher, il se rouvre", async () => {
    await clic(page, page.locator(".btn-filtrer"));
    await pause(400);
    verifie(await tiroirOuvert(page, "tiroir-filtres"), "« Filtrer » ouvre le tiroir");
    await capture(page, "selma-filtres-ouverts");
    await clic(page, page.locator(".tiroir-filtres label.opt", { hasText: /^M/ }).first());
    await page.waitForURL(/taille=M/);
    await page.waitForLoadState("networkidle");
    await pause(400);
    verifie(await tiroirOuvert(page, "tiroir-filtres"), "après la case, le tiroir est toujours ouvert");
    await capture(page, "selma-filtre-taille-m");
    const bouton = page.locator(".tiroir-filtres button[data-voir]");
    note("INFO  ", `bouton du tiroir : « ${(await bouton.innerText()).trim()} »`);
    await clic(page, bouton);
    await pause(500);
    verifie(!(await tiroirOuvert(page, "tiroir-filtres")), "« Voir les résultats » referme le tiroir");
    verifie(await page.locator(".puce", { hasText: "M" }).count() >= 1, "la puce du filtre apparaît");
    await capture(page, "selma-resultats-taille-m");
  });

  await etape("tri par prix croissant", async () => {
    await page.locator("select#tri").selectOption("prix-asc");
    await page.waitForURL(/tri=prix-asc/);
    await page.waitForLoadState("networkidle");
    const prix = await page.locator(".ed-carte-prix .prix").allInnerTexts();
    const nombres = prix.map((p) => Number(p.replace(/[^\d,]/g, "").replace(",", ".")));
    verifie(nombres.every((n, i) => i === 0 || n >= nombres[i - 1]), `prix dans l'ordre : ${nombres.join(" ≤ ")}`);
    verifie(page.url().includes("taille=M"), "le tri garde le filtre");
  });

  await etape("fiche : choisir une taille, mettre au panier", async () => {
    await page.goto(S + "/produit/robe-bretelles-terracotta", { waitUntil: "networkidle" });
    await page.locator(".fiche-livraison").waitFor({ timeout: 5000 });
    const quand = (await page.locator(".fiche-livraison").innerText()).trim();
    verifie(/^Commandé aujourd'hui, livré (entre le|le) /.test(quand), `la fiche dit quand elle arrive : « ${quand} »`);
    await capture(page, "selma-fiche");
    await clic(page, page.locator(".valeur", { hasText: /^M$/ }));
    verifie((await page.locator(".axe legend .choisi").last().innerText()) === "M", "la taille choisie est affichée");
    await clic(page, page.locator(".achat .btn-ajout"));
    await pause(600);
    verifie(await tiroirOuvert(page, "tiroir-panier"), "après l'ajout, le tiroir du panier s'ouvre");
    const ligne = page.locator(".tiroir-panier .panier-ligne");
    verifie(await ligne.count() === 1 && (await ligne.innerText()).includes("Robe à bretelles en lin · Terracotta, M"), "la ligne dit le produit et sa déclinaison");
    verifie(await ligne.locator(".panier-vignette img").count() === 1, "la ligne a sa vignette");
    note("INFO  ", `sous les articles : ${(await page.locator(".panier-assurances").innerText().catch(() => "(rien)")).replace(/\s+/g, " ").trim()}`);
    note("INFO  ", `jauge : ${(await page.locator(".jauge-livraison p").innerText().catch(() => "(absente)")).trim()}`);
    await capture(page, "selma-tiroir-panier");
    await clic(page, page.locator(".tiroir-panier").getByRole("button", { name: /ajouter un article/i }));
    verifie((await ligne.locator(".qte span").innerText()) === "2", "« + » dans le tiroir : 2");
    await page.keyboard.press("Escape");
    await pause(300);
    verifie(!(await tiroirOuvert(page, "tiroir-panier")), "Échap ferme le tiroir");
    await pause(300);
    verifie((await page.locator(".tiroir").count()) === 0, "il glisse hors de l'écran, puis disparaît");
    verifie((await page.evaluate(() => document.activeElement?.classList.contains("btn-ajout"))) === true, "le focus revient sur « Ajouter au panier »");
    verifie((await compte(page)) === "2", "le compteur de l'en-tête dit 2");
  });

  await etape("le panier survit au rechargement", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await pause(300);
    verifie((await compte(page)) === "2", "après rechargement, 2 articles");
  });

  await etape("page introuvable", async () => {
    await page.goto(S + "/produit/perceuse-visseuse-14v", { waitUntil: "networkidle" });
    await capture(page, "selma-404");
    verifie(await page.locator("header.ed-entete").count() === 1 && await page.locator("footer.ed-pied").count() === 1, "la page introuvable garde l'en-tête et le pied de la boutique");
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 2. Maymar, au clavier seul ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 1366, height: 850 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  espion(page, "maymar-clavier");
  const focus = () => page.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return { nom: "(rien)", visible: false, dansTiroir: false };
    const s = getComputedStyle(e);
    const visible = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
    // textContent, pas innerText : les capitales de la CSS ne comptent pas.
    const nom = (e.getAttribute("aria-label") || e.closest("label")?.textContent || e.textContent || e.getAttribute("name") || e.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
    return { nom: `${e.tagName.toLowerCase()} « ${nom} »`, visible, dansTiroir: Boolean(e.closest("[role=dialog]")) };
  });
  const tabJusqua = async (test, max = 40) => {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press("Tab");
      if (test(await focus())) return true;
    }
    return false;
  };

  await etape("tabulations sur l'accueil", async () => {
    await page.goto(M + "/", { waitUntil: "networkidle" });
    await capture(page, "maymar-accueil");
    const vus = [];
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("Tab"); await pause(120);
      const f = await focus();
      vus.push(`${f.nom}${f.visible ? "" : " [FOCUS INVISIBLE]"}`);
      if (i === 2) await capture(page, "clavier-focus-menu");
    }
    note("INFO  ", "ordre de tabulation : " + vus.join(" → "));
    verifie(!vus.some((v) => v.includes("INVISIBLE")), "le focus est toujours visible");
  });

  await etape("catalogue, tiroir de filtres au clavier", async () => {
    await page.goto(M + "/catalogue", { waitUntil: "networkidle" });
    verifie(await tabJusqua((f) => f.nom.includes("Filtrer")), "Tab atteint « Filtrer »");
    await page.keyboard.press("Enter");
    await pause(400);
    const f1 = await focus();
    verifie(f1.dansTiroir && f1.nom.includes("Fermer"), `à l'ouverture, le focus va sur : ${f1.nom}`);
    verifie(await tabJusqua((f) => f.nom.includes("Cabine 55 cm")), "Tab atteint la case « Cabine 55 cm »");
    await capture(page, "clavier-focus-filtre");
    await page.keyboard.press("Space");
    await page.waitForURL(/taille=/, { timeout: 5000 });
    await page.waitForLoadState("networkidle");
    await pause(400);
    const f2 = await focus();
    verifie(await tiroirOuvert(page, "tiroir-filtres") && f2.nom.includes("Cabine"), `après le filtre, tiroir rouvert et focus sur : ${f2.nom}`);
    await capture(page, "clavier-focus-garde-apres-filtre");
    await page.keyboard.press("Space");
    await page.waitForURL((u) => !u.href.includes("taille="), { timeout: 5000 });
    await pause(400);
    verifie((await focus()).nom.includes("Cabine"), "Espace à nouveau : le filtre est retiré, le focus reste");
    const sorties = [];
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      if (!(await focus()).dansTiroir) sorties.push((await focus()).nom);
    }
    verifie(sorties.length === 0, sorties.length ? `Tab sort du tiroir : ${sorties[0]}` : "Tab reste dans le tiroir de filtres");
    await page.keyboard.press("Escape");
    await pause(300);
    verifie((await focus()).nom.includes("Filtrer"), `après Échap, le focus revient sur : ${(await focus()).nom}`);
  });

  await etape("fiche, déclinaison et panier au clavier", async () => {
    await page.goto(M + "/produit/valise-souple-extensible", { waitUntil: "networkidle" });
    verifie(await tabJusqua((f) => f.nom.startsWith("button « Gris")), "Tab atteint le coloris « Gris »");
    await page.keyboard.press("Enter");
    verifie(await tabJusqua((f) => f.nom.includes("Ajouter au panier"), 12), "Tab atteint « Ajouter au panier »");
    await capture(page, "clavier-focus-ajouter");
    await page.keyboard.press("Enter");
    await pause(500);
    const f = await focus();
    verifie(await tiroirOuvert(page, "tiroir-panier") && f.dansTiroir, `Entrée sur « Ajouter » : le tiroir s'ouvre, focus sur ${f.nom}`);
    await capture(page, "clavier-tiroir");
    await page.keyboard.press("Escape");
    await pause(300);
    verifie(/Ajout/.test((await focus()).nom), `après Échap, le focus revient sur : ${(await focus()).nom}`);
    verifie((await compte(page)) === "1", "le compteur dit 1");
  });

  await etape("page introuvable", async () => {
    await page.goto(M + "/produit/perceuse-visseuse-14v", { waitUntil: "networkidle" });
    await capture(page, "maymar-404");
    verifie(await page.locator("header .marque").count() === 1 && await page.locator("footer").count() === 1, "la page introuvable garde l'en-tête et le pied de Maymar");
    await clic(page, page.locator("#q-introuvable"));
    await tape(page, "valise");
    const proposees = page.locator(".recherche-suggestions[data-ouvert] .suggestion");
    await proposees.first().waitFor({ timeout: 8000 });
    verifie((await proposees.count()) >= 1, `elle propose de chercher : ${await proposees.count()} valise(s) pendant la frappe`);
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 3. Sur téléphone (tactile) ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
  const page = await ctx.newPage();
  espion(page, "mobile");

  await etape("Selma : accueil et menu", async () => {
    await page.goto(S + "/", { waitUntil: "networkidle" });
    await capture(page, "mobile-selma-accueil");
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    verifie(!deborde, "pas de défilement horizontal");
    await page.getByRole("button", { name: /ouvrir le menu/i }).tap();
    await pause(500);
    verifie(await tiroirOuvert(page, "tiroir-menu"), "le bouton menu ouvre le tiroir des rayons");
    await capture(page, "mobile-selma-menu");
    await page.locator(".tiroir-menu").getByRole("link", { name: "Maille" }).tap();
    await page.waitForURL(/\/categorie\/maille/);
    await page.waitForLoadState("networkidle");
    await pause(300);
    verifie(!(await tiroirOuvert(page, "tiroir-menu")), "le menu se referme en arrivant sur le rayon");
    await capture(page, "mobile-selma-maille");
  });

  await etape("Selma : galerie au doigt", async () => {
    await page.goto(S + "/produit/robe-bretelles-terracotta", { waitUntil: "networkidle" });
    await page.locator(".ed-galerie-piste").evaluate((p) => p.scrollTo({ left: p.clientWidth, behavior: "instant" }));
    await pause(500);
    verifie((await page.locator(".ed-galerie-compteur").innerText()).replace(/\s/g, "") === "2/3", "faire glisser la galerie : le compteur passe à 2 / 3");
    await capture(page, "mobile-selma-galerie");
    await page.locator(".ed-galerie-vue").nth(1).locator(".galerie-agrandir").tap();
    const visionneuse = page.locator("dialog.visionneuse[open]");
    await visionneuse.waitFor({ timeout: 5000 });
    await pause(400);
    verifie((await visionneuse.locator(".visionneuse-compteur").innerText()).includes("Photo 2 sur 3"), "toucher la photo l'ouvre en plein écran, sur celle-là");
    await capture(page, "mobile-selma-visionneuse");
    await visionneuse.locator(".visionneuse-piste").evaluate((p) => p.scrollTo({ left: 2 * p.clientWidth, behavior: "instant" }));
    await pause(300);
    verifie((await visionneuse.locator(".visionneuse-compteur").innerText()).includes("Photo 3 sur 3"), "on y glisse d'une photo à l'autre");
    await visionneuse.locator(".visionneuse-fermer").tap();
    await pause(200);
    verifie((await page.locator("dialog.visionneuse[open]").count()) === 0, "la croix la referme");
  });

  await etape("Maymar : tiroir de filtres au doigt", async () => {
    await page.goto(M + "/catalogue", { waitUntil: "networkidle" });
    await page.locator(".btn-filtrer").tap();
    await pause(500);
    await capture(page, "mobile-filtres-ouverts");
    await page.locator(".tiroir-filtres label[title^='Noir']").tap();
    await page.waitForURL(/couleur=Noir/);
    await page.waitForLoadState("networkidle");
    await pause(500);
    const ouvert = await tiroirOuvert(page, "tiroir-filtres");
    verifie(ouvert, "le tiroir reste ouvert pour cocher la suivante");
    await capture(page, "mobile-filtre-noir");
    if (ouvert) {
      await page.locator(".tiroir-filtres label.opt", { hasText: "Cabine 55 cm" }).tap();
      await page.waitForURL(/taille=/);
      await pause(500);
      verifie(/couleur=Noir\/taille=Cabine/.test(page.url()), `deux filtres au doigt : ${page.url().replace(M, "")}`);
      await page.locator(".tiroir-filtres button[data-voir]").tap();
      await pause(500);
      verifie(!(await tiroirOuvert(page, "tiroir-filtres")), "« Voir les résultats » referme le tiroir");
      await capture(page, "mobile-deux-filtres");
    }
  });

  await etape("Maymar : fiche et barre collante", async () => {
    await page.goto(M + "/produit/valise-rigide-abs-4-roues", { waitUntil: "networkidle" });
    await capture(page, "mobile-fiche");
    await page.evaluate(() => window.scrollBy(0, 1800)); await pause(700);
    await capture(page, "mobile-fiche-barre-collante");
    verifie(await page.locator(".achat-mobile").isVisible(), "la barre d'achat collante apparaît quand le bloc d'achat sort de l'écran");
    await page.locator(".achat-mobile button").tap();
    await pause(500);
    verifie(await tiroirOuvert(page, "tiroir-panier"), "« Ajouter » de la barre : le tiroir du panier s'ouvre");
    await capture(page, "mobile-tiroir-panier");
    await page.locator(".tiroir-panier [data-fermer]").tap();
    await pause(300);
    verifie((await compte(page)) === "1", "1 article au panier");
  });

  await etape("Quincaillerie : recherche dans l'en-tête", async () => {
    await page.goto(Q + "/", { waitUntil: "networkidle" });
    await capture(page, "mobile-quinca-accueil");
    await page.locator("#q-entete").tap();
    await tape(page, "casque");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/recherche\?q=casque/);
    await page.waitForLoadState("networkidle");
    await capture(page, "mobile-quinca-recherche");
    verifie(await page.locator(".te-carte").count() >= 1, `recherche « casque » : ${(await page.locator(".recherche-bilan").innerText()).trim()}`);
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 4. Quincaillerie (gabarit technique), à la souris ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  espion(page, "quinca");

  await etape("accueil", async () => {
    await page.goto(Q + "/", { waitUntil: "networkidle" });
    await capture(page, "quinca-accueil");
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); } });
    await page.waitForLoadState("networkidle");
    await capture(page, "quinca-accueil-complete", true);
  });

  await etape("recherche d'une référence", async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await clic(page, page.locator("#q-entete"));
    await tape(page, "PV14");
    await page.keyboard.press("Enter");
    await page.waitForURL(/q=PV14/);
    await page.waitForLoadState("networkidle");
    await capture(page, "quinca-recherche-reference");
    verifie((await page.locator(".recherche-bilan").innerText()).includes("Une pièce trouvée"), "la référence PV14 trouve la perceuse");
  });

  await etape("recherche : les pièces proposées pendant la frappe", async () => {
    await page.goto(Q + "/", { waitUntil: "networkidle" });
    await clic(page, page.locator("#q-entete"));
    await tape(page, "perc");
    const panneau = page.locator(".recherche-suggestions[data-ouvert]");
    await panneau.locator(".suggestion").first().waitFor({ timeout: 8000 });
    const n = await panneau.locator(".suggestion").count();
    verifie(n >= 2, `« perc » : ${n} pièces proposées, avant même Entrée`);
    verifie((await panneau.locator(".suggestion-tout").innerText()).includes("Voir les"), "« Voir les N résultats » les suit");
    verifie((await page.locator("#q-entete").getAttribute("aria-expanded")) === "true", "le champ annonce sa liste ouverte (combobox)");
    await capture(page, "quinca-suggestions");
    await page.keyboard.press("ArrowDown");
    const choisi = (await panneau.locator(".suggestion[aria-selected=true] .suggestion-nom").innerText()).trim();
    verifie(Boolean(await page.locator("#q-entete").getAttribute("aria-activedescendant")) && (await page.evaluate(() => document.activeElement?.id)) === "q-entete",
      `↓ choisit « ${choisi} », le focus reste dans le champ`);
    await page.keyboard.press("Escape");
    verifie(!(await panneau.isVisible()), "Échap referme la liste");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/produit\//);
    await page.waitForLoadState("networkidle");
    verifie((await page.locator("h1").first().innerText()).toLowerCase().includes(choisi.toLowerCase()), `Entrée ouvre la fiche de « ${choisi} »`);
  });

  await etape("rayon depuis la barre des rayons", async () => {
    const nav = page.getByRole("navigation", { name: /principale/i });
    note("INFO  ", `rayons : ${(await nav.getByRole("link").allInnerTexts()).join(", ")}`);
    await clic(page, nav.getByRole("link", { name: "Outillage électroportatif" }));
    await page.waitForURL(/\/categorie\/outillage$/);
    await page.waitForLoadState("networkidle");
    await capture(page, "quinca-rayon");
    verifie(await page.locator("aside.te-filtres").isVisible(), "la colonne de filtres est là sur grand écran");
  });

  await etape("filtre dans la colonne : « 6 mm »", async () => {
    const opt = page.locator("aside.te-filtres label.opt", { hasText: "6 mm" });
    await clic(page, opt);
    await page.waitForURL(/diametre=6/);
    await page.waitForLoadState("networkidle");
    await pause(300);
    await capture(page, "quinca-filtre-diametre");
    verifie(await page.locator(".te-carte").count() === 1, `${(await page.locator(".compte").innerText()).trim()}`);
  });

  await etape("ajout direct depuis une carte", async () => {
    await page.goto(Q + "/categorie/outillage-a-main", { waitUntil: "networkidle" });
    const bouton = page.locator(".te-carte", { hasText: "Coffret de douilles" }).locator(".te-carte-ajout");
    await clic(page, bouton);
    await pause(500);
    verifie(await tiroirOuvert(page, "tiroir-panier"), "« Ajouter » sur la carte : le tiroir du panier s'ouvre");
    await capture(page, "quinca-ajout-rapide");
    await page.keyboard.press("Escape");
  });

  await etape("fiche perceuse, kit, panier", async () => {
    await page.goto(Q + "/produit/perceuse-visseuse-14v", { waitUntil: "networkidle" });
    await clic(page, page.getByRole("button", { name: /^Kit 2 batteries/ }));
    verifie((await page.locator(".ref-variante").innerText()).includes("PV14-KIT2"), "la référence suit la version choisie");
    await capture(page, "quinca-fiche-kit");
    await clic(page, page.locator(".achat .btn-ajout"));
    await pause(500);
    await capture(page, "quinca-tiroir-panier");
    const lignes = await page.locator(".tiroir-panier .panier-ligne").allInnerTexts();
    verifie(lignes.length === 2 && !lignes.some((l) => l.includes("Valise") || l.includes("Robe")), `panier de la quincaillerie : ${lignes.map((l) => l.split("\n")[0]).join(" / ")}`);
    note("INFO  ", `jauge : ${(await page.locator(".jauge-livraison p").innerText().catch(() => "(absente)")).trim()}`);
  });

  await etape("vis au détail : par 20 au moins", async () => {
    await page.keyboard.press("Escape");
    await page.goto(Q + "/produit/vis-bois-tete-fraisee", { waitUntil: "networkidle" });
    const qte = () => page.locator(".achat .qte span").innerText().then((x) => x.trim());
    verifie((await qte()) === "20" && (await page.locator(".achat .qte button").first().isDisabled()),
      "les vis au détail : le sélecteur part de 20 et « − » s'y arrête");
    verifie((await page.locator(".fiche-minimum").innerText()).includes("par 20 pièces au moins"), "la fiche dit le minimum, avec le prix du lot");
    await capture(page, "quinca-fiche-minimum");
    await clic(page, page.getByRole("button", { name: /^Boîte de 200/ }));
    verifie((await qte()) === "1" && (await page.locator(".fiche-minimum").count()) === 0, "la boîte de 200 revient à l'unité, sans pastille");
  });
  await ctx.close();
}

await navigateur.close();
process.exit(t.bilan());
