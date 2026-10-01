// SkanFact simulé, pour le développement et les parcours : les lectures que la
// console fait par l'API de SkanFact (docs/api-situation.md de la plateforme,
// brique 127 : S1 le client par son matricule, S2 ses factures à payer, S3 sa
// situation, S5 le lien vers l'écran) et les avis signés qu'elle reçoit
// (serveur/avis.ts : `skanfact-signature: t=<s>,v1=<hex>`, HMAC-SHA256 de
// « <t>.<corps> » avec le secret de l'abonnement). Servi par le relais :
//   http://127.0.0.1:54321/skanfact-dev/v1/entreprises/<e>/clients?identifiant=…
// Deux gestes de développement, que la vraie API n'a pas : régler une facture
// (POST /skanfact-dev/regler { numero, montant? }) et émettre la facture d'un
// client (POST /skanfact-dev/emettre { client, montant, objet? }) ; chacun
// envoie à la console l'avis que SkanFact enverrait. POST /skanfact-dev/panne
// { active } fait répondre 503 à l'API, comme un SkanFact en panne ;
// POST /skanfact-dev/reinitialiser remet les fiches du départ. Les écrans (/skanfact-dev/v10/…) disent ce
// qu'ils montreraient.
//
// Clients et montants fictifs ; les jours sont comptés depuis aujourd'hui, à
// Tunis. Jamais en production.
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";

export const PREFIXE = "/skanfact-dev";
const ENTREPRISE = process.env.SKANFACT_ENTREPRISE ?? "00000000-0000-4000-8888-00000000e000";
const CLE = process.env.SKANFACT_CLE ?? "skf_dev_local_skanecom";
const SECRET_AVIS = process.env.SKANFACT_AVIS_SECRET ?? "whsec_dev_local_skanecom";
// Où la console attend les avis, et l'hôte sous lequel elle répond.
const CROCHET = new URL(process.env.SKANFACT_AVIS_URL ?? "http://127.0.0.1:4200/crochets/skanfact");
const HOTE_CROCHET = process.env.SKANFACT_AVIS_HOTE ?? "console.localhost:4200";

const JOUR = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis", year: "numeric", month: "2-digit", day: "2-digit" });
const aujourdhui = () => JOUR.format(new Date());
/** Le jour à `n` jours d'aujourd'hui (AAAA-MM-JJ). */
function jour(n) {
  const [a, m, j] = aujourdhui().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}
const joursEntre = (de, a) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
const texte = (millimes) => (millimes / 1000).toFixed(3);
const normal = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();
const ecran = (vue, ref) => (ref ? `/v10/?e=${ENTREPRISE}#/${vue}/${ref}` : null);

let etat;
let enPanne = false;
function reinitialiser() {
  enPanne = false;
  const c1 = { id: "00000000-0000-4000-8888-000000000001", ref: "menuiserie", raison_sociale: "Menuiserie du Lac", identifiant: "1234567 a/M/000" };
  const c2 = { id: "00000000-0000-4000-8888-000000000002", ref: "atelier", raison_sociale: "Atelier d'essai SARL", identifiant: "7654321B/A/000" };
  etat = {
    numero: 4,
    clients: [c1, c2].map((c) => ({ ...c, nature: "societe", pays: "TN", devise: "TND" })),
    factures: [
      { id: "00000000-0000-4000-8888-0000000000f1", ref: "f1", numero: "FAC-2026-001", client: c1.id, datePiece: jour(-46), echeance: jour(-16), net: 1_073_190, objet: "Mise en place de la boutique" },
      { id: "00000000-0000-4000-8888-0000000000f2", ref: "f2", numero: "FAC-2026-002", client: c2.id, datePiece: jour(-35), echeance: jour(-5), net: 250_000, objet: "Abonnement mensuel" },
      { id: "00000000-0000-4000-8888-0000000000f3", ref: "f3", numero: "FAC-2026-003", client: c1.id, datePiece: jour(-1), echeance: jour(14), net: 119_000, objet: "Abonnement mensuel" },
    ],
    reglements: [
      { facture: "00000000-0000-4000-8888-0000000000f2", date: jour(-6), montant: 250_000 },
      { facture: "00000000-0000-4000-8888-0000000000f1", date: jour(-10), montant: 300_000 },
    ],
  };
}
reinitialiser();

const reste = (f) => f.net - etat.reglements.filter((r) => r.facture === f.id).reduce((s, r) => s + r.montant, 0);
const clientDe = (id) => etat.clients.find((c) => c.id === id) ?? null;
const ficheClient = (c) => ({ id: c.id, raison_sociale: c.raison_sociale, nature: c.nature, identifiant: c.identifiant, pays: c.pays, devise: c.devise, ecran: ecran("client", c.ref) });
const ligne = (f) => ({
  id: f.id, numero: f.numero, datePiece: f.datePiece, echeance: f.echeance, devise: "TND", symbole: "DT",
  netAPayer: texte(f.net), reste: texte(reste(f)), clientId: f.client, client: clientDe(f.client)?.raison_sociale ?? null,
  objet: f.objet, statut: "emise", type: "facture", ecran: ecran("doc", f.ref),
});

