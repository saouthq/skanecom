import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { responseStoreServiceBinding } from "./cloudflare.config";
import { responseStoreAdapter } from "@vinext/cloudflare/cache/response-store-adapter";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";

/* La version construite (src/lib/version.ts, État technique → Version en ligne) :
   le commit et son titre (la CI les donne, sinon git), l'heure, et la dernière
   migration que ce code attend de la base. */
function versionConstruite() {
  const git = (commande: string) => {
    try { return execSync(`git ${commande}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; }
  };
  let migrations: string[] = [];
  try { migrations = readdirSync(new URL("../supabase/migrations", import.meta.url)).filter((f) => f.endsWith(".sql")).sort(); } catch { /* hors du dépôt */ }
  return {
    version: (process.env.SKANECOM_VERSION || git("rev-parse --short=7 HEAD") || "locale").slice(0, 64),
    titre: (process.env.SKANECOM_TITRE || git("log -1 --format=%s")).slice(0, 300),
    construite_le: process.env.SKANECOM_CONSTRUITE_LE || new Date().toISOString(),
    migration: migrations.at(-1)?.split("_")[0] ?? null,
  };
}

export default defineConfig({
  define: { __SKANECOM_VERSION__: JSON.stringify(versionConstruite()) },
  // En local seulement : autorise les faux domaines du test de séparation du
  // cache (scripts/test-domaines.sh). Sans effet sur le Worker déployé.
  preview: { allowedHosts: [".localhost"] },
  plugins: [
    vinext({
      cache: responseStoreAdapter(),
      images: { optimizer: imagesOptimizer() },
    }),
    cloudflare({
      auxiliaryWorkers: [{ config: responseStoreServiceBinding }],
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
