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
// Les 404 voulues : la fiche d'un produit d'une autre boutique, une adresse inconnue.
const espion = (page, nom) => t.espion(page, nom, (url) => /\/produit\/(perceuse|robe-)|\/une\/adresse\/inconnue/.test(url));
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

  await etape("les favoris : un cœur au clavier, l'en-tête compte, « Mes favoris »", async () => {
    // Selma a les favoris (supabase/seed-favoris.sql) ; le cœur suit la carte au clavier.
    const carte = page.locator(".ed-carte", { hasText: "Robe à bretelles en lin" });
    await carte.locator(".ed-carte-lien").focus();
    await page.keyboard.press("Tab");
    const coeur = carte.locator(".carte-favori");
    verifie(await coeur.evaluate((e) => e === document.activeElement && getComputedStyle(e).opacity === "1"),
      "Tab après la carte : son cœur, qui paraît au focus");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector(".lien-favoris .favoris-compte")?.textContent === "1", null, { timeout: 3000 });
    verifie((await coeur.getAttribute("aria-pressed")) === "true" && (await coeur.getAttribute("aria-label")).startsWith("Retirer des favoris"),
      "Entrée : aimée, le bouton le dit, l'en-tête compte 1");
    await clic(page, page.locator(".lien-favoris").first());
    await page.waitForURL(/\/favoris\?s=robe-bretelles-terracotta$/);
    await page.waitForLoadState("networkidle");
    verifie((await page.locator(".ed-carte").count()) === 1, "« Mes favoris » : la pièce, relue en base");
    await capture(page, "selma-favoris");
    await clic(page, page.locator(".carte-favori").first());
    await page.locator(".favoris-vide").waitFor({ timeout: 5000 });
    verifie((await page.locator(".favoris-vide").innerText()).includes("Aucun favori"), "retirée : la page dit quoi faire");
    await page.goto(S + "/categorie/robes", { waitUntil: "networkidle" });
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
    await pause(120);
    verifie((await page.locator(".envol").count()) === 1, "la photo de la robe s'envole vers le panier");
    await capture(page, "selma-envol");
    const confirmation = page.locator(".confirmation-ajout");
    await confirmation.waitFor({ timeout: 3000 });
    verifie((await page.locator(".envol").count()) === 0, "arrivée au panier, la copie a disparu");
    verifie(!(await tiroirOuvert(page, "tiroir-panier")), "le tiroir ne s'ouvre plus de lui-même : la confirmation suffit");
    const dite = (await confirmation.innerText()).replace(/\s+/g, " ");
    verifie(dite.includes("Ajouté au panier") && dite.includes("Robe à bretelles en lin · Terracotta, M"), `la confirmation dit l'article : « ${dite.slice(0, 80)}… »`);
    verifie(await confirmation.getByRole("link", { name: /^Commander/ }).isVisible(), "elle propose « Commander »");
    await capture(page, "selma-confirmation");
    await clic(page, confirmation.getByRole("button", { name: "Voir le panier (1)" }));
    await pause(600);
    verifie(await tiroirOuvert(page, "tiroir-panier"), "« Voir le panier (1) » ouvre le tiroir");
    const ligne = page.locator(".tiroir-panier .panier-ligne");
    verifie(await ligne.count() === 1 && (await ligne.innerText()).includes("Robe à bretelles en lin · Terracotta, M"), "la ligne dit le produit et sa déclinaison");
    verifie(await ligne.locator(".panier-vignette img").count() === 1, "la ligne a sa vignette");
    // Selma propose les pièces achetées ensemble (supabase/seed-ensemble.sql).
    const ensemble = page.locator(".tiroir-panier .panier-ensemble");
    await ensemble.waitFor({ timeout: 4000 }).catch(() => {});
    verifie((await ensemble.count()) === 1 && (await ensemble.innerText()).includes("Sac de voyage en cuir"),
      "sous l'article, « Souvent achetés avec votre panier » : le sac de voyage");
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

  await etape("les avis vérifiés de la robe (module avis, jeu de démo)", async () => {
    const resume = page.locator(".fiche-avis-resume");
    verifie((await resume.innerText()).replace(/\s+/g, " ").includes("4,7 3 avis"), `sous le titre : la note et le nombre d'avis (${(await resume.innerText()).replace(/\s+/g, " ")})`);
    await clic(page, resume);
    await pause(1000);
    const section = page.locator("#avis");
    verifie(await section.isVisible() && (await section.boundingBox()).y < 400, "un clic mène à la section des avis");
    const texte = await section.textContent();
    verifie((await section.locator(".avis-item").count()) === 3 && texte.includes("Achat vérifié") && texte.includes("Réponse de la boutique"),
      "trois avis publiés, « Achat vérifié », la réponse de la boutique");
    verifie(!texte.includes("Yosra"), "l'avis encore en relecture n'y est pas");
    const ld = await page.evaluate(() => JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent));
    verifie(ld.aggregateRating?.ratingValue === 4.7 && ld.aggregateRating?.reviewCount === 3, "la note est dans les données structurées (résultats Google)");
    await capture(page, "selma-fiche-avis");
    // Sur les cartes du rayon aussi, dans la page servie (public.vitrine_produits).
    await page.goto(S + "/categorie/robes", { waitUntil: "networkidle" });
    const note = page.locator(".ed-carte", { hasText: "Robe à bretelles en lin" }).locator(".carte-note");
    verifie((await note.innerText()).replace(/\s+/g, " ").startsWith("4,7 (3"), `la carte du rayon porte la note (${(await note.innerText()).replace(/\s+/g, " ")})`);
    verifie((await page.locator(".ed-carte", { hasText: "Robe midi en jersey" }).locator(".carte-note").count()) === 0, "une robe sans avis n'en affiche aucune");
  });

  await etape("« Souvent achetés ensemble » sous la fiche, tiré des commandes", async () => {
    await page.goto(S + "/produit/robe-bretelles-terracotta", { waitUntil: "networkidle" });
    const section = page.locator(".fiche-ensemble");
    const noms = await section.locator(".ed-carte-nom").allInnerTexts();
    verifie(noms[0] === "Sac de voyage en cuir" && noms.includes("Chemise ample en lin"),
      `la robe : le sac (trois commandes), puis la chemise (${noms.join(", ")})`);
    const voisins = await page.locator("section", { has: page.getByRole("heading", { name: "Vous aimerez aussi" }) }).locator(".ed-carte-nom").allInnerTexts();
    verifie(voisins.length > 0 && !voisins.some((n) => noms.includes(n)), "« Vous aimerez aussi » ne les répète pas");
    await section.scrollIntoViewIfNeeded();
    await capture(page, "selma-achetes-ensemble");
    await clic(page, section.locator(".ed-carte-lien", { hasText: "Sac de voyage en cuir" }));
    await page.waitForURL(/\/produit\/sac-voyage-cuir$/);
    await page.waitForLoadState("networkidle");
    verifie((await page.locator(".fiche-ensemble .ed-carte-nom").allInnerTexts()).includes("Robe à bretelles en lin"), "et le sac, en retour, propose la robe");
  });

  await etape("les photos d'un avis : au clavier, la visionneuse, le focus revient", async () => {
    // L'avis du sac a deux photos (supabase/seed-avis-photos.sql), sur la fiche où l'on est.
    const vignettes = page.locator("#avis .avis-photo");
    verifie((await vignettes.count()) === 2, "sous l'avis du sac, ses deux photos");
    await vignettes.first().focus();
    verifie((await vignettes.first().getAttribute("aria-label")).startsWith("Agrandir la photo 1 sur 2"), "la vignette dit ce qu'elle ouvre");
    await page.keyboard.press("Enter");
    const dlg = page.locator("dialog.visionneuse[open]");
    await dlg.waitFor({ timeout: 3000 });
    verifie((await dlg.getAttribute("aria-label")) === "Les photos des clients" && (await dlg.locator(".visionneuse-compteur").innerText()) === "Photo 1 sur 2",
      "Entrée : la visionneuse des photos des clients, sur la première");
    const fit = await dlg.locator(".visionneuse-vue img").first().evaluate((i) => getComputedStyle(i).objectFit);
    verifie(fit === "contain", `la photo s'y voit entière, jamais recadrée (${fit})`);
    await capture(page, "selma-avis-visionneuse");
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector("dialog.visionneuse[open] .visionneuse-compteur")?.textContent === "Photo 2 sur 2", null, { timeout: 3000 }).catch(() => {});
    verifie((await dlg.locator(".visionneuse-compteur").innerText()) === "Photo 2 sur 2", "→ : la deuxième");
    await page.keyboard.press("Escape");
    await pause(300);
    verifie((await page.locator("dialog.visionneuse[open]").count()) === 0 && (await vignettes.first().evaluate((e) => e === document.activeElement)),
      "Échap la ferme, le focus revient sur la vignette");
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
    // Une adresse qui ne ressemble à rien : la même page, pas celle du framework.
    const r = await page.goto(S + "/une/adresse/inconnue", { waitUntil: "networkidle" });
    verifie(r?.status() === 404 && await page.locator("header.ed-entete").count() === 1 && await page.locator("#q-introuvable").count() === 1,
      `une adresse inconnue : 404 à l'habit de la boutique, la recherche proposée (HTTP ${r?.status()})`);
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
    verifie((await page.locator(".carte-favori, .lien-favoris").count()) === 0, "Maymar n'a pas de favoris (réglage coupé) : ni cœur, ni lien");
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
    await page.locator(".confirmation-ajout").waitFor({ timeout: 3000 });
    await pause(150);
    const f = await focus();
    const dansConfirmation = await page.evaluate(() => Boolean(document.activeElement?.closest(".confirmation-ajout")));
    verifie(/Commander/.test(f.nom) && dansConfirmation, `Entrée sur « Ajouter » : la confirmation prend le focus, sur ${f.nom}`);
    await capture(page, "clavier-confirmation");
    await page.keyboard.press("Tab");
    verifie(/Voir le panier/.test((await focus()).nom), `Tab : ${(await focus()).nom}`);
    await page.keyboard.press("Enter");
    await pause(500);
    const g = await focus();
    verifie(await tiroirOuvert(page, "tiroir-panier") && g.dansTiroir, `Entrée sur « Voir le panier » : le tiroir s'ouvre, focus sur ${g.nom}`);
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

  /* Rien ne dépasse l'écran, page parcourue jusqu'en bas : un élément qui
     déborde élargit la page et le téléphone la dézoome tout entière (le
     30/09 : le texte pour lecteurs d'écran d'une carte, dans une bande
     glissante, n'apparaissait qu'au défilement). */
  const sansDebord = async (url, nom) => {
    await page.goto(url, { waitUntil: "networkidle" });
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 500) { await page.evaluate((v) => window.scrollTo(0, v), y); await pause(120); }
    await pause(800);
    const m = await page.evaluate(() => ({ vue: window.innerWidth, page: document.documentElement.scrollWidth, ecran: document.documentElement.clientWidth }));
    verifie(m.vue === 390 && m.page <= m.ecran, `${nom} : pas de défilement horizontal, page parcourue (${m.page} px pour ${m.ecran})`);
    await page.evaluate(() => window.scrollTo(0, 0));
  };

  await etape("les accueils tiennent dans l'écran", async () => {
    await sansDebord(S + "/", "Selma");
    await sansDebord(M + "/", "Maymar");
    await sansDebord(Q + "/", "Quincaillerie");
  });

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
    // Un saut, pas un défilement : le bloc d'achat passe de sous l'écran à
    // au-dessus sans jamais le croiser (la touche Fin, une ancre).
    await page.evaluate(() => window.scrollBy(0, 1800)); await pause(700);
    await capture(page, "mobile-fiche-barre-collante");
    verifie(await page.locator(".achat-mobile").isVisible(), "la barre d'achat collante apparaît quand le bloc d'achat sort de l'écran");
    await page.locator(".achat-mobile button").tap();
    await pause(120);
    verifie((await page.locator(".envol-pastille").count()) === 1, "la galerie hors de l'écran : une pastille part du bouton vers le panier");
    const feuille = page.locator(".confirmation-ajout");
    await feuille.waitFor({ timeout: 3000 });
    // Mesurée une fois posée : pendant son entrée, elle monte encore.
    await feuille.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const boite = await feuille.boundingBox();
    const ecran = page.viewportSize();
    verifie(Boolean(boite && ecran && Math.abs(boite.y + boite.height - ecran.height) < 2 && boite.width >= ecran.width - 1),
      "sur téléphone, la confirmation est une feuille posée en bas de l'écran");
    verifie(!(await tiroirOuvert(page, "tiroir-panier")), "le tiroir ne s'ouvre pas de lui-même");
    await capture(page, "mobile-confirmation");
    await feuille.getByRole("button", { name: /^Voir le panier/ }).tap();
    await pause(500);
    verifie(await tiroirOuvert(page, "tiroir-panier"), "« Voir le panier » de la feuille ouvre le tiroir");
    verifie((await page.locator(".panier-ensemble, .fiche-ensemble").count()) === 0, "Maymar n'a pas le réglage : rien d'« acheté ensemble »");
    verifie((await page.locator(".avis-photo, .avis-rang").count()) === 0, "ni photo sous ses avis (réglage coupé)");
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
    await pause(120);
    verifie((await page.locator(".envol .envol-copie").count()) === 1, "« Ajouter » sur la carte : sa photo s'envole vers le panier");
    await page.locator(".confirmation-ajout").waitFor({ timeout: 3000 });
    verifie((await page.locator(".confirmation-ajout").innerText()).includes("Coffret de douilles"), "la confirmation dit le coffret");
    await capture(page, "quinca-ajout-rapide");
    await page.keyboard.press("Escape");
    await pause(400);
    verifie((await page.locator(".confirmation-ajout").count()) === 0, "Échap ferme la confirmation");
  });

  await etape("fiche perceuse, kit, panier", async () => {
    await page.goto(Q + "/produit/perceuse-visseuse-14v", { waitUntil: "networkidle" });
    await clic(page, page.getByRole("button", { name: /^Kit 2 batteries/ }));
    verifie((await page.locator(".ref-variante").innerText()).includes("PV14-KIT2"), "la référence suit la version choisie");
    await capture(page, "quinca-fiche-kit");
    await clic(page, page.locator(".achat .btn-ajout"));
    await page.locator(".confirmation-ajout").waitFor({ timeout: 3000 });
    await clic(page, page.locator(".confirmation-ajout").getByRole("button", { name: /^Voir le panier/ }));
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

  await etape("« Vus récemment » : les fiches ouvertes, la plus récente d'abord", async () => {
    await page.goto(Q + "/produit/coffret-forets-19", { waitUntil: "networkidle" });
    const rail = page.locator(".vus");
    await rail.waitFor({ timeout: 8000 });
    const liens = await rail.locator(".vus-lien").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    verifie(liens[0] === "/produit/vis-bois-tete-fraisee" && liens[1] === "/produit/perceuse-visseuse-14v" && !liens.includes("/produit/coffret-forets-19"),
      `le rail : les vis, puis la perceuse, sans la fiche ouverte (${liens.length} pièces)`);
    verifie((await rail.locator(".vus-carte").first().innerText()).includes("0,150"), "chaque pièce avec son prix, relu en base");
    await rail.scrollIntoViewIfNeeded();
    await pause(700);
    await capture(page, "quinca-vus-recemment");
    await clic(page, rail.getByRole("button", { name: "Effacer les produits vus récemment" }));
    await pause(300);
    await page.reload({ waitUntil: "networkidle" });
    await pause(500);
    verifie((await page.locator(".vus").count()) === 0, "« Effacer » : le rail disparaît, et ne revient pas au rechargement");
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 5. Ce que la boutique raconte : ses pages, le contact, le suivi ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  espion(page, "contenus");

  await etape("le pied mène aux pages de la boutique et à ses réseaux", async () => {
    await page.goto(S + "/", { waitUntil: "networkidle" });
    verifie((await page.locator(".ed-annonce").first().innerText()).includes("Le lin d'été est arrivé"), "l'annonce de la boutique, en tête du site");
    const pied = page.locator("footer.ed-pied");
    verifie(await pied.locator("a[href='/a-propos']").count() === 1 && await pied.locator("a[href='/guide-des-tailles']").count() === 1,
      "« À propos » et « Guide des tailles » au pied de page");
    const reseaux = pied.locator(".pied-reseaux a");
    const liens = await reseaux.evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    verifie(liens.some((h) => h.startsWith("https://www.instagram.com/maison.selma")) && liens.some((h) => h.startsWith("https://www.tiktok.com/@maison.selma"))
      && liens.some((h) => h.startsWith("https://wa.me/")), `les réseaux au pied : Instagram, TikTok, WhatsApp (${liens.length} liens)`);
    const hauts = await reseaux.evaluateAll((as) => as.map((a) => Math.round(a.getBoundingClientRect().top)));
    verifie(new Set(hauts).size === 1, "sur une seule ligne");
    const bouton = page.locator("a.whatsapp-flottant");
    verifie(await bouton.isVisible() && (await bouton.getAttribute("href") ?? "").startsWith("https://wa.me/21670000003?text="),
      "le bouton WhatsApp, sur toutes les pages, message déjà commencé");
    await clic(page, pied.locator("a[href='/guide-des-tailles']"));
    await page.waitForURL(/\/guide-des-tailles$/);
    await page.waitForLoadState("networkidle");
    verifie(await page.locator("h1").innerText() === "Guide des tailles", "la page écrite au backoffice s'ouvre, son titre en tête");
    verifie(await page.locator(".page-boutique-texte h2").count() >= 2 && await page.locator(".page-boutique-texte li").count() >= 5,
      "ses intertitres et sa liste des tailles, mis en forme");
    await capture(page, "selma-guide-des-tailles", true);
  });

  await etape("questions fréquentes : un accordéon, la première ouverte", async () => {
    await page.goto(S + "/questions-frequentes", { waitUntil: "networkidle" });
    const plis = page.locator(".page-questions .pli");
    verifie(await plis.count() === 6, "six questions");
    verifie(await plis.first().getAttribute("open") !== null && await plis.nth(1).getAttribute("open") === null, "la première ouverte, les autres repliées");
    await clic(page, plis.nth(3).locator("summary"));
    await pause(300);
    verifie((await plis.nth(3).innerText()).includes("14 jours"), "une question s'ouvre au clic, sa réponse lisible");
    verifie(await plis.nth(3).locator("a[href='/guide-des-tailles']").count() === 1, "un lien du texte mène à une autre page de la boutique");
    verifie((await page.locator(".page-boutique-aide").innerText()).includes("Écrivez-nous"), "et en bas, « Écrivez-nous »");
    await capture(page, "selma-questions");
  });

  await etape("contact : les canaux de la boutique", async () => {
    await page.goto(S + "/contact", { waitUntil: "networkidle" });
    const canaux = await page.locator("a.contact-canal").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    verifie(canaux.some((h) => h.startsWith("https://wa.me/21670000003")) && canaux.includes("tel:+21670000003") && canaux.some((h) => h.startsWith("mailto:")),
      `WhatsApp, téléphone, e-mail (${canaux.length} canaux)`);
    verifie((await page.locator("main").innerText()).includes("de 10 h à 19 h"), "avec les horaires");
    await capture(page, "selma-contact");
  });

  await etape("suivre une commande, sans compte", async () => {
    await clic(page, page.locator(".contact-suivi a"));
    await page.waitForURL(/\/suivi$/);
    await page.waitForLoadState("networkidle");
    await clic(page, page.locator("#suivi-numero"));
    await tape(page, "SEL-2025-00048");
    await clic(page, page.locator("#suivi-telephone"));
    await tape(page, "20 000 000");
    await page.keyboard.press("Enter");
    const alerte = page.locator(".suivi-formulaire [role=alert]");
    await alerte.waitFor({ timeout: 8000 }).catch(() => {});
    verifie((await alerte.innerText().catch(() => "")).includes("Aucune commande"), "un autre téléphone : « aucune commande », sans dire lequel des deux est faux");
    await page.locator("#suivi-telephone").fill("");
    await clic(page, page.locator("#suivi-telephone"));
    await tape(page, "20 111 208");
    await page.keyboard.press("Enter");
    const resultat = page.locator(".suivi-resultat");
    await resultat.waitFor({ timeout: 8000 }).catch(() => {});
    verifie(await resultat.count() === 1 && (await resultat.innerText()).includes("SEL-2025-00048"), "le bon téléphone : la commande, sa frise, son contenu");
    verifie(await page.evaluate(() => document.activeElement?.classList.contains("suivi-resultat")), "le focus passe au résultat (lecteurs d'écran)");
    await capture(page, "selma-suivi");
    let bouton = false;
    for (let i = 0; i < 15 && !bouton; i++) {
      await page.keyboard.press("Tab");
      bouton = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Suivre une autre commande");
    }
    await page.keyboard.press("Enter");
    await page.locator("#suivi-numero").waitFor({ timeout: 4000 }).catch(() => {});
    verifie(bouton && await page.evaluate(() => document.activeElement?.id === "suivi-numero"),
      "« Suivre une autre commande » au clavier : le formulaire revient, le curseur dans le numéro");
  });

  await etape("une taille épuisée : « Prévenez-moi de son retour », au clavier", async () => {
    // Le combishort en M : épuisé dans toutes ses couleurs.
    await page.goto(S + "/produit/combishort-fleurs", { waitUntil: "networkidle" });
    const taille = page.locator(".axe", { hasText: "Taille" }).getByRole("button", { name: "M", exact: true });
    verifie(!(await taille.isDisabled()) && (await taille.getAttribute("data-epuise")) === "", "la taille épuisée reste barrée, mais se choisit");
    verifie((await page.locator(".axe-note").first().innerText().catch(() => "")).includes("Choisissez-la pour qu'on vous prévienne de son retour"),
      "et la note le dit");
    await clic(page, taille);
    const bloc = page.locator(".fiche-indisponible");
    verifie((await bloc.innerText().catch(() => "")).includes("n'est pas disponible"), "choisie : la fiche dit qu'elle n'est pas disponible");
    await bloc.getByRole("button", { name: "Prévenez-moi de son retour" }).focus();
    await page.keyboard.press("Enter");
    verifie(await page.evaluate(() => document.activeElement?.getAttribute("type") === "tel"), "Entrée : le curseur dans le téléphone");
    await tape(page, "20 555 777");
    await page.keyboard.press("Enter");
    const notee = page.locator(".alerte-retour-notee");
    await notee.waitFor({ timeout: 8000 }).catch(() => {});
    verifie((await notee.innerText().catch(() => "")).includes("au 20 555 777"), "« C'est noté », avec le numéro tel qu'on le lit");
    verifie(await page.evaluate(() => document.activeElement?.classList.contains("alerte-retour-notee")), "le focus passe à la réponse");
    await capture(page, "selma-alerte-retour");
  });

  await etape("pendant la commande, pas de bouton WhatsApp", async () => {
    await page.goto(S + "/produit/robe-bretelles-terracotta", { waitUntil: "networkidle" });
    await clic(page, page.locator(".valeur", { hasText: /^M$/ }));
    await clic(page, page.locator(".achat .btn-ajout"));
    await pause(600);
    await page.goto(S + "/commande", { waitUntil: "networkidle" });
    verifie(await page.locator(".tunnel-page").count() === 1, "le tunnel de commande est ouvert");
    verifie(!(await page.locator("a.whatsapp-flottant").isVisible().catch(() => false)), "le tunnel ne montre rien qui détourne de « Confirmer »");
  });
  await ctx.close();
}

await navigateur.close();
process.exit(t.bilan());
