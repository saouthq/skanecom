// Relais de développement : expose PostgREST sous /rest/v1 et GoTrue sous
// /auth/v1, comme l'API de Supabase, pour que le client @supabase/supabase-js
// de l'application parle à la base locale sans aucune différence de
// configuration.
//   http://127.0.0.1:54321/rest/v1/produits  →  http://127.0.0.1:54330/produits
//   http://127.0.0.1:54321/auth/v1/token     →  http://127.0.0.1:54340/token
// Il sert aussi les fichiers de démonstration (supabase/fichiers-demo), rangés
// comme sur R2 :
//   http://127.0.0.1:54321/fichiers/maymar/marque/logo.svg
// Et il tient lieu de fournisseur de SMS : GoTrue lui confie les codes de
// connexion (crochet « Send SMS »), il les note dans .outils/sms.log au lieu
// de les envoyer. Les essais relisent le dernier code d'un numéro :
//   http://127.0.0.1:54321/sms-dev/dernier?telephone=21620123456
// Lancé par outils/api-locale.sh. Jamais en production.
import http from "node:http";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.RELAIS_PORT ?? 54321);
const AMONTS = [
  { prefixe: "/rest/v1", port: Number(process.env.POSTGREST_PORT ?? 54330), nom: "PostgREST" },
  { prefixe: "/auth/v1", port: Number(process.env.GOTRUE_PORT ?? 54340), nom: "GoTrue" },
];
const FICHIERS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../supabase/fichiers-demo");
const TYPES = { ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

const JOURNAL_SMS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.outils/sms.log");
const SMS = new Map(); // numéro (chiffres seuls) → dernier code

const chiffres = (texte) => String(texte ?? "").replace(/\D/g, "");

/* Le crochet « Send SMS » de GoTrue : { user: { phone }, sms: { otp } }. */
function recoitSms(req, res) {
  let corps = "";
  req.on("data", (morceau) => (corps += morceau));
  req.on("end", async () => {
    try {
      const { user, sms } = JSON.parse(corps);
      const numero = chiffres(user?.phone);
      SMS.set(numero, String(sms?.otp ?? ""));
      await appendFile(JOURNAL_SMS, `${new Date().toISOString()}  +${numero}  code ${sms?.otp}\n`);
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    } catch {
      res.writeHead(400, { "content-type": "application/json" }).end('{"error":{"http_code":400,"message":"SMS illisible"}}');
    }
  });
}

function dernierSms(url, res) {
  const code = SMS.get(chiffres(new URL(url, "http://relais").searchParams.get("telephone")));
  if (!code) return res.writeHead(404, { "content-type": "application/json" }).end("{}");
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ code }));
}

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
    if (req.url === "/sms-dev" && req.method === "POST") return recoitSms(req, res);
    if (req.url.startsWith("/sms-dev/dernier") && req.method === "GET") return dernierSms(req.url, res);

    const cible = AMONTS.find((a) => req.url === a.prefixe || req.url.startsWith(a.prefixe + "/") || req.url.startsWith(a.prefixe + "?"));
    if (!cible) {
      return res.writeHead(404, { "content-type": "text/plain" }).end("Seuls /rest/v1 et /auth/v1 sont relayés.\n");
    }

    const amont = http.request(
      {
        host: "127.0.0.1",
        port: cible.port,
        method: req.method,
        path: req.url.slice(cible.prefixe.length) || "/",
        headers: { ...req.headers, host: `127.0.0.1:${cible.port}` },
      },
      (reponse) => {
        res.writeHead(reponse.statusCode ?? 502, reponse.headers);
        reponse.pipe(res);
      },
    );
    amont.on("error", (e) => {
      res.writeHead(502, { "content-type": "text/plain" }).end(`${cible.nom} injoignable : ${e.message}\n`);
    });
    req.pipe(amont);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`relais /rest/v1 et /auth/v1 sur http://127.0.0.1:${PORT}`));
