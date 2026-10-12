// Atelier Ocre, tel quel : l'ouverture à plusieurs largeurs, et ce que mesure le navigateur.
const { chromium } = await import(new URL("../../../application/node_modules/playwright-core/index.mjs", import.meta.url).href);
const S = process.env.ESSAIS ?? "/tmp/skanecom-essais";
(await import("node:fs")).mkdirSync(`${S}/studio-captures`, { recursive: true });
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--host-resolver-rules=MAP *.localhost 127.0.0.1"] });
const nom = process.argv[2] ?? "avant";
for (const [w, h, dpr] of [[1470, 956, 2], [1280, 800, 1], [1000, 700, 2], [390, 844, 3]]) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 500, hasTouch: w < 500, locale: "fr-FR" });
  const p = await ctx.newPage();
  await p.goto("http://studio.localhost:4200/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  const m = await p.evaluate(() => {
    const t = document.querySelector(".st-ouverture-titre");
    const cs = getComputedStyle(t);
    const img = document.querySelector(".st-ouverture-media");
    return { taille: cs.fontSize, interlettre: cs.letterSpacing, interligne: cs.lineHeight, police: cs.fontFamily.slice(0, 40),
      chargee: document.fonts.check(`16px ${cs.fontFamily.split(",")[0]}`), hauteurTitre: Math.round(t.getBoundingClientRect().height),
      imageY: img ? Math.round(img.getBoundingClientRect().top) : null, hauteurFenetre: innerHeight };
  });
  console.log(`${w}×${h}`, JSON.stringify(m));
  await p.screenshot({ path: `${S}/studio-captures/${nom}-${w}.png` });
  await ctx.close();
}
await nav.close();