function situation(c) {
  const au = aujourdhui();
  const dues = etat.factures.filter((f) => f.client === c.id && reste(f) > 0).sort((a, b) => a.echeance.localeCompare(b.echeance));
  const echues = dues.filter((f) => f.echeance < au);
  const somme = (l) => l.reduce((s, f) => s + reste(f), 0);
  const premier = echues[0];
  const regles = etat.reglements.filter((r) => clientDe(etat.factures.find((f) => f.id === r.facture)?.client)?.id === c.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const dernier = regles[0];
  return {
    client: { id: c.id, raisonSociale: c.raison_sociale, identifiant: c.identifiant, ecran: ecran("client", c.ref) },
    au,
    soldes: dues.length ? [{ devise: "TND", reste: texte(somme(dues)), echu: texte(somme(echues)), facturesAPayer: dues.length, facturesEchues: echues.length }] : [],
    retard: premier ? { depuis: premier.echeance, jours: joursEntre(premier.echeance, au), numero: premier.numero, ecran: ecran("doc", premier.ref) } : null,
    dernierReglement: dernier
      ? { date: dernier.date, montant: texte(dernier.montant), devise: "TND", facture: etat.factures.find((f) => f.id === dernier.facture)?.numero ?? null }
      : null,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (res, statut, corps) =>
  res.writeHead(statut, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify(corps));

/* L'API : une clé, son entreprise, les trois lectures. */
function api(req, res, url) {
  if (enPanne) return json(res, 503, { motif: "Service indisponible" });
  const jeton = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  if (jeton !== CLE) return json(res, 401, { motif: "Connexion requise" });
  const m = /^\/v1\/entreprises\/([^/]+)(\/.*)$/.exec(url.pathname.slice(PREFIXE.length));
  if (!m || req.method !== "GET") return json(res, 404, { motif: "Introuvable" });
  if (m[1] !== ENTREPRISE) return json(res, 404, { motif: "Introuvable" });
  const q = url.searchParams;

  // S1. Les clients, par leur matricule (espaces et casse ignorés).
  if (m[2] === "/clients") {
    const cherche = q.has("identifiant") ? normal(q.get("identifiant")) : null;
    const clients = etat.clients.filter((c) => cherche === null || normal(c.identifiant) === cherche).map(ficheClient);
    return json(res, 200, { clients, suite: null });
  }
  // S3. La situation d'un client.
  const s = /^\/clients\/([^/]+)\/situation$/.exec(m[2]);
  if (s) {
    const c = UUID.test(s[1]) ? clientDe(s[1]) : null;
    if (!c) return json(res, 404, { motif: "Introuvable" });
    return json(res, 200, situation(c));
  }
  // S2. Les factures d'un client qui restent à payer, les plus récentes d'abord, par pages.
  if (m[2] === "/ventes") {
    const client = q.get("client");
    if (client !== null && !UUID.test(client)) return json(res, 400, { motif: "Champ invalide", champ: "client" });
    const aPayer = q.get("aPayer") === "1";
    if (aPayer && q.get("type") !== "facture") return json(res, 400, { motif: "Champ invalide", champ: "aPayer" });
    const limite = Math.min(200, Math.max(1, Number(q.get("limite") ?? 50) || 50));
    const toutes = etat.factures
      .filter((f) => (client === null || f.client === client) && (!aPayer || reste(f) > 0))
      .sort((a, b) => b.datePiece.localeCompare(a.datePiece) || b.id.localeCompare(a.id));
    const debut = q.has("avant") ? toutes.findIndex((f) => f.id === q.get("avant")) + 1 : 0;
    const page = toutes.slice(debut, debut + limite);
    const plein = page.length === limite && debut + limite < toutes.length;
    return json(res, 200, { lignes: page.map(ligne), suite: plein ? page.at(-1).id : null, total: aPayer ? null : toutes.length });
  }
  return json(res, 404, { motif: "Introuvable" });
}

/* L'avis, signé comme SkanFact le signe, envoyé à la console. */
function aviser(evenement, donnees) {
  const corps = JSON.stringify({ id: randomUUID(), evenement, entreprise: ENTREPRISE, donnees });
  const t = Math.floor(Date.now() / 1000);
  const signature = `t=${t},v1=${createHmac("sha256", SECRET_AVIS).update(`${t}.${corps}`).digest("hex")}`;
  const id = JSON.parse(corps).id;
  return new Promise((resoudre) => {
    const envoi = http.request(
      {
        host: CROCHET.hostname, port: CROCHET.port, path: CROCHET.pathname, method: "POST",
        headers: {
          host: HOTE_CROCHET, "content-type": "application/json", "user-agent": "SkanFact-Avis/1",
          "skanfact-evenement": evenement, "skanfact-avis": id, "skanfact-signature": signature,
        },
        timeout: 15_000,
      },
      (r) => {
        r.resume();
        r.on("end", () => resoudre({ evenement, statut: r.statusCode }));
      },
    );
    envoi.on("timeout", () => envoi.destroy(new Error("délai dépassé")));
    envoi.on("error", (e) => resoudre({ evenement, statut: 0, erreur: e.message }));
    envoi.end(corps);
  });
}

function lire(req) {
  return new Promise((resoudre) => {
    let corps = "";
    req.on("data", (m) => (corps += m));
    req.on("end", () => {
      try {
        resoudre(corps ? JSON.parse(corps) : {});
      } catch {
        resoudre(null);
      }
    });
  });
}

/* Les gestes de développement : ce qu'une personne ferait dans SkanFact. */
async function geste(req, res, nom) {
  const d = await lire(req);
  if (!d) return json(res, 400, { motif: "Corps illisible" });
  if (nom === "panne") {
    enPanne = d.active !== false;
    return json(res, 200, { panne: enPanne });
  }
  if (nom === "reinitialiser") {
    reinitialiser();
    return json(res, 200, { ok: true });
  }
  if (nom === "regler") {
    const f = etat.factures.find((x) => x.numero === d.numero);
    if (!f) return json(res, 404, { motif: "Facture introuvable" });
    const du = reste(f);
    const montant = Math.min(du, d.montant ? Math.round(Number(d.montant) * 1000) : du);
    if (!(montant > 0)) return json(res, 400, { motif: "Rien à régler" });
    etat.reglements.push({ facture: f.id, date: aujourdhui(), montant });
    const c = clientDe(f.client);
    const avis = [await aviser("reglement.enregistre", { facture: { id: f.id, numero: f.numero }, client: { id: c.id, raisonSociale: c.raison_sociale }, date: aujourdhui(), montant: texte(montant), devise: "TND" })];
    if (reste(f) === 0) avis.push(await aviser("facture.reglee", { id: f.id, numero: f.numero, client: { id: c.id, raisonSociale: c.raison_sociale }, devise: "TND", par: "reglement" }));
    return json(res, 200, { reste: texte(reste(f)), avis });
  }
  if (nom === "emettre") {
    const c = clientDe(d.client) ?? etat.clients.find((x) => normal(x.identifiant) === normal(d.identifiant));
    if (!c) return json(res, 404, { motif: "Client introuvable" });
    const net = Math.round(Number(d.montant ?? 0) * 1000);
    if (!(net > 0)) return json(res, 400, { motif: "Montant invalide" });
    const n = ++etat.numero;
    const f = { id: randomUUID(), ref: `f${n}`, numero: `FAC-2026-${String(n).padStart(3, "0")}`, client: c.id, datePiece: aujourdhui(), echeance: jour(Number(d.echeance ?? 15)), net, objet: d.objet ?? "Abonnement mensuel" };
    etat.factures.push(f);
    const avis = [await aviser("facture.emise", {
      id: f.id, numero: f.numero, datePiece: f.datePiece, client: { id: c.id, raisonSociale: c.raison_sociale }, devise: "TND",
      totalHT: texte(Math.round(net / 1.19)), totalTVA: texte(net - Math.round(net / 1.19)), totalTTC: texte(net), retenue: "0.000", netAPayer: texte(net),
    })];
    return json(res, 200, { numero: f.numero, avis });
  }
  return json(res, 404, { motif: "Introuvable" });
}

/* L'écran de SkanFact que montrerait le lien : ici, ce qu'il désigne. */
function ecranSimule(res) {
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SkanFact (simulé)</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#1f2937">
<p style="font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">SkanFact simulé · développement</p>
<h1 id="t" style="font-size:1.4rem">Écran de SkanFact</h1>
<p>En production, ce lien ouvre cet écran dans SkanFact, après connexion avec votre compte.</p>
<script>
  const [, vue, ref] = (location.hash.match(/^#\\/(doc|client)\\/(.+)$/) || []);
  document.getElementById("t").textContent = vue === "doc" ? "La facture " + ref : vue === "client" ? "La fiche du client " + ref : "L'accueil de l'entreprise";
</script>`;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(html);
}

/** Le relais confie à SkanFact simulé tout ce qui commence par /skanfact-dev/. */
export function skanfactDev(req, res) {
  const url = new URL(req.url, "http://relais");
  const chemin = url.pathname.slice(PREFIXE.length);
  if (chemin.startsWith("/v1/")) return api(req, res, url);
  if (chemin.startsWith("/v10/") && req.method === "GET") return ecranSimule(res);
  const g = /^\/(regler|emettre|panne|reinitialiser)$/.exec(chemin);
  if (g && req.method === "POST") return geste(req, res, g[1]);
  return json(res, 404, { motif: "Introuvable" });
}
