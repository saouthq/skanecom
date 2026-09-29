import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

/* ============================================================================
   PARCOURS HUMAIN DE LA VITRINE — un testeur qui bouge la souris, clique,
   tape au clavier avec des pauses, passe au téléphone, et regarde l'écran.

   Il complète outils/essai-vitrine.sh (qui vérifie les RÉPONSES du serveur) :
   ici on vérifie ce qu'une personne vit — le focus au clavier, la page qui ne
   saute pas, la feuille de filtres qui reste ouverte, le tiroir du panier qui
   garde le focus, l'en-tête présent partout. Chaque étape laisse une capture.

     cd application && bun run parcours            # vitrine sur 127.0.0.1:4200
     CAPTURES=dossier CHROMIUM=/chemin/chrome bun run parcours

   Jeu de démo requis (supabase/seed.sql). Code de sortie 1 au premier défaut
   constaté, après avoir tout parcouru.
   ========================================================================== */

const PORT = process.env.PORT_VITRINE ?? "4200";
const DOSSIER = process.env.CAPTURES ?? "../.outils/captures";
// Sans CHROMIUM : celui du poste s'il existe, sinon celui que
// `bunx playwright-core install chromium` a posé (CI).
const CHROMIUM = process.env.CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const M = `http://maymar.localhost:${PORT}`;
const Q = `http://quincaillerie.localhost:${PORT}`;
mkdirSync(DOSSIER, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const notes = [];
const note = (etat, texte) => { notes.push(`${etat}  ${texte}`); console.log(`${etat}  ${texte}`); };
const verifie = (cond, texte) => note(cond ? "OK    " : "DÉFAUT", texte);

async function capture(page, nom, pleine = false) {
  n += 1;
  const fichier = `${DOSSIER}/${String(n).padStart(2, "0")}-${nom}.png`;
  await page.screenshot({ path: fichier, fullPage: pleine });
  return fichier;
}

/* Clic « humain » : la souris va jusqu'à l'élément, s'arrête, clique. */
async function clic(page, loc) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (!b) throw new Error("élément invisible");
  await page.mouse.move(b.x + b.width / 2 + (Math.random() * 4 - 2), b.y + b.height / 2 + (Math.random() * 4 - 2), { steps: 12 });
  await pause(250);
  await loc.click();
  await pause(150);
}

async function tape(page, texte) {
  for (const c of texte) { await page.keyboard.type(c); await pause(60 + Math.random() * 80); }
}

function espion(page, nom) {
  page.on("console", (m) => { if (m.type() === "error" && !(m.text().includes("404") && page.url().includes("/produit/perceuse"))) note("DÉFAUT", `${nom} console : ${m.text().slice(0, 160)} (${page.url()})`); });
  page.on("pageerror", (e) => note("DÉFAUT", `${nom} erreur JS : ${String(e).slice(0, 160)}`));
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("/produit/perceuse")) note("DÉFAUT", `${nom} HTTP ${r.status()} ${r.url()}`); });
}

async function etape(nom, fn) {
  try { await fn(); } catch (e) { note("DÉFAUT", `${nom} : ${String(e.message ?? e).split("\n")[0].slice(0, 200)}`); }
}

// *.localhost → 127.0.0.1 : la vitrine n'écoute qu'en IPv4.
const navigateur = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--host-resolver-rules=MAP *.localhost 127.0.0.1"],
});

