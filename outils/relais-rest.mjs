// Relais de développement : expose PostgREST sous /rest/v1 et GoTrue sous
// /auth/v1, comme l'API de Supabase, pour que le client @supabase/supabase-js
// de l'application parle à la base locale sans aucune différence de
// configuration.
//   http://127.0.0.1:54321/rest/v1/produits  →  http://127.0.0.1:54330/produits
//   http://127.0.0.1:54321/auth/v1/token     →  http://127.0.0.1:54340/token
// Il sert aussi les fichiers de démonstration (supabase/fichiers-demo), rangés
// comme sur R2 :
//   http://127.0.0.1:54321/fichiers/maymar/marque/logo.svg
// et tient lieu de R2 pour les fichiers que déposent le backoffice et la
// console (photos des produits) : PUT et DELETE sous /fichiers/, avec la clé
// de dépôt (FICHIERS_DEPOT_CLE, donnée par outils/api-locale.sh), rangés dans
// .outils/fichiers/ (hors dépôt), servis avant les fichiers de démonstration.
// Et il tient lieu de fournisseur de SMS : GoTrue lui confie les codes de
// connexion (crochet « Send SMS »), il les note dans .outils/sms.log au lieu
// de les envoyer. Les essais relisent le dernier code d'un numéro :
//   http://127.0.0.1:54321/sms-dev/dernier?telephone=21620123456
// De même pour les e-mails (crochet « Send Email ») : les codes de connexion
// des acheteurs, notés dans .outils/emails.log, relus par adresse :
//   http://127.0.0.1:54321/email-dev/dernier?email=leila@exemple.tn
// Et les e-mails que l'application a rédigés (COURRIELS_ENVOI=relais,
// src/lib/courriels/envoi.ts), gardés entiers, relus par adresse :
//   http://127.0.0.1:54321/email-dev/rendu/dernier?email=leila@exemple.tn
// Lancé par outils/api-locale.sh. Jamais en production.
import http from "node:http";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.RELAIS_PORT ?? 54321);
const AMONTS = [
  { prefixe: "/rest/v1", port: Number(process.env.POSTGREST_PORT ?? 54330), nom: "PostgREST" },
  { prefixe: "/auth/v1", port: Number(process.env.GOTRUE_PORT ?? 54340), nom: "GoTrue" },
];
const FICHIERS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../supabase/fichiers-demo");
const DEPOSES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.outils/fichiers");
const CLE_DEPOT = process.env.FICHIERS_DEPOT_CLE ?? "";
const TAILLE_MAX = 12 * 1024 * 1024;
const TYPES = { ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

const JOURNAL_SMS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.outils/sms.log");
const SMS = new Map(); // numéro (chiffres seuls) → dernier code
const JOURNAL_EMAILS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.outils/emails.log");
const EMAILS = new Map(); // adresse (minuscules) → { code, type }
const RENDUS = new Map(); // adresse (minuscules) → { nom, sujet, html, texte, code }

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

/* Le crochet « Send Email » de GoTrue :
   { user: { email }, email_data: { token, email_action_type, … } }. */
function recoitEmail(req, res) {
  let corps = "";
  req.on("data", (morceau) => (corps += morceau));
  req.on("end", async () => {
    try {
      const { user, email_data: donnees } = JSON.parse(corps);
      const adresse = String(user?.email ?? "").toLowerCase();
      if (!adresse) throw new Error("adresse absente");
      EMAILS.set(adresse, { code: String(donnees?.token ?? ""), type: String(donnees?.email_action_type ?? "") });
      await appendFile(JOURNAL_EMAILS, `${new Date().toISOString()}  ${adresse}  ${donnees?.email_action_type}  code ${donnees?.token}\n`);
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    } catch {
      res.writeHead(400, { "content-type": "application/json" }).end('{"error":{"http_code":400,"message":"E-mail illisible"}}');
    }
  });
}

/* Un e-mail rédigé par l'application : { a, nom, sujet, html, texte, code }. */
function recoitRendu(req, res) {
  let corps = "";
  req.on("data", (morceau) => (corps += morceau));
  req.on("end", async () => {
    try {
      const e = JSON.parse(corps);
      const adresse = String(e.a ?? "").toLowerCase();
      if (!adresse) throw new Error("adresse absente");
      RENDUS.set(adresse, { nom: e.nom, sujet: e.sujet, html: e.html, texte: e.texte, code: e.code ?? null });
      await appendFile(JOURNAL_EMAILS, `${new Date().toISOString()}  ${adresse}  rendu  « ${e.sujet} » de ${e.nom}\n`);
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    } catch {
      res.writeHead(400, { "content-type": "application/json" }).end('{"erreur":"e-mail illisible"}');
    }
  });
}

function dernierRendu(url, res) {
  const rendu = RENDUS.get(String(new URL(url, "http://relais").searchParams.get("email") ?? "").toLowerCase());
  if (!rendu) return res.writeHead(404, { "content-type": "application/json" }).end("{}");
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(rendu));
}

