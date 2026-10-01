// LE MODE TÉLÉPHONE DU PASSAGE HUMAIN (outils/humain/ecran.sh, lancé avec
// CDP=1) — ce qu'un testeur règle à la main dans les outils de développement :
// chaque onglet de la fenêtre devient un téléphone de 390 × 844, écran tactile
// (la souris donne des touchers). Reste branché : les réglages tombent quand
// il se débranche.   node essais/telephone.mjs
import { chromium } from "playwright-core";

const navigateur = await chromium.connectOverCDP("http://127.0.0.1:9222");
const faits = new WeakSet();
async function telephone(p) {
  if (faits.has(p)) return;
  faits.add(p);
  const s = await p.context().newCDPSession(p);
  await s.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await s.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await s.send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
  await s.send("Emulation.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  });
  await p.reload().catch(() => {});
}
for (const c of navigateur.contexts()) {
  for (const p of c.pages()) await telephone(p);
  c.on("page", telephone);
}
console.log("téléphone prêt : 390 × 844, tactile");
setInterval(() => {}, 1 << 30);
