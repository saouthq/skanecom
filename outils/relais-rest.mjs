// Relais de développement : expose PostgREST sous /rest/v1, comme l'API de
// Supabase, pour que le client @supabase/supabase-js de l'application parle à
// la base locale sans aucune différence de configuration.
//   http://127.0.0.1:54321/rest/v1/produits  →  http://127.0.0.1:54330/produits
// Il sert aussi les fichiers de démonstration (supabase/fichiers-demo), rangés
// comme sur R2 :
//   http://127.0.0.1:54321/fichiers/maymar/marque/logo.svg
// Lancé par outils/api-locale.sh. Jamais en production.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.RELAIS_PORT ?? 54321);
const CIBLE = Number(process.env.POSTGREST_PORT ?? 54330);
const FICHIERS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../supabase/fichiers-demo");
const TYPES = { ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

async function sertFichier(url, res) {
  const chemin = path.resolve(FICHIERS, decodeURIComponent(url.slice("/fichiers/".length).split("?")[0]));
  if (!chemin.startsWith(FICHIERS + path.sep)) return res.writeHead(403).end();
  try {
    const contenu = await readFile(chemin);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(chemin)] ?? "application/octet-stream",
      "cache-control": "public, max-age=300",
    });
    res.end(contenu);
  } catch {
    res.writeHead(404).end();
  }
}

http
  .createServer((req, res) => {
    // L'application lit la vitrine côté serveur ; le CORS ouvert ne sert qu'aux
    // essais depuis un navigateur en local.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return res.writeHead(204).end();
    if (req.url.startsWith("/fichiers/")) return sertFichier(req.url, res);

    if (!req.url.startsWith("/rest/v1/") && req.url !== "/rest/v1") {
      return res.writeHead(404, { "content-type": "text/plain" }).end("Seul /rest/v1 est relayé.\n");
    }

    const amont = http.request(
      {
        host: "127.0.0.1",
        port: CIBLE,
        method: req.method,
        path: req.url.slice("/rest/v1".length) || "/",
        headers: { ...req.headers, host: `127.0.0.1:${CIBLE}` },
      },
      (reponse) => {
        res.writeHead(reponse.statusCode ?? 502, reponse.headers);
        reponse.pipe(res);
      },
    );
    amont.on("error", (e) => {
      res.writeHead(502, { "content-type": "text/plain" }).end(`PostgREST injoignable : ${e.message}\n`);
    });
    req.pipe(amont);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`relais /rest/v1 sur http://127.0.0.1:${PORT}`));
