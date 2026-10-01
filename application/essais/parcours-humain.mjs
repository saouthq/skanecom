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
// SECTIONS=4, ou SECTIONS=1,maison : ces sections seules, pendant le
// développement (la séquence de la CI les passe toutes). Les sections :
// 1 2 3 4 5 beaute maison.
const SECTIONS = (process.env.SECTIONS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
function section(n) { return SECTIONS.length === 0 || SECTIONS.includes(n); }
const tiroirOuvert = (page, classe) => page.locator(`.tiroir.${classe}[role=dialog]`).isVisible().catch(() => false);
// Attend qu'une condition se vérifie (l'écran répond après un geste).
const attend = async (condition, ms) => {
  for (const fin = Date.now() + ms; Date.now() < fin; await pause(120)) if (await condition().catch(() => false)) return true;
  return false;
};

/* ------------------------------------------------------------------ */
if (section("1")) {
  console.log("\n== 1. Maison Selma (structure immersive), à la souris ==");
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  espion(page, "selma-souris");
  // Selma mesure son audience (supabase/seed-visites.sql) : un signal par page vue.
  const signaux = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname === "/stats") signaux.push(r.method()); });

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

  await etape("l'Immersif : la pièce de la saison, les rangées, le lookbook", async () => {
    // Selma est en Immersif (supabase/seed-immersif.sql). Un navigateur à
    // part : la robe mise au panier ici ne doit pas peser sur la suite.
    const ci = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
    const p = await ci.newPage();
    espion(p, "selma-immersif");
    await p.goto(S + "/", { waitUntil: "networkidle" });
    verifie(await p.evaluate(() => document.documentElement.dataset.structure) === "immersif", "Selma est en structure immersive");
    const hauteur = await p.locator(".im-ouverture").evaluate((e) => e.getBoundingClientRect().height / innerHeight);
    verifie(hauteur > 0.9, `l'ouverture prend l'écran (${Math.round(hauteur * 100)} %)`);
    // La pièce de la saison : le bloc d'achat de la fiche, sur l'accueil.
    const piece = p.locator(".ps");
    await piece.scrollIntoViewIfNeeded();
    verifie((await piece.locator("h2").innerText()).includes("Robe à bretelles en lin"), "la pièce de la saison : la robe à bretelles, son nom pour titre");
    await clic(p, piece.locator(".valeur", { hasText: /^M$/ }).first());
    await clic(p, piece.getByRole("button", { name: "Ajouter au panier" }).first());
    verifie(await attend(async () => (await compte(p)).trim() === "1", 6000), "« Ajouter au panier » depuis l'accueil : le panier compte la pièce");
    await capture(p, "selma-immersif-piece");
    await p.keyboard.press("Escape");
    // La sélection glisse : la flèche avance le compteur.
    const rail = p.locator(".im-section .im-rail").filter({ hasText: "Nouveautés" });
    await rail.scrollIntoViewIfNeeded();
    const avant = await rail.locator(".im-rail-position").innerText();
    await clic(p, rail.getByRole("button", { name: "Suivant" }));
    verifie(await attend(async () => (await rail.locator(".im-rail-position").innerText()) !== avant, 4000),
      `la flèche fait glisser la rangée (${avant} → ${await rail.locator(".im-rail-position").innerText()})`);
    verifie(await rail.getByRole("button", { name: "Précédent" }).isEnabled(), "et « Précédent » revient en arrière");
    // Le lookbook : un point, sa pièce ; Échap la ferme ; la liste mène à la fiche.
    const look = p.locator(".lk");
    await look.scrollIntoViewIfNeeded();
    const point = look.getByRole("button", { name: /Combishort/ });
    verifie(await point.getAttribute("aria-expanded") === "true" && await look.locator(".lk-carte").isVisible(), "le lookbook s'ouvre sur la carte de sa pièce");
    await capture(p, "selma-immersif-lookbook");
    await point.focus();
    await p.keyboard.press("Escape");
    verifie(await look.locator(".lk-carte").count() === 0 && await point.getAttribute("aria-expanded") === "false", "Échap ferme la carte");
    await p.keyboard.press("Enter");
    verifie(await attend(() => look.locator(".lk-carte").isVisible(), 2000), "au clavier, Entrée sur le point la rouvre");
    await clic(p, look.locator(".lk-pieces a").first());
    verifie(await p.waitForURL(/\/produit\/combishort-fleurs$/, { timeout: 8000 }).then(() => true, () => false), "la pièce du look mène à sa fiche");
    await ci.close();
  });

  await etape("la mesure d'audience : un signal par page, sans cookie", async () => {
    await page.goto(S + "/catalogue", { waitUntil: "networkidle" });
    await pause(300);
    verifie(signaux.length >= 2 && signaux.every((m) => m === "POST"), `l'accueil puis le catalogue : un signal chacun (${signaux.length})`);
    verifie((await ctx.cookies()).every((c) => !/stat|visit|audience|_ga|_fbp/i.test(c.name)), "aucun témoin de mesure posé dans le navigateur");
  });

  await etape("l'accueil : ce que disent les clientes, et leurs questions", async () => {
    // Selma montre ses avis et ses questions fréquentes (supabase/seed-accueil.sql).
    await page.goto(S + "/", { waitUntil: "networkidle" });
    const avis = page.locator(".bi-avis");
    await avis.scrollIntoViewIfNeeded();
    await pause(500);
    const citations = await avis.locator(".bi-citation").count();
    verifie(citations >= 3 && citations % 3 === 0, `des citations d'acheteuses vérifiées, en rangées pleines (${citations})`);
    verifie(/^\d,\d$/.test((await avis.locator(".bi-avis-note > b").innerText()).trim()), "avec la note de la boutique");
    await capture(page, "selma-accueil-avis");
    const pli = page.locator(".bi-questions .pli").first();
    await pli.locator("summary").focus();
    await page.keyboard.press("Enter");
    await pause(200);
    verifie(await pli.evaluate((d) => d.open), "au clavier, Entrée ouvre une question de l'accueil");
    verifie(await page.locator(".bi-questions a[href='/questions-frequentes']").count() === 1, "et un lien mène à toutes les questions");
    await clic(page, avis.locator(".bi-citation-produit").first());
    await page.waitForURL(/\/produit\//);
    verifie(/\/produit\//.test(page.url()), "la pièce citée mène à sa fiche");
  });

  await etape("collection « Robes » depuis l'accueil", async () => {
    await page.goto(S + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 0)); await pause(300);
    // Selma est en Immersif (supabase/seed-immersif.sql) : ses collections glissent en rangée.
    const tuile = page.locator(".im-collections a", { hasText: "Robes" });
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
    // L'ajout en un geste : le sac n'a qu'une déclinaison ; la chemise a ses tailles.
    const ajoutSac = ensemble.getByRole("button", { name: "Ajouter Sac de voyage en cuir au panier" });
    verifie((await ajoutSac.count()) === 1, "le sac (une seule déclinaison) s'ajoute d'un geste, depuis le tiroir");
    verifie((await ensemble.getByRole("link", { name: /^Choisir la taille ou la couleur de Chemise/ }).count()) === 1, "la chemise (des tailles) mène à sa fiche");
    await ajoutSac.focus();
    await page.keyboard.press("Enter");
    await pause(400);
    const lignes = page.locator(".tiroir-panier .panier-ligne");
    verifie((await lignes.count()) === 2 && (await lignes.last().innerText()).includes("Sac de voyage en cuir"), "Entrée : le sac rejoint le panier, sans quitter le tiroir");
    verifie((await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Ajouté — Sac de voyage en cuir", "le focus reste sur la suggestion, « Ajouté »");
    verifie((await page.locator(".tiroir-panier .panier-total + .legende").innerText()) === "Livraison offerte.",
      "le seuil atteint, le pied dit « Livraison offerte. » comme la jauge (plus « Livraison en sus »)");
    await capture(page, "selma-tiroir-ajout-geste");
    await clic(page, lignes.last().getByRole("button", { name: "Retirer Sac de voyage en cuir" }));
    await pause(300);
    verifie((await lignes.count()) === 1 && (await ajoutSac.count()) === 1, "retiré du panier : la suggestion redevient « Ajouter »");
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
    verifie((await section.locator(".avis-filtres, .avis-repartition-bouton, .avis-suite").count()) === 0,
      "trois avis se lisent d'un coup d'œil : ni filtre, ni note à toucher, ni suite");
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

  await etape("les avis du sac : ses photos sous le titre, les filtres, la suite", async () => {
    // Treize avis publiés, dont quatre avec photos (supabase/seed-avis-photos.sql, seed-avis-filtres.sql).
    const tete = page.locator(".fiche-avis-tete");
    verifie((await tete.innerText()).replace(/\s+/g, " ").includes("4,4 13 avis 6 photos de clients") && (await tete.locator(".fiche-avis-vignettes > span").count()) === 3,
      `sous le titre : la note, puis trois vignettes et « 6 photos de clients » (${(await tete.innerText()).replace(/\s+/g, " ")})`);
    await clic(page, tete.locator(".fiche-avis-photos"));
    await pause(900);
    const rang = await page.locator("#avis-rang").boundingBox();
    verifie(rang && rang.y > 60 && rang.y < 400, `le lien mène au rang des photos, sous l'en-tête (${Math.round(rang?.y ?? -1)} px)`);
    const plein = await page.locator(".avis-synthese .etoiles").evaluate((e) => [e.getBoundingClientRect().width, e.querySelector(".etoiles-plein").getBoundingClientRect().width]);
    verifie(Math.abs(plein[1] / plein[0] - 0.88) < 0.02, `la synthèse : 4,4 remplit 88 % des étoiles (${Math.round((plein[1] / plein[0]) * 100)} %)`);
    const liste = page.locator("#avis .avis-liste");
    const items = liste.locator(".avis-item");
    verifie((await items.count()) === 10 && (await page.locator(".avis-suite").innerText()).replace(/\s+/g, " ") === "Voir 3 avis de plus 10 sur 13",
      "dix avis d'abord, « Voir 3 avis de plus · 10 sur 13 »");
    const pastilles = (await page.locator(".avis-filtre").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
    verifie(pastilles.join(" | ") === "Tous 13 | Avec photos 4 | 5 étoiles 8 | 4 étoiles 3 | 3 étoiles 1 | 2 étoiles 1",
      `les pastilles : tous, avec photos, chaque note qui a des avis (${pastilles.join(" | ")})`);
    await capture(page, "selma-avis-filtres");

    // Au clavier : « Avec photos », Entrée.
    const avecPhotos = page.getByRole("button", { name: /^Avec photos/ });
    await avecPhotos.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => { const l = document.querySelector("#avis .avis-liste"); return l?.dataset.filtre === "photos" && !l.hasAttribute("aria-busy"); }, null, { timeout: 8000 });
    const sansPhoto = await items.evaluateAll((l) => l.filter((x) => !x.querySelector(".avis-photo")).length);
    verifie((await items.count()) === 4 && sansPhoto === 0 && (await avecPhotos.getAttribute("aria-pressed")) === "true",
      "Entrée sur « Avec photos » : les quatre avis illustrés, la pastille enfoncée");
    verifie((await page.locator("#avis .avis-annonce").innerText()) === "4 avis avec photos", "le résultat est annoncé aux lecteurs d'écran");

    // À la souris : la ligne « 2 étoiles » de la répartition.
    await clic(page, page.getByRole("button", { name: "Afficher l'avis à 2 étoiles" }));
    await page.waitForFunction(() => { const l = document.querySelector("#avis .avis-liste"); return l?.dataset.filtre === "2" && !l.hasAttribute("aria-busy"); }, null, { timeout: 8000 });
    verifie((await items.count()) === 1 && (await items.first().innerText()).includes("Une sangle s'est décousue")
      && (await page.locator(".avis-filtre", { hasText: "2 étoiles" }).getAttribute("aria-pressed")) === "true",
      "un clic sur « 2 étoiles » de la répartition : l'avis à deux étoiles, sa pastille enfoncée aussi");
    await capture(page, "selma-avis-deux-etoiles");

    // Retour à tous, puis la suite au clavier : le focus va au premier avis ajouté.
    await clic(page, page.locator(".avis-filtre", { hasText: "Tous" }));
    await page.waitForFunction(() => document.querySelector("#avis .avis-liste")?.dataset.filtre === "tous");
    verifie((await items.count()) === 10, "« Tous » : les dix lus d'abord, sans recharger");
    await page.locator(".avis-plus").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll("#avis .avis-item").length === 13, null, { timeout: 8000 });
    await pause(200);
    const focus = await page.evaluate(() => [...document.querySelectorAll("#avis .avis-item")].indexOf(document.activeElement));
    verifie(focus === 10 && (await page.locator(".avis-suite").count()) === 0,
      `Entrée sur « Voir 3 avis de plus » : les treize, le focus sur le onzième, plus de suite (focus ${focus + 1})`);
  });

  await etape("les photos d'un avis : au clavier, la visionneuse, le focus revient", async () => {
    // Le premier avis du sac a deux photos (supabase/seed-avis-photos.sql), sur la fiche où l'on est.
    const vignettes = page.locator("#avis .avis-item").first().locator(".avis-photo");
    verifie((await vignettes.count()) === 2, "sous le premier avis du sac, ses deux photos");
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

  await etape("partager la fiche : WhatsApp, Facebook, le lien, au clavier", async () => {
    // Selma propose « Partager » (supabase/seed-partage.sql) ; on est sur la fiche du sac.
    const bouton = page.locator(".partage-bouton");
    await bouton.focus();
    await page.keyboard.press("Enter");
    await page.locator(".partage-menu").waitFor({ timeout: 3000 });
    verifie((await bouton.getAttribute("aria-expanded")) === "true" && (await page.locator(".partage-choix").allInnerTexts()).join(" | ") === "WhatsApp | Facebook | Copier le lien",
      "Entrée : le menu s'ouvre, trois choix");
    const wa = decodeURIComponent((await page.locator(".partage-choix").first().getAttribute("href")) ?? "");
    verifie(wa.startsWith("https://wa.me/?text=") && wa.includes("Sac de voyage en cuir, chez Maison Selma") && wa.endsWith("/produit/sac-voyage-cuir"),
      "WhatsApp : le nom de la pièce, la boutique, le lien de la fiche sans paramètre");
    await page.keyboard.press("Tab");
    verifie(await page.evaluate(() => document.activeElement?.textContent?.trim() === "WhatsApp"), "Tab : le premier choix");
    await capture(page, "selma-partage");
    await page.keyboard.press("Escape");
    await pause(200);
    verifie((await page.locator(".partage-menu").count()) === 0 && (await bouton.evaluate((e) => e === document.activeElement)),
      "Échap le referme, le focus revient au bouton");
  });

  await etape("le panier survit au rechargement", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await pause(300);
    verifie((await compte(page)) === "2", "après rechargement, 2 articles");
  });

  await etape("les pixels publicitaires : rien sans l'accord, l'accord au clavier, les événements, le retrait", async () => {
    // Selma a un pixel Meta et un pixel TikTok (supabase/seed-pixels.sql) ; un
    // visiteur qui n'a pas encore choisi. Leurs scripts viennent du bouchon du testeur.
    const pub = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR", consentementPub: null });
    const p = await pub.newPage();
    t.espion(p, "selma-pixels");
    const demandes = [];
    p.on("request", (r) => { if (/connect\.facebook\.net|analytics\.tiktok\.com/.test(r.url())) demandes.push(r.url()); });
    const files = () => p.evaluate(() => ({
      meta: (window.fbq?.queue ?? []).map((a) => `${a[0]} ${a[1]}${a[2]?.content_ids ? ` ${a[2].content_ids.join(",")}` : ""}`),
      tiktok: (Array.isArray(window.ttq) ? window.ttq : []).map((a) => `${a[0]}${a[1] ? ` ${a[1]}` : ""}`),
    }));
    await p.goto(S + "/", { waitUntil: "networkidle" });
    await pause(600);
    const bandeau = p.locator(".pub-consentement");
    verifie(await bandeau.isVisible() && (await bandeau.innerText()).includes("Facebook, Instagram et TikTok"), "un bandeau demande l'accord, en nommant les plateformes");
    verifie(demandes.length === 0 && (await p.evaluate(() => typeof window.fbq + typeof window.ttq)) === "undefinedundefined",
      "avant tout choix : aucun script de Meta ni de TikTok n'est demandé");
    const [refuser, accepter] = await Promise.all(["Refuser", "Accepter"].map((n) => bandeau.getByRole("button", { name: n }).boundingBox()));
    verifie(Math.abs(refuser.width - accepter.width) < 1 && Math.abs(refuser.height - accepter.height) < 1, "« Refuser » et « Accepter » de même taille");
    await capture(p, "selma-pixels-bandeau");
    const ordre = [];
    for (let i = 0; i < 4; i++) {
      await p.keyboard.press("Tab");
      ordre.push(await p.evaluate(() => document.activeElement?.textContent?.trim()));
    }
    verifie(ordre.join(" → ") === "Aller au contenu → En savoir plus → Refuser → Accepter", `au clavier, le bandeau vient d'abord (${ordre.join(" → ")})`);
    await p.keyboard.press("Enter");
    await p.waitForFunction(() => Array.isArray(window.fbq?.queue), null, { timeout: 3000 });
    await pause(300);
    let f = await files();
    verifie((await bandeau.count()) === 0 && f.meta.join("|") === "init 1000000000000003|track PageView" && f.tiktok.join("|") === "page"
      && demandes.some((u) => u.includes("fbevents.js")) && demandes.some((u) => u.includes("sdkid=CSELMA0000000000DEMO")),
      `Entrée sur « Accepter » : les deux pixels chargés, une page vue (${f.meta.join(", ")} ; ${f.tiktok.join(", ")})`);
    await p.goto(S + "/produit/sac-voyage-cuir", { waitUntil: "networkidle" });
    await pause(400);
    await clic(p, p.locator(".achat .btn-ajout"));
    await pause(500);
    f = await files();
    verifie(f.meta.includes("track ViewContent SEL19-COG") && f.meta.includes("track AddToCart SEL19-COG")
      && f.tiktok.includes("track ViewContent") && f.tiktok.includes("track AddToCart"),
      `la fiche regardée, l'ajout au panier : chez Meta et chez TikTok, par la référence (${f.meta.slice(1).join(", ")})`);
    // Changer d'avis : « Cookies publicitaires », au pied de page.
    await clic(p, p.getByRole("button", { name: "Cookies publicitaires" }));
    await pause(300);
    verifie((await bandeau.innerText()).includes("Aujourd'hui : accepté.") && (await p.evaluate(() => document.activeElement?.textContent?.trim())) === "Refuser",
      "le pied rouvre le bandeau, qui dit le choix du moment ; le focus sur « Refuser »");
    demandes.length = 0;
    await Promise.all([p.waitForNavigation(), p.keyboard.press("Enter")]);
    await p.waitForLoadState("networkidle");
    verifie((await p.evaluate(() => typeof window.fbq + typeof window.ttq)) === "undefinedundefined" && demandes.length === 0 && (await bandeau.count()) === 0,
      "refusé : la page repart sans les scripts, et le bandeau ne revient pas");
    await p.goto(S + "/confidentialite#publicite", { waitUntil: "networkidle" });
    const texte = await p.locator("#publicite").innerText();
    verifie(texte.includes("Seulement si vous l'acceptez") && texte.includes("jamais votre nom, votre téléphone ni votre adresse"),
      "la politique de confidentialité le dit : seulement avec l'accord, ni nom, ni téléphone, ni adresse");
    await pub.close();
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
if (section("2")) {
  console.log("\n== 2. Maymar, au clavier seul ==");
  const ctx = await navigateur.newContext({ viewport: { width: 1366, height: 850 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  espion(page, "maymar-clavier");
  let signauxMaymar = 0;
  page.on("request", (r) => { if (new URL(r.url()).pathname === "/stats") signauxMaymar += 1; });
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
    verifie(signauxMaymar === 0, "ni mesure d'audience : aucun signal envoyé (réglage coupé)");
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
if (section("3")) {
  console.log("\n== 3. Sur téléphone (tactile) ==");
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
    verifie((await page.locator(".partage").count()) === 0, "Maymar n'a pas le réglage : pas de bouton « Partager »");
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
if (section("4")) {
  console.log("\n== 4. Quincaillerie (structure Commerce, sur le gabarit technique), à la souris ==");
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

  await etape("Commerce : la recherche d'abord, les rayons en raccourcis", async () => {
    // La quincaillerie est en Commerce (supabase/seed-commerce.sql).
    await page.goto(Q + "/", { waitUntil: "networkidle" });
    verifie(await page.evaluate(() => document.documentElement.dataset.structure) === "commerce", "la quincaillerie est en structure Commerce");
    verifie(await page.locator(".co-ouverture #q-accueil").isVisible(), "l'ouverture est une grande barre de recherche");
    const services = page.locator(".co-services li");
    verifie(await services.count() >= 3 && (await services.first().boundingBox()).y < (await page.locator(".co-rayons").boundingBox()).y,
      `les services en bande, sous l'ouverture (${await services.count()})`);
    await clic(page, page.locator(".co-raccourcis").getByRole("link", { name: "Visserie" }));
    await page.waitForURL(/\/categorie\/visserie$/);
    verifie(true, "un raccourci de l'ouverture mène au rayon");
    await page.goto(Q + "/", { waitUntil: "networkidle" });
  });

  await etape("le grand menu des rayons, à la souris puis au clavier", async () => {
    const bouton = page.getByRole("button", { name: "Tous les rayons" });
    await clic(page, bouton);
    verifie(await bouton.getAttribute("aria-expanded") === "true", "« Tous les rayons » ouvre le grand menu");
    await page.locator(".gm-rayon > a", { hasText: "Quincaillerie" }).hover();
    verifie(await attend(() => page.locator(".gm-detail").getByRole("link", { name: /^Visserie/ }).isVisible(), 2000), "au survol d'un rayon, ses sous-rayons");
    await pause(300);
    await capture(page, "quinca-grand-menu");
    await page.keyboard.press("Escape");
    verifie(await bouton.getAttribute("aria-expanded") === "false", "Échap le referme");
    await bouton.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
    const lien = await page.evaluate(() => document.activeElement?.closest(".gm-detail") ? document.activeElement.textContent.trim() : null);
    verifie(Boolean(lien?.startsWith("Visserie")), `au clavier : Tab, ↓ (le rayon suivant), Tab entre dans ses sous-rayons (« ${lien} »)`);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/categorie\/visserie$/);
    verifie(await attend(async () => (await bouton.getAttribute("aria-expanded")) === "false", 2000), "Entrée suit le lien, le menu se referme");
  });

  await etape("comparer deux perceuses, côte à côte", async () => {
    await page.goto(Q + "/categorie/perceuses", { waitUntil: "networkidle" });
    const cartes = page.locator(".te-carte");
    for (const i of [0, 1]) {
      await cartes.nth(i).hover();
      await clic(page, cartes.nth(i).getByRole("button", { name: /^Comparer :/ }));
    }
    const barre = page.locator(".barre-comparaison");
    verifie(await attend(async () => (await barre.locator(".bc-pieces > li:not(.bc-vide)").count()) === 2, 3000), "deux pièces cochées : la barre du bas les montre");
    verifie(await cartes.nth(0).getByRole("button", { name: /^Retirer de la comparaison/ }).getAttribute("aria-pressed") === "true", "la case le dit (aria-pressed)");
    await capture(page, "quinca-comparaison-barre");
    await clic(page, barre.getByRole("link", { name: "Comparer (2)" }));
    await page.waitForURL(/\/comparer\?p=/);
    await page.waitForLoadState("networkidle");
    const tableau = page.locator(".cp-tableau");
    verifie((await tableau.locator("thead th").count()) === 2, "la page met les deux pièces côte à côte");
    verifie(/710[\s\u00a0\u202f]W/.test(await tableau.locator("tbody").innerText()), "avec leurs caractéristiques (la puissance de la perceuse)");
    await capture(page, "quinca-comparer", true);
    const avant = await tableau.locator("tbody tr:visible").count();
    await clic(page, page.getByLabel("Seulement les différences"));
    note("INFO  ", `lignes : ${avant} → ${await tableau.locator("tbody tr:visible").count()} avec « Seulement les différences »`);
    await clic(page, tableau.getByRole("link", { name: /^Retirer de la comparaison/ }).first());
    await page.waitForLoadState("networkidle");
    verifie(await attend(async () => (await page.locator(".cp-vide").count()) === 1, 4000), "une pièce retirée : il n'en reste qu'une, la page dit d'en cocher une autre");
    const gardees = await page.evaluate(() => JSON.parse(localStorage.getItem(`skanecom.comparaison.${document.documentElement.dataset.boutique}.v1`) ?? "[]").length);
    verifie(gardees === 1, `et la liste du navigateur suit la page (${gardees})`);
  });

  await etape("Commerce au téléphone : la barre d'onglets", async () => {
    const ct = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "fr-FR" });
    const p = await ct.newPage();
    espion(p, "quinca-telephone");
    await p.goto(Q + "/", { waitUntil: "networkidle" });
    const onglets = p.getByRole("navigation", { name: "Navigation rapide" });
    const boite = await onglets.boundingBox();
    verifie(Boolean(boite) && Math.round(boite.y + boite.height) >= 840 && await p.evaluate(() => document.documentElement.scrollWidth) === 390,
      "la barre d'onglets tient en bas de l'écran, sans débordement");
    verifie(await onglets.getByRole("link", { name: "Accueil" }).getAttribute("aria-current") === "page", "l'onglet de la page est marqué");
    verifie(!(await p.locator(".co-recherche").isVisible()), "une seule barre de recherche (celle de l'en-tête)");
    await capture(p, "quinca-telephone-onglets");
    await onglets.getByRole("button", { name: "Rayons" }).tap();
    verifie(await attend(() => p.locator(".tiroir-menu[role=dialog]").isVisible(), 3000), "« Rayons » ouvre le menu des rayons");
    await p.keyboard.press("Escape");
    await pause(400);
    await onglets.getByRole("button", { name: /^Panier/ }).tap();
    verifie(await attend(() => p.locator(".tiroir-panier[role=dialog]").isVisible(), 3000), "« Panier » ouvre le panier");
    await p.keyboard.press("Escape");
    await p.goto(Q + "/produit/perceuse-percussion-710w", { waitUntil: "networkidle" });
    verifie((await p.locator(".barre-onglets").count()) === 0, "sur une fiche, la barre se retire (la barre d'achat prend le bas)");
    await ct.close();
  });

  await etape("les marques du catalogue, chacune vers ses pièces", async () => {
    // La quincaillerie montre ses marques (supabase/seed-accueil.sql).
    await page.goto(Q + "/", { waitUntil: "networkidle" });
    const marques = page.locator(".bi-marque");
    verifie(await marques.count() >= 2, `les marques de l'accueil (${(await page.locator(".bi-marque-nom").allInnerTexts()).join(", ")})`);
    const nom = (await page.locator(".bi-marque-nom").first().innerText()).trim();
    await clic(page, marques.first());
    await page.waitForURL(/\/recherche\?q=/);
    await page.waitForLoadState("networkidle");
    verifie((await page.locator("main").innerText()).toLowerCase().includes(nom.toLowerCase()), `un clic : les pièces de la marque (${nom})`);
    await page.goto(Q + "/", { waitUntil: "networkidle" });
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

  await etape("les cartes d'une rangée, alignées ligne à ligne", async () => {
    await page.goto(Q + "/catalogue", { waitUntil: "networkidle" });
    // Pour chaque rangée de la grille : l'écart entre les lignes de prix, et entre les boutons, d'une carte à l'autre.
    const ecarts = await page.evaluate(() => {
      const rangs = new Map();
      for (const c of document.querySelectorAll(".te-grille .te-carte")) {
        const haut = Math.round(c.getBoundingClientRect().top);
        const y = (sel) => { const e = c.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top) : null; };
        if (!rangs.has(haut)) rangs.set(haut, []);
        rangs.get(haut).push([y(".te-carte-prix"), y(".te-carte-bas .btn, .te-carte-bas button")]);
      }
      const ecart = (xs) => { const v = xs.filter((x) => x !== null); return v.length > 1 ? Math.max(...v) - Math.min(...v) : 0; };
      return [...rangs.values()].filter((g) => g.length > 1).map((g) => Math.max(ecart(g.map((x) => x[0])), ecart(g.map((x) => x[1]))));
    });
    verifie(ecarts.length > 0 && ecarts.every((e) => e <= 1), `prix et boutons alignés d'une carte à l'autre, même avec un prix barré (écarts : ${ecarts.join(", ")} px)`);
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
    // L'essentiel sous le titre, avant le prix ; le lien mène au tableau complet.
    const cles = await page.locator(".specs-cles li").count();
    const yCles = (await page.locator(".specs-cles").boundingBox())?.y ?? 9999;
    const yAjout = (await page.locator(".achat .btn-ajout").first().boundingBox())?.y ?? 0;
    verifie(cles >= 2 && cles <= 4 && yCles < yAjout, `l'essentiel de la fiche technique sous le titre, avant l'achat (${cles} caractéristiques)`);
    verifie((await page.locator(".specs-cles-tout").getAttribute("href")) === "#caracteristiques" && (await page.locator("#caracteristiques dl").count()) === 1,
      "« Toutes les caractéristiques » mène au tableau complet");
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
if (section("5")) {
  console.log("\n== 5. Ce que la boutique raconte : ses pages, le contact, le suivi ==");
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

  await etape("la lettre, au pied : l'accord coché à la main, puis confirmé par le lien reçu", async () => {
    // Selma a une lettre (supabase/seed-lettre.sql) ; au clavier, du champ à « S'inscrire ».
    const RELAIS = process.env.RELAIS ?? "http://127.0.0.1:54321";
    const adresse = `lettre-${Date.now().toString(36)}@exemple.tn`;
    await page.goto(S + "/", { waitUntil: "networkidle" });
    const lettre = page.locator("footer .lettre");
    verifie((await lettre.locator(".lettre-accroche").innerText()).includes("une lettre par mois"), "la lettre et son accroche, au pied de page");
    verifie(!(await lettre.locator(".lettre-accord input").isChecked()), "l'accord n'est jamais coché d'avance");
    await lettre.locator(".lettre-champ").focus();
    await tape(page, adresse);
    await page.keyboard.press("Enter");
    await pause(300);
    verifie((await lettre.locator(".lettre-erreur").innerText().catch(() => "")).includes("Cochez la case")
      && await page.evaluate(() => document.activeElement?.getAttribute("type") === "checkbox"),
      "Entrée sans l'accord : refusé, le focus sur la case");
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    verifie(await page.evaluate(() => document.activeElement?.textContent?.trim() === "S'inscrire"), "Espace coche ; Tab, Tab : « S'inscrire »");
    await page.keyboard.press("Enter");
    const merci = lettre.locator(".lettre-merci");
    await merci.waitFor({ timeout: 10000 }).catch(() => {});
    verifie((await merci.innerText().catch(() => "")).includes(adresse) && await page.evaluate(() => document.activeElement?.classList.contains("lettre-merci")),
      "« Presque fini » : l'adresse redite, le focus sur la réponse");
    await capture(page, "selma-lettre-envoyee");
    const rendu = await (await fetch(`${RELAIS}/email-dev/rendu/dernier?email=${encodeURIComponent(adresse)}`)).json().catch(() => ({}));
    const lien = /href="([^"]*\/lettre\?j=[0-9a-f]{64})"/.exec(rendu.html ?? "")?.[1]?.replace(/&amp;/g, "&");
    verifie(rendu.nom === "Maison Selma" && Boolean(lien), `l'e-mail de confirmation, au nom de la boutique : « ${rendu.sujet} »`);
    if (!lien) return;
    await page.goto(lien, { waitUntil: "networkidle" });
    verifie(await page.locator("h1").innerText() === "Confirmez votre inscription", "le lien ouvre la page, rien n'est fait avant le clic");
    await clic(page, page.getByRole("button", { name: "Confirmer mon inscription" }));
    await page.locator('.lettre-geste[data-etat="inscrit"]').waitFor({ timeout: 10000 }).catch(() => {});
    verifie(await page.locator("h1").innerText() === "C'est confirmé" && await page.evaluate(() => document.activeElement?.tagName === "H1"),
      "« C'est confirmé », le titre prend le focus");
    await capture(page, "selma-lettre-confirmee");
  });

  await etape("au pied de page : comment on paie, qui livre", async () => {
    await page.goto(Q + "/", { waitUntil: "networkidle" });
    const moyens = (await page.locator(".pied-moyens").innerText()).replace(/\s+/g, " ");
    verifie(/Espèces à la livraison/i.test(moyens) && /Livré par Aramex/i.test(moyens) && /Retrait au magasin, à Sfax/i.test(moyens),
      `la quincaillerie : ${moyens}`);
    verifie(await page.locator(".lettre").count() === 0, "sans lettre (réglage coupé) : pas d'inscription");
    await page.goto(M + "/", { waitUntil: "networkidle" });
    verifie(await page.locator(".lettre").count() === 0 && (await page.locator(".pied-moyens").innerText()).includes("Espèces à la livraison"),
      "Maymar : le paiement à la livraison, pas de lettre");
  });

  await etape("pendant la commande, pas de bouton WhatsApp", async () => {
    await page.goto(S + "/produit/robe-bretelles-terracotta", { waitUntil: "networkidle" });
    await clic(page, page.locator(".valeur", { hasText: /^M$/ }));
    await clic(page, page.locator(".achat .btn-ajout"));
    await pause(600);
    await page.goto(S + "/commande", { waitUntil: "networkidle" });
    verifie(await page.locator(".tunnel-page").count() === 1, "le tunnel de commande est ouvert");
    verifie(!(await page.locator("a.whatsapp-flottant").isVisible().catch(() => false)) && !(await page.locator(".lettre").isVisible().catch(() => false)),
      "le tunnel ne montre rien qui détourne de « Confirmer » (ni WhatsApp, ni la lettre)");
  });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Yasmine Beauté (supabase/seed-beaute.sql) : la boutique de démonstration
// du métier beauté — gabarit éditorial, six rayons, teintes en pastilles.
// ---------------------------------------------------------------------------
if (section("beaute")) {
  const B = t.adresse("beaute.localhost");
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "beaute");
  const toutCharger = () => page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); }
    scrollTo(0, 0);
  });

  await etape("Yasmine Beauté : l'accueil d'une boutique de beauté", async () => {
    await page.goto(B + "/", { waitUntil: "networkidle" });
    verifie((await page.locator("main h1").innerText()).replace(/\s+/g, " ") === "La peau, au naturel.", "l'ouverture : « La peau, au naturel. »");
    const titres = (await page.locator("main h2").allInnerTexts()).map((h) => h.replace(/\s+/g, " ").trim());
    verifie(["Nouveautés", "Les collections", "Le jasmin, la fleur d'oranger", "Pour le rituel", "Ce qu'en disent nos clientes"].every((x) => titres.includes(x)),
      `ses sections : ${titres.join(" · ")}`);
    const grille = await page.locator(".ed-collections").evaluate((u) => [u.children.length, getComputedStyle(u).gridTemplateColumns.split(" ").length]);
    verifie(grille[0] === 6 && grille[1] === 6, `six rayons sur une seule rangée, aucun seul sur sa ligne (${grille[0]} rayons, ${grille[1]} colonnes)`);
    await toutCharger();
    await page.waitForLoadState("networkidle");
    const cassees = await page.evaluate(() => [...document.querySelectorAll("main img")].filter((i) => i.complete && i.naturalWidth === 0).length);
    verifie(cassees === 0, "toutes ses photos s'affichent");
    await capture(page, "beaute-accueil");
  });

  await etape("la contenance fait le prix : l'huile de figue de Barbarie en 30 ml", async () => {
    await page.goto(B + "/produit/huile-figue-de-barbarie", { waitUntil: "networkidle" });
    await clic(page, page.locator(".valeur", { hasText: "30 ml" }));
    const panneau = (await page.locator(".ed-fiche-panneau").innerText()).replace(/\s+/g, " ");
    verifie(panneau.includes("119,000") && panneau.includes("5 pièces"), "119,000 TND, et le stock de ce flacon-là (5 pièces)");
  });

  await etape("les teintes du vernis : des pastilles, choisies au clavier", async () => {
    await page.goto(B + "/produit/vernis-a-ongles", { waitUntil: "networkidle" });
    verifie((await page.locator(".valeur-couleur").count()) === 4, "quatre teintes, quatre pastilles");
    // Depuis le titre : la note des avis d'abord (le vernis en a un), puis les teintes.
    await clic(page, page.locator("main h1"));
    const actif = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim().replace(/\s+/g, " ") || "");
    const avant = [];
    for (let i = 0; i < 6 && !avant.includes("Grenat"); i++) {
      await page.keyboard.press("Tab");
      avant.push(await actif());
    }
    const parcourues = ["Grenat"];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Tab");
      parcourues.push(await actif());
    }
    verifie(avant.length <= 3 && parcourues.join(" → ") === "Grenat → Rose poudré → Nude → Corail",
      `Tab depuis le titre : ${[...avant.slice(0, -1), ...parcourues].join(" → ")}`);
    await page.keyboard.press("Enter");
    verifie((await page.locator(".fiche-achat .axe legend .choisi").innerText()) === "Corail", "Entrée : « Corail » choisi");
    verifie((await page.locator(".fiche-achat").innerText()).includes("Plus que 2"), "et son stock bas est dit : « Plus que 2 »");
    await capture(page, "beaute-vernis-clavier");
  });
  await ctx.close();

  const tel = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
  const p = await tel.newPage();
  t.espion(p, "beaute-telephone");
  await etape("Yasmine Beauté au téléphone : l'ouverture cadrée pour l'écran, le menu, les parfums", async () => {
    await p.goto(B + "/", { waitUntil: "networkidle" });
    const ouverture = await p.locator("main img").first().evaluate((i) => i.currentSrc.split("/").pop());
    verifie(ouverture.startsWith("hero-portrait"), `l'ouverture prend sa photo en hauteur (${ouverture})`);
    verifie(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "rien ne déborde en largeur");
    await p.getByRole("button", { name: /menu/i }).first().tap();
    await p.getByRole("dialog").getByRole("link", { name: "Parfums" }).tap();
    await p.waitForURL(/\/categorie\/parfums/);
    const fiches = await p.locator("main a[href^='/produit/']").evaluateAll((l) => new Set(l.map((a) => a.getAttribute("href"))).size);
    verifie(fiches === 3, `le rayon Parfums : ${fiches} fiches`);
    await capture(p, "beaute-telephone-parfums");
  });
  await tel.close();
}

// ---------------------------------------------------------------------------
// Dar Alia (supabase/seed-maison.sql) : la boutique de démonstration du
// métier maison et décoration — cinq rayons, des formats qui font le prix,
// un format épuisé, des couleurs en pastilles.
// ---------------------------------------------------------------------------
if (section("maison")) {
  const A = t.adresse("maison.localhost");
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  t.espion(page, "maison");

  await etape("Dar Alia : l'accueil en Bento, une mosaïque de tuiles", async () => {
    await page.goto(A + "/", { waitUntil: "networkidle" });
    verifie((await page.evaluate(() => document.documentElement.dataset.structure)) === "bento", "la structure Bento, sur les composants éditoriaux");
    verifie((await page.locator("main h1").innerText()).replace(/\s+/g, " ") === "Des objets qui durent.", "l'ouverture : « Des objets qui durent. »");
    const titres = (await page.locator("main h2").allInnerTexts()).map((h) => h.replace(/\s+/g, " ").trim());
    verifie(["Les rayons", "Nos essentiels", "Le temps de bien faire.", "Lumière et laine", "Ce qu'en disent nos clients"].every((x) => titres.includes(x)),
      `ses sections : ${titres.join(" · ")}`);
    // La première rangée : l'ouverture, et à côté la pièce à la une, le paiement à la livraison, la note réelle des clients.
    const cotes = await page.locator(".bn-cotes > *").evaluateAll((l) => l.map((e) => e.className.replace(/bn-tuile\s*/, "").trim()));
    verifie(JSON.stringify(cotes) === JSON.stringify(["bn-piece", "bn-fait", "bn-note"]), `à côté de l'ouverture : ${cotes.join(", ")}`);
    verifie((await page.locator(".bn-note").innerText()).includes("4,8") && (await page.locator(".bn-note").innerText()).includes("8 avis vérifiés"),
      "la note : celle des huit avis publiés (4,8), pas un chiffre écrit à la main");
    const pilule = await page.locator(".ed-entete").evaluate((e) => [getComputedStyle(e).position, parseFloat(getComputedStyle(e).borderTopLeftRadius)]);
    verifie(pilule[0] === "sticky" && pilule[1] > 20, `l'en-tête flotte, en pilule (${pilule.join(", ")})`);
    // Mesuré à l'écran : la première tuile a la hauteur de deux autres (et de l'écart entre elles).
    const grille = await page.locator(".bn-rayons").evaluate((u) => [u.children.length,
      Math.round(u.children[0].getBoundingClientRect().height), Math.round(u.children[1].getBoundingClientRect().height)]);
    verifie(grille[0] === 5 && grille[1] > grille[2] * 1.9, `cinq rayons, le premier sur deux rangées (${grille[0]} tuiles, ${grille[1]} px contre ${grille[2]} px)`);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); }
      scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle");
    const cassees = await page.evaluate(() => [...document.querySelectorAll("main img")].filter((i) => i.complete && i.naturalWidth === 0).length);
    verifie(cassees === 0, "toutes ses photos s'affichent");
    await capture(page, "maison-accueil");
  });

  await etape("le kilim : le format fait le prix, le grand est épuisé", async () => {
    await page.goto(A + "/produit/kilim-tisse-main", { waitUntil: "networkidle" });
    const grand = page.locator(".fiche-achat button.valeur", { hasText: "160 × 230" });
    verifie(await grand.isDisabled(), "160 × 230 cm : épuisé, le bouton est désactivé (la boutique n'a pas « Prévenez-moi »)");
    await clic(page, page.locator(".fiche-achat button.valeur", { hasText: "120 × 180" }));
    const panneau = (await page.locator(".ed-fiche-panneau").innerText()).replace(/\s+/g, " ");
    verifie(panneau.includes("349,000") && panneau.includes("Plus que 2"), "120 × 180 cm : 349,000 TND, « Plus que 2 »");
    await capture(page, "maison-kilim");
  });

  await etape("les serviettes en lin : la couleur au clavier, puis l'ajout", async () => {
    await page.goto(A + "/produit/serviettes-table-lin", { waitUntil: "networkidle" });
    await clic(page, page.locator("main h1"));
    const vus = [];
    for (let i = 0; i < 5 && !vus.includes("Écru"); i++) {
      await page.keyboard.press("Tab");
      vus.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim().replace(/\s+/g, " ") || ""));
    }
    verifie(vus.at(-1) === "Écru" && vus.at(-2) === "Sable", `Tab depuis le titre : ${vus.join(" → ")}`);
    await page.keyboard.press("Enter");
    verifie((await page.locator(".fiche-achat .axe legend .choisi").innerText()) === "Écru", "Entrée : « Écru » choisi");
    for (let i = 0; i < 8 && !(await page.evaluate(() => document.activeElement?.classList.contains("btn-ajout"))); i++) await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.locator(".confirmation-ajout").waitFor({ timeout: 4000 });
    verifie((await page.locator(".confirmation-ajout").innerText()).includes("Écru"), "au clavier jusqu'à « Ajouter au panier » : ajoutées, en Écru");
  });
  await ctx.close();

  const tel = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
  const p = await tel.newPage();
  t.espion(p, "maison-telephone");
  await etape("Dar Alia au téléphone : l'ouverture en hauteur, le menu, les luminaires", async () => {
    await p.goto(A + "/", { waitUntil: "networkidle" });
    const ouverture = await p.locator(".bn-une img").first().evaluate((i) => i.currentSrc.split("/").pop());
    verifie(ouverture.startsWith("hero-portrait"), `l'ouverture prend sa photo en hauteur (${ouverture})`);
    verifie(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "rien ne déborde en largeur");
    await p.getByRole("button", { name: /menu/i }).first().tap();
    await p.getByRole("dialog").getByRole("link", { name: "Luminaires" }).tap();
    await p.waitForURL(/\/categorie\/luminaires/);
    const fiches = await p.locator("main a[href^='/produit/']").evaluateAll((l) => new Set(l.map((a) => a.getAttribute("href"))).size);
    verifie(fiches === 3, `le rayon Luminaires : ${fiches} fiches`);
    await capture(p, "maison-telephone-luminaires");
  });
  await tel.close();
}

await navigateur.close();
process.exit(t.bilan());
