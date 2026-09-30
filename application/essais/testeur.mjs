import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

/* ============================================================================
   LE TESTEUR — ce que partagent les parcours humains (vitrine, console) :
   une souris qui se déplace avant de cliquer, un clavier qui tape avec des
   pauses, une capture par étape, et un carnet où chaque observation est
   notée « OK » ou « DÉFAUT ».

     const t = creeTesteur();                 // CAPTURES, CHROMIUM, PORT_VITRINE
     const navigateur = await t.navigateur();
     await t.etape("nom", async () => { … t.verifie(condition, "texte") … });
     t.bilan();                               // code de sortie 1 s'il y a un défaut
   ========================================================================== */

export function creeTesteur() {
  const port = process.env.PORT_VITRINE ?? "4200";
  const dossier = process.env.CAPTURES ?? "../.outils/captures";
  // Sans CHROMIUM : celui du poste s'il existe, sinon celui que
  // `bunx playwright-core install chromium` a posé (CI).
  const chromiumPoste = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
  const executable = process.env.CHROMIUM ?? chromiumPoste;
  mkdirSync(dossier, { recursive: true });

  const notes = [];
  let n = 0;
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const note = (etat, texte) => { notes.push(`${etat}  ${texte}`); console.log(`${etat}  ${texte}`); };
  const verifie = (cond, texte) => note(cond ? "OK    " : "DÉFAUT", texte);

  /* Clic « humain » : la souris va jusqu'à l'élément, s'arrête, clique. */
  const clic = async (page, loc) => {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (!b) throw new Error("élément invisible");
    await page.mouse.move(b.x + b.width / 2 + (Math.random() * 4 - 2), b.y + b.height / 2 + (Math.random() * 4 - 2), { steps: 12 });
    await pause(250);
    await loc.click();
    await pause(150);
  };

  /* Un formulaire envoyé (un clic, ou une touche : `geste`), puis la page
     qui a fini de répondre. Au backoffice et dans la console, le geste se
     fait en place (components/console/Retours.tsx : <html data-geste> le
     temps de l'envoi, sans rechargement) ; ailleurs, et vers une autre page,
     la page se recharge. L'adresse ne suffit pas à le savoir : elle porte
     souvent déjà « ?ok= » avant le geste. Le formulaire le dit : un envoi
     que la page a pris en main (defaultPrevented) se fait en place. */
  const envoie = async (page, geste) => {
    const recharge = page.waitForEvent("load", { timeout: 30_000 }).catch(() => {});
    await page.evaluate(() => {
      window.__envoi = "aucun";
      window.addEventListener("submit", (e) => { window.__envoi = e.defaultPrevented ? "en-place" : "ordinaire"; }, { once: true });
    });
    if (typeof geste === "function") await geste();
    else await clic(page, geste);
    const mode = await page.evaluate(() => window.__envoi).catch(() => "ordinaire"); // déjà partie : un rechargement
    if (mode === "en-place") {
      await page.waitForFunction(() => !document.documentElement.hasAttribute("data-geste"), null, { timeout: 30_000, polling: 50 })
        .catch(() => recharge); // vers une autre page : c'est son « load » qui dit la fin
    } else if (mode === "ordinaire") {
      await recharge;
    }
    await page.waitForLoadState("networkidle");
  };

  return {
    port,
    dossier,
    pause,
    note,
    verifie,
    adresse: (hote) => `http://${hote}:${port}`,

    // *.localhost → 127.0.0.1 : la vitrine n'écoute qu'en IPv4.
    navigateur: () => chromium.launch({
      executablePath: executable,
      args: ["--no-sandbox", "--host-resolver-rules=MAP *.localhost 127.0.0.1"],
    }),

    async capture(page, nom, pleine = false) {
      n += 1;
      const fichier = `${dossier}/${String(n).padStart(2, "0")}-${nom}.png`;
      // Une capture pleine page montre tout : les sections qui attendent
      // d'entrer à l'écran pour apparaître sont posées d'emblée.
      if (pleine) await page.evaluate(() => document.documentElement.classList.remove("js-apparitions")).catch(() => {});
      // Les entrées animées finissent avant la capture (les boucles, elles, tournent toujours).
      await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== "running" || x.effect?.getTiming().iterations === Infinity),
        null, { timeout: 3000 }).catch(() => {});
      await page.screenshot({ path: fichier, fullPage: pleine });
      return fichier;
    },

    clic,
    envoie,

    async tape(page, texte) {
      for (const c of texte) { await page.keyboard.type(c); await pause(60 + Math.random() * 80); }
    },

    /** Erreurs JS, messages d'erreur de la console du navigateur, réponses
     *  4xx/5xx — sauf celles que le parcours provoque exprès (`attendue`). */
    espion(page, nom, attendue = () => false) {
      page.on("console", (m) => { if (m.type() === "error" && !attendue(page.url(), m.text())) note("DÉFAUT", `${nom} console : ${m.text().slice(0, 160)} (${page.url()})`); });
      page.on("pageerror", (e) => note("DÉFAUT", `${nom} erreur JS : ${String(e).slice(0, 160)}`));
      page.on("response", (r) => { if (r.status() >= 400 && !attendue(r.url(), String(r.status()))) note("DÉFAUT", `${nom} HTTP ${r.status()} ${r.url()}`); });
    },

    async etape(nom, fn) {
      try { await fn(); } catch (e) { note("DÉFAUT", `${nom} : ${String(e.message ?? e).split("\n")[0].slice(0, 200)}`); }
    },

    bilan() {
      const defauts = notes.filter((l) => l.startsWith("DÉFAUT"));
      console.log(`\n${notes.length} observations, ${defauts.length} défaut(s). Captures : ${dossier}`);
      return defauts.length > 0 ? 1 : 0;
    },
  };
}
