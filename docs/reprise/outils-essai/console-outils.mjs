// Les aperçus (modèles, e-mails) : vides à la capture pleine page, ou vraiment vides ?
import { execFileSync } from "node:child_process";
const { chromium } = await import(new URL("../../../application/node_modules/playwright-core/index.mjs", import.meta.url).href);
export const S = process.env.ESSAIS ?? "/tmp/skanecom-essais";
export const OUTILS = new URL(".", import.meta.url).pathname;
export const C = "http://console.localhost:4200";
const RELAIS = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--host-resolver-rules=MAP *.localhost 127.0.0.1", "--lang=fr-FR"] });
export async function connecte(p, email = "admin@skanecom.test", mdp = "console-locale-skanecom") {
  const A = `${RELAIS}/auth/v1`;
  const H = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
  const u = (await (await fetch(`${A}/admin/users?per_page=1000`, { headers: H })).json()).users.find((x) => x.email === email);
  for (const f of (await (await fetch(`${A}/admin/users/${u.id}/factors`, { headers: H })).json()) ?? []) await fetch(`${A}/admin/users/${u.id}/factors/${f.id}`, { method: "DELETE", headers: H });
  await p.goto(C + "/connexion", { waitUntil: "networkidle" });
  await p.fill("#email", email); await p.fill("#mot_de_passe", mdp);
  await p.keyboard.press("Enter"); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
  const secret = await p.locator("[data-secret-totp]").textContent({ timeout: 3000 }).catch(() => null);
  if (secret) { await p.fill("#code", execFileSync("python3", [`${OUTILS}totp.py`, secret.trim()]).toString().trim()); await p.keyboard.press("Enter"); await p.waitForLoadState("networkidle"); }
}