function dernierEmail(url, res) {
  const recu = EMAILS.get(String(new URL(url, "http://relais").searchParams.get("email") ?? "").toLowerCase());
  if (!recu) return res.writeHead(404, { "content-type": "application/json" }).end("{}");
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(recu));
}

/** Le chemin d'un fichier sous un dossier racine, ou null s'il en sort. */
function sous(racine, url) {
  const chemin = path.resolve(racine, decodeURIComponent(url.slice("/fichiers/".length).split("?")[0]));
  return chemin.startsWith(racine + path.sep) ? chemin : null;
}

async function sertFichier(url, res) {
  for (const racine of [DEPOSES, FICHIERS]) {
    const chemin = sous(racine, url);
    if (!chemin) return res.writeHead(403).end();
    try {
      const contenu = await readFile(chemin);
      res.writeHead(200, {
        "content-type": TYPES[path.extname(chemin)] ?? "application/octet-stream",
        "cache-control": "public, max-age=300",
      });
      return res.end(contenu);
    } catch {
      // pas dans ce dossier : le suivant
    }
  }
  res.writeHead(404).end();
}

/* Le dépôt, comme un PUT ou un DELETE sur R2. Seuls les fichiers déposés
   s'effacent : ceux de démonstration restent. */
function deposeFichier(req, res) {
  if (!CLE_DEPOT || req.headers["x-depot-cle"] !== CLE_DEPOT) return res.writeHead(401).end();
  const chemin = sous(DEPOSES, req.url);
  if (!chemin) return res.writeHead(403).end();
  if (req.method === "DELETE") {
    rm(chemin, { force: true }).then(() => res.writeHead(204).end(), () => res.writeHead(500).end());
    return;
  }
  const morceaux = [];
  let taille = 0;
  req.on("data", (m) => {
    taille += m.length;
    if (taille > TAILLE_MAX) req.destroy();
    else morceaux.push(m);
  });
  req.on("end", async () => {
    try {
      await mkdir(path.dirname(chemin), { recursive: true });
      await writeFile(chemin, Buffer.concat(morceaux));
      res.writeHead(201).end();
    } catch {
      res.writeHead(500).end();
    }
  });
}

http
  .createServer((req, res) => {
    // L'application lit la vitrine côté serveur ; le CORS ouvert ne sert qu'aux
    // essais depuis un navigateur en local.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return res.writeHead(204).end();
    if (req.url.startsWith("/fichiers/") && (req.method === "PUT" || req.method === "DELETE")) return deposeFichier(req, res);
    if (req.url.startsWith("/fichiers/")) return sertFichier(req.url, res);
    if (req.url === "/sms-dev" && req.method === "POST") return recoitSms(req, res);
    if (req.url.startsWith("/sms-dev/dernier") && req.method === "GET") return dernierSms(req.url, res);
    if (req.url === "/email-dev" && req.method === "POST") return recoitEmail(req, res);
    if (req.url === "/email-dev/rendu" && req.method === "POST") return recoitRendu(req, res);
    if (req.url.startsWith("/email-dev/rendu/dernier") && req.method === "GET") return dernierRendu(req.url, res);
    if (req.url.startsWith("/email-dev/dernier") && req.method === "GET") return dernierEmail(req.url, res);

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