/* ------------------------------------------------------------------ */
console.log("\n== 1. Maymar, à la souris, sur ordinateur ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 1366, height: 850 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  espion(page, "maymar-souris");

  await etape("accueil", async () => {
    await page.goto(M + "/", { waitUntil: "networkidle" });
    await capture(page, "maymar-accueil");
    await capture(page, "maymar-accueil-complete", true);
    verifie((await page.title()).includes("Maymar"), `titre de l'onglet : « ${await page.title()} »`);
  });

  await etape("menu vers le catalogue", async () => {
    const lien = page.getByRole("navigation", { name: /principale/i }).getByRole("link", { name: /catalogue/i });
    await lien.hover(); await pause(300);
    await capture(page, "maymar-survol-menu");
    await clic(page, lien);
    await page.waitForURL(/\/catalogue$/);
    await page.waitForLoadState("networkidle");
    await capture(page, "maymar-catalogue");
    verifie(true, `catalogue ouvert : ${await page.locator(".compte").innerText()}`);
  });

  await etape("filtre couleur Bordeaux", async () => {
    const pastille = page.locator("aside label[title^='Bordeaux']");
    await page.mouse.wheel(0, 250); await pause(400);
    const avant = await page.evaluate(() => window.scrollY);
    await clic(page, pastille);
    await page.waitForURL(/couleur=Bordeaux/);
    await page.waitForLoadState("networkidle");
    await capture(page, "maymar-filtre-bordeaux");
    verifie(page.url().endsWith("/catalogue/couleur=Bordeaux"), `adresse : ${page.url()}`);
    const apres = await page.evaluate(() => window.scrollY);
    verifie(Math.abs(apres - avant) < 40, `la page ne remonte pas en haut (défilement ${avant} → ${apres})`);
    verifie(await page.locator(".puce", { hasText: "Bordeaux" }).count() === 1, "la puce « Bordeaux » apparaît");
  });

  await etape("filtre taille Cabine", async () => {
    await clic(page, page.locator("aside label.opt", { hasText: "Cabine 55 cm" }));
    await page.waitForURL(/taille=/);
    await page.waitForLoadState("networkidle");
    await capture(page, "maymar-filtre-bordeaux-cabine");
    verifie(/couleur=Bordeaux\/taille=Cabine%2055%20cm$/.test(page.url()), `les deux filtres gardés : ${page.url()}`);
  });

  await etape("tri prix croissant", async () => {
    const tri = page.locator("select#tri");
    await clic(page, tri);
    await tri.selectOption("prix-asc");
    await page.waitForURL(/tri=prix-asc/);
    await page.waitForLoadState("networkidle");
    verifie(page.url().includes("couleur=Bordeaux") && page.url().includes("taille="), `trier ne défait pas les filtres : ${page.url()}`);
    verifie(await tri.inputValue() === "prix-asc", "le menu de tri affiche « prix croissant »");
  });

  await etape("retirer la puce Bordeaux", async () => {
    await clic(page, page.locator(".puce", { hasText: "Bordeaux" }));
    await page.waitForURL((u) => !u.href.includes("Bordeaux"));
    await page.waitForLoadState("networkidle");
    verifie(page.url().includes("taille=") && page.url().includes("tri=prix-asc"), `seul Bordeaux est retiré : ${page.url()}`);
  });

  await etape("prix minimum au clavier + Appliquer", async () => {
    const min = page.locator("aside input[name=min]");
    await clic(page, min);
    await tape(page, "200");
    await clic(page, page.locator("aside button[type=submit]"));
    await page.waitForURL(/prix=200-/);
    await page.waitForLoadState("networkidle");
    await capture(page, "maymar-prix-min-200");
    verifie(true, `prix appliqué : ${page.url()} — ${await page.locator(".compte").innerText()}`);
  });

  await etape("liste vide : la page ne se décale pas", async () => {
    const x = await page.evaluate(() => [document.querySelector("header .enveloppe").getBoundingClientRect().left, document.querySelector("main").getBoundingClientRect().left]);
    verifie(Math.abs(x[0] - x[1]) < 2, `bord gauche en-tête ${Math.round(x[0])} px / contenu ${Math.round(x[1])} px`);
  });

  await etape("retour arrière", async () => {
    await page.goBack();
    await page.waitForURL((u) => !u.href.includes("prix="));
    await pause(500);
    const coche = await page.locator("aside label.opt", { hasText: "Cabine 55 cm" }).locator("input").isChecked();
    const min = await page.locator("aside input[name=min]").inputValue();
    verifie(coche && min === "", `après « précédent » (${page.url().replace(M, "")}) : Cabine cochée ${coche}, prix min « ${min} »`);
    await page.goForward();
    await page.waitForURL(/prix=200-/);
  });

  await etape("tout effacer", async () => {
    await clic(page, page.locator("aside").getByRole("link", { name: /effacer/i }));
    await page.waitForURL(/\/catalogue$/);
    verifie(true, "« Tout effacer » ramène au catalogue nu");
  });

  await etape("ouvrir une fiche depuis la grille", async () => {
    const carte = page.locator(".grille-produits a").filter({ hasText: /rigide ABS/i }).first();
    await carte.hover(); await pause(400);
    await capture(page, "maymar-survol-carte");
    await clic(page, carte);
    await page.waitForURL(/\/produit\//);
    await page.waitForLoadState("networkidle");
    await capture(page, "maymar-fiche");
  });

  await etape("choisir Bordeaux + Grande (épuisée)", async () => {
    await clic(page, page.getByRole("button", { name: /^Bordeaux/ }));
    await clic(page, page.getByRole("button", { name: /^Grande 75 cm/ }));
    await pause(300);
    await capture(page, "maymar-fiche-bordeaux-grande-epuisee");
    const bouton = page.getByRole("button", { name: /ajouter au panier/i });
    verifie(await bouton.isDisabled(), "Bordeaux en 75 cm (stock 0) : bouton « Ajouter » inactif");
  });

  await etape("Cabine ×3 au panier", async () => {
    await clic(page, page.getByRole("button", { name: /^Cabine 55 cm/ }));
    const plus = page.locator(".achat").getByRole("button", { name: /ajouter un article/i });
    await clic(page, plus); await clic(page, plus);
    verifie((await page.locator(".achat .qte span").innerText()) === "3", "la quantité monte à 3");
    await clic(page, page.locator(".achat").getByRole("button", { name: /ajouter au panier/i }));
    await pause(400);
    await capture(page, "maymar-ajoute-au-panier");
    const pastille = page.locator("header button[aria-expanded] span");
    verifie((await pastille.innerText().catch(() => "")) === "3", `pastille du panier : « ${await pastille.innerText().catch(() => "rien")} »`);
  });

  await etape("tiroir du panier", async () => {
    await clic(page, page.locator("header button[aria-expanded]"));
    await pause(400);
    await capture(page, "maymar-tiroir-panier");
    const dlg = page.getByRole("dialog");
    await clic(page, dlg.getByRole("button", { name: /ajouter un article/i }));
    verifie((await dlg.locator(".qte span").innerText()) === "4", "« + » dans le tiroir : 4");
    await page.keyboard.press("Escape");
    await pause(200);
    verifie(await page.getByRole("dialog").count() === 0, "Échap ferme le tiroir");
  });

  await etape("le panier survit au rechargement", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await pause(300);
    verifie((await page.locator("header button[aria-expanded] span").innerText().catch(() => "")) === "4", "après rechargement, 4 articles");
  });

  await etape("recherche « cabine »", async () => {
    await clic(page, page.locator("header").getByRole("link", { name: /rechercher/i }));
    await page.waitForURL(/\/recherche/);
    await clic(page, page.locator("input#q"));
    await tape(page, "cabine");
    await page.keyboard.press("Enter");
    await page.waitForURL(/q=cabine/);
    await page.waitForLoadState("networkidle");
    await capture(page, "maymar-recherche-cabine");
    verifie(await page.locator(".grille-produits > *").count() > 0, `résultats : ${await page.locator("header p").last().innerText()}`);
  });

  await etape("recherche avec faute « valsie »", async () => {
    await page.locator("input#q").fill("");
    await clic(page, page.locator("input#q"));
    await tape(page, "valsie");
    await page.keyboard.press("Enter");
    await page.waitForURL(/q=valsie/);
    await page.waitForLoadState("networkidle");
    await capture(page, "maymar-recherche-faute");
    note("INFO  ", `faute de frappe : ${await page.locator("header p").last().innerText()}`);
  });

  await etape("recherche de la perceuse (autre boutique)", async () => {
    await page.goto(M + "/recherche?q=perceuse", { waitUntil: "networkidle" });
    verifie(await page.locator(".grille-produits > *").count() === 0, "la perceuse de la quincaillerie n'apparaît pas chez Maymar");
  });

  await etape("page introuvable", async () => {
    await page.goto(M + "/produit/perceuse-visseuse-18v", { waitUntil: "networkidle" });
    await capture(page, "maymar-404");
    verifie(await page.locator("header .marque").count() === 1 && await page.locator("footer").count() === 1, "la page introuvable garde l'en-tête et le pied de Maymar");
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
    if (!e || e === document.body) return { nom: "(rien)", visible: false };
    const s = getComputedStyle(e);
    const visible = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
    const nom = (e.getAttribute("aria-label") || e.innerText || e.getAttribute("name") || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
    return { nom: `${e.tagName.toLowerCase()} « ${nom} »`, visible };
  });

  await etape("tabulations sur l'accueil", async () => {
    await page.goto(M + "/", { waitUntil: "networkidle" });
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

  await etape("aller au catalogue au clavier", async () => {
    await page.goto(M + "/", { waitUntil: "networkidle" });
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      if ((await focus()).nom.toLowerCase().includes("catalogue")) break;
    }
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/catalogue/);
    await page.waitForLoadState("networkidle");
    verifie(true, "Entrée sur « Tout le catalogue » ouvre le catalogue");
  });

  await etape("cocher un filtre à la barre d'espace", async () => {
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const f = await focus();
      if (f.nom.includes("taille") || (await page.evaluate(() => document.activeElement?.closest("label")?.innerText ?? "")).includes("Moyenne")) break;
    }
    await capture(page, "clavier-focus-filtre");
    await page.keyboard.press("Space");
    await page.waitForURL(/taille=/, { timeout: 5000 });
    await page.waitForLoadState("networkidle");
    verifie(true, `Espace coche et filtre : ${page.url()}`);
    await pause(300);
    const f = await focus();
    verifie(f.nom.includes("a.taille") || f.nom.includes("Cabine"), `après le filtre, le focus reste sur : ${f.nom}`);
    await capture(page, "clavier-focus-garde-apres-filtre");
    await page.keyboard.press("Space");
    await page.waitForURL((u) => !u.href.includes("taille="), { timeout: 5000 });
    await pause(300);
    verifie((await focus()).nom.includes("a.taille"), "Espace à nouveau : le filtre est retiré, le focus reste");
  });

  await etape("fiche, déclinaison et panier au clavier", async () => {
    await page.goto(M + "/produit/valise-souple-extensible", { waitUntil: "networkidle" });
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      if ((await focus()).nom.startsWith("button « Gris")) break;
    }
    await page.keyboard.press("Enter");
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      if ((await focus()).nom.includes("Ajouter au panier")) break;
    }
    await capture(page, "clavier-focus-ajouter");
    await page.keyboard.press("Enter");
    await pause(300);
    verifie((await page.locator("header button[aria-expanded] span").innerText().catch(() => "")) === "1", "Entrée sur « Ajouter » : 1 article");
  });

  await etape("tiroir du panier au clavier", async () => {
    await page.locator("header button[aria-expanded]").focus();
    await page.keyboard.press("Enter");
    await pause(300);
    const f1 = await focus();
    verifie(f1.nom.includes("Fermer"), `à l'ouverture, le focus va sur : ${f1.nom}`);
    const sorties = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const dedans = await page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")));
      if (!dedans) sorties.push((await focus()).nom);
    }
    verifie(sorties.length === 0, sorties.length ? `Tab sort du tiroir vers la page derrière : ${sorties[0]}` : "Tab reste dans le tiroir");
    await capture(page, "clavier-tiroir");
    await page.keyboard.press("Escape");
    await pause(200);
    const f2 = await focus();
    verifie(f2.nom.toLowerCase().includes("panier"), `après Échap, le focus revient sur : ${f2.nom}`);
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 3. Maymar sur téléphone (tactile) ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
  const page = await ctx.newPage();
  espion(page, "maymar-mobile");
  await etape("accueil mobile", async () => {
    await page.goto(M + "/", { waitUntil: "networkidle" });
    await capture(page, "mobile-maymar-accueil");
    await capture(page, "mobile-maymar-accueil-complete", true);
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    verifie(!deborde, "pas de défilement horizontal");
    const nav = page.getByRole("navigation", { name: /principale/i });
    verifie(await nav.isVisible(), "les rayons sont visibles dans l'en-tête du téléphone");
    await nav.getByRole("link", { name: "Valises" }).tap();
    await page.waitForURL(/\/categorie\/valises/);
    await page.waitForLoadState("networkidle");
    await capture(page, "mobile-rayon-valises");
    verifie(await nav.getByRole("link", { name: "Valises" }).getAttribute("aria-current") === "page", "le rayon ouvert est marqué dans le menu");
  });
  await etape("feuille de filtres mobile", async () => {
    await page.goto(M + "/catalogue", { waitUntil: "networkidle" });
    await page.locator("details.filtres-mobile summary").tap();
    await pause(400);
    await capture(page, "mobile-filtres-ouverts");
    await page.locator("details.filtres-mobile label[title^='Noir']").tap();
    await page.waitForURL(/couleur=Noir/);
    await page.waitForLoadState("networkidle");
    await pause(400);
    await capture(page, "mobile-filtre-noir");
    const ouverte = await page.locator("details.filtres-mobile").evaluate((d) => d.open);
    verifie(ouverte, "la feuille de filtres reste ouverte pour cocher la suivante");
    if (ouverte) {
      await page.locator("details.filtres-mobile label.opt", { hasText: "Cabine 55 cm" }).tap();
      await page.waitForURL(/taille=/);
      await pause(400);
      verifie(/couleur=Noir\/taille=Cabine/.test(page.url()), `deux filtres au doigt : ${page.url().replace(M, "")}`);
      await page.locator("details.filtres-mobile summary").tap();
      await pause(300);
      await capture(page, "mobile-deux-filtres-feuille-fermee");
    }
  });
  await etape("fiche mobile et barre collante", async () => {
    await page.goto(M + "/produit/valise-rigide-abs-4-roues", { waitUntil: "networkidle" });
    await capture(page, "mobile-fiche");
    await page.mouse.wheel(0, 1400); await pause(700);
    await page.evaluate(() => window.scrollBy(0, 1400)); await pause(700);
    await capture(page, "mobile-fiche-barre-collante");
    verifie(await page.locator(".achat-mobile").isVisible(), "la barre d'achat collante apparaît quand le bloc d'achat sort de l'écran");
    await page.locator(".achat-mobile button").tap();
    await pause(400);
    verifie((await page.locator("header button[aria-expanded] span").innerText().catch(() => "")) === "1", "« Ajouter » de la barre collante : 1 article au panier");
  });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
console.log("\n== 4. Quincaillerie, à la souris ==");
{
  const ctx = await navigateur.newContext({ viewport: { width: 1366, height: 850 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  espion(page, "quinca");
  await etape("accueil", async () => {
    await page.goto(Q + "/", { waitUntil: "networkidle" });
    await capture(page, "quinca-accueil");
    await capture(page, "quinca-accueil-complete", true);
  });
  await etape("rayon depuis le menu", async () => {
    const liens = page.getByRole("navigation", { name: /principale/i }).getByRole("link");
    note("INFO  ", `rayons du menu : ${(await liens.allInnerTexts()).join(", ")}`);
    await clic(page, liens.first());
    await page.waitForURL(/\/categorie\//);
    await page.waitForLoadState("networkidle");
    await capture(page, "quinca-rayon");
  });
  await etape("filtre dimension 4 × 40 mm", async () => {
    await page.goto(Q + "/catalogue", { waitUntil: "networkidle" });
    const opt = page.locator("aside label.opt", { hasText: "4 × 40 mm" });
    if (await opt.count() === 0) { note("INFO  ", "pas de filtre dimension au catalogue (moins de 2 valeurs ?)"); return; }
    await clic(page, opt);
    await page.waitForURL(/dimension=/);
    await page.waitForLoadState("networkidle");
    await capture(page, "quinca-filtre-dimension");
    verifie(true, `${page.url()} — ${await page.locator(".compte").innerText()}`);
  });
  await etape("fiche perceuse, kit, panier", async () => {
    await page.goto(Q + "/catalogue", { waitUntil: "networkidle" });
    await clic(page, page.locator(".grille-produits a").filter({ hasText: /perceuse/i }).first());
    await page.waitForURL(/\/produit\//);
    await page.waitForLoadState("networkidle");
    await clic(page, page.getByRole("button", { name: /^Kit 2 batteries/ }));
    await capture(page, "quinca-fiche-kit");
    await clic(page, page.getByRole("button", { name: /ajouter au panier/i }));
    await pause(300);
    await clic(page, page.locator("header button[aria-expanded]"));
    await pause(300);
    await capture(page, "quinca-tiroir-panier");
    const lignes = await page.getByRole("dialog").locator("li").allInnerTexts();
    verifie(lignes.length === 1 && !lignes[0].includes("Valise"), `panier de la quincaillerie : ${lignes.map((l) => l.split("\n")[0]).join(" / ")}`);
  });
  await ctx.close();
}

await navigateur.close();
const defauts = notes.filter((l) => l.startsWith("DÉFAUT"));
console.log(`\n${notes.length} observations, ${defauts.length} défaut(s). Captures : ${DOSSIER}`);
process.exit(defauts.length > 0 ? 1 : 0);
