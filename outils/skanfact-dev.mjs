// SkanFact simulé, pour le développement et les parcours : les lectures que la
// console fait par l'API de SkanFact (docs/api-situation.md de la plateforme,
// brique 127 : S1 le client par son matricule, S2 ses factures à payer, S3 sa
// situation, S5 le lien vers l'écran ; brique 130 : les contrats d'abonnement,
// S8) et les avis signés qu'elle reçoit
// (serveur/avis.ts : `skanfact-signature: t=<s>,v1=<hex>`, HMAC-SHA256 de
// « <t>.<corps> » avec le secret de l'abonnement). Servi par le relais :
//   http://127.0.0.1:54321/skanfact-dev/v1/entreprises/<e>/clients?identifiant=…
// Deux gestes de développement, que la vraie API n'a pas : régler une facture
// (POST /skanfact-dev/regler { numero, montant? }) et émettre la facture d'un
// client (POST /skanfact-dev/emettre { client, montant, objet? }) ; chacun
// envoie à la console l'avis que SkanFact enverrait. POST /skanfact-dev/panne
// { active } fait répondre 503 à l'API, comme un SkanFact en panne ;
// POST /skanfact-dev/echoir { contrat } fait passer l'échéance d'un contrat
// (le tour du serveur, brique 129 : « Émise seule », la facture est émise et
// annoncée) ; POST /skanfact-dev/reinitialiser remet les fiches du départ.
// Les écrans (/skanfact-dev/v10/…) disent ce qu'ils montreraient.
//
// Et les entreprises des COMMERÇANTS (briques 131 à 133, docs/boutique.md :
// une commande de la boutique devient une facture dans SON SkanFact) :
// B0 « Connecter » — la page /skanfact-dev/connecter (le commerçant choisit
// son entreprise, Autoriser ou Refuser ; seule l'adresse de retour déclarée
// est suivie), puis l'échange du code par le serveur de SkanEcom (POST
// /v1/partenaires/skanecom/echanger, son secret reconnu à son EMPREINTE
// SHA-256 seule ; un code vaut dix minutes, une fois) contre une clé d'un an ;
// « Déconnecter » chez SkanEcom (brique 135 : POST
// /v1/partenaires/skanecom/deconnecter { cle }, la clé coupée ici) ;
// B1 POST …/commandes-en-ligne, B2 GET …/:ref, B3 POST …/:ref/paiements,
// B4 POST …/:ref/retours (l'avoir, l'argent rendu), avec les refus de la
// plateforme (« deux chemins, un chiffre », un retour trop grand, l'argent
// rendu de trop, le timbre). Gestes de développement : ce qu'une entreprise a
// reçu (GET /skanfact-dev/commercant/factures?entreprise=…), révoquer ses
// clés (POST /skanfact-dev/commercant/revoquer { entreprise }), les lire
// (GET /skanfact-dev/commercant/cles?entreprise=…), faire
// refuser par SkanFact la prochaine facture (POST
// /skanfact-dev/commercant/refuser { entreprise }, le refus « deux chemins,
// un chiffre » de la plateforme, une fois).
//
// Clients et montants fictifs ; les jours sont comptés depuis aujourd'hui, à
// Tunis. Jamais en production.
import http from "node:http";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

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
const ecran = (vue, ref, e = ENTREPRISE) => (ref ? `/v10/?e=${e}#/${vue}/${ref}` : null);

// Les entreprises de développement des commerçants (noms fictifs), dont ils
// sont propriétaires dans SkanFact simulé ; SkanEcom, partenaire déclaré :
// ses adresses de retour, l'EMPREINTE de son secret (jamais le secret), les
// gestes de sa clé.
export const COMMERCANTS = {
  "00000000-0000-4000-8888-00000000e001": "Comptoir du Lac SARL",
  "00000000-0000-4000-8888-00000000e002": "Atelier des Sources SARL",
};
const PARTENAIRE = {
  code: "skanecom", nom: "SkanEcom",
  retours: (process.env.SKANFACT_PARTENAIRE_RETOURS ?? "http://console.localhost:4200/skanfact/retour").split(",").map((x) => x.trim()),
  empreinteSecret: process.env.SKANFACT_PARTENAIRE_EMPREINTE ?? "",
  gestes: [["ventes.boutique.facturer", "Facturer les commandes de la boutique"], ["ventes.pieces.voir", "Voir les pièces de vente"]],
};
const CODE_MS = 10 * 60_000;
const sha256 = (x) => createHash("sha256").update(x, "utf8").digest("hex");

let etat;
let enPanne = false;
let commercants;
let codes;
let coupees;
function reinitialiser() {
  enPanne = false;
  commercants = Object.fromEntries(Object.entries(COMMERCANTS).map(([e, nom]) => [e, { nom, cles: new Set(), numero: 0, avoirs: 0, commandes: new Map(), refuser: false }]));
  codes = new Map();
  coupees = new Set();
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
    // Un contrat créé à l'écran, pour l'atelier ; aucun pour la menuiserie.
    contrats: [{
      id: "00000000-0000-4000-8888-0000000000c2", client: c2.id, objet: "Abonnement — {mois} {annee}", periode: "mois", jour: Number(jour(4).slice(8, 10)),
      prochaine: jour(4), derniere: jour(-26), actif: true, emettreSeul: false, refus: null,
      lignes: [{ designation: "Abonnement mensuel", quantite: "1", prixUnitaire: "210.084034", tauxTva: "19" }],
    }],
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

/* L'API : une clé, son entreprise, les lectures et les contrats. */
async function api(req, res, url) {
  if (enPanne) return json(res, 503, { motif: "Service indisponible" });
  const jeton = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  const m = /^\/v1\/entreprises\/([^/]+)(\/.*)$/.exec(url.pathname.slice(PREFIXE.length));
  // Une clé ne voit que son entreprise : celle de SkanEcom, ou celle d'un commerçant.
  const commercant = m ? commercants[m[1]] : null;
  if (commercant) {
    if (!jeton || !commercant.cles.has(jeton)) return json(res, 401, { motif: "Connexion requise" });
    return boutique(req, res, m[1], commercant, m[2]);
  }
  if (url.pathname.slice(PREFIXE.length) === "/v1/partenaires/skanecom/echanger" && req.method === "POST") return echanger(req, res, jeton ?? "");
  if (url.pathname.slice(PREFIXE.length) === "/v1/partenaires/skanecom/deconnecter" && req.method === "POST") return deconnecter(req, res, jeton ?? "");
  if (jeton !== CLE) return json(res, 401, { motif: "Connexion requise" });
  if (!m) return json(res, 404, { motif: "Introuvable" });
  if (m[1] !== ENTREPRISE) return json(res, 404, { motif: "Introuvable" });
  const q = url.searchParams;
  if (m[2] === "/contrats" || m[2].startsWith("/contrats/")) return contrats(req, res, m[2], q);
  if (req.method !== "GET") return json(res, 404, { motif: "Introuvable" });

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

/* S8 — les contrats d'abonnement (serveur/v10/api-contrats.ts) : le corps
   validé comme la plateforme le valide, les prix HT en texte. */
const DECIMAL = (d) => new RegExp(`^\\d{1,12}(\\.\\d{1,${d}})?$`);
const contratApi = (k) => ({ ...k, ecran: `/v10/?e=${ENTREPRISE}#/contrat/${k.id}` });
function corpsContrat(d) {
  if (!d || !UUID.test(String(d.client ?? "")) || !clientDe(d.client)) return { champ: "client" };
  if (!String(d.objet ?? "").trim() || String(d.objet).length > 300) return { champ: "objet" };
  if (!["mois", "trimestre", "annee"].includes(d.periode)) return { champ: "periode" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.prochaine ?? ""))) return { champ: "prochaine" };
  if (d.jour !== undefined && !(Number.isInteger(d.jour) && d.jour >= 1 && d.jour <= 31)) return { champ: "jour" };
  const lignes = Array.isArray(d.lignes) ? d.lignes : [];
  if (!lignes.length || lignes.some((l) => !String(l.designation ?? "").trim() || !DECIMAL(3).test(String(l.quantite))
    || !DECIMAL(6).test(String(l.prixUnitaire)) || !DECIMAL(4).test(String(l.tauxTva)))) return { champ: "lignes" };
  return {
    contrat: {
      client: d.client, objet: String(d.objet).trim(), periode: d.periode, jour: d.jour ?? Number(d.prochaine.slice(8, 10)), prochaine: d.prochaine,
      emettreSeul: d.emettreSeul === true,
      lignes: lignes.map((l) => ({ designation: String(l.designation).trim(), quantite: String(l.quantite), prixUnitaire: String(l.prixUnitaire), tauxTva: String(l.tauxTva) })),
    },
  };
}
async function contrats(req, res, chemin, q) {
  if (chemin === "/contrats" && req.method === "GET") {
    const client = q.get("client");
    return json(res, 200, { contrats: etat.contrats.filter((k) => client === null || k.client === client).map(contratApi) });
  }
  if (chemin === "/contrats" && req.method === "POST") {
    const v = corpsContrat(await lire(req));
    if (!v.contrat) return json(res, 400, { motif: "Champ invalide", champ: v.champ });
    const k = { id: randomUUID(), ...v.contrat, derniere: null, actif: true, refus: null };
    etat.contrats.push(k);
    return json(res, 201, contratApi(k));
  }
  const g = /^\/contrats\/([^/]+)(?:\/(suspendre|reprendre))?$/.exec(chemin);
  const k = g ? etat.contrats.find((x) => x.id === g[1]) : null;
  if (!k) return json(res, 404, { motif: "Introuvable" });
  if (!g[2] && req.method === "PUT") {
    const v = corpsContrat(await lire(req));
    if (!v.contrat) return json(res, 400, { motif: "Champ invalide", champ: v.champ });
    Object.assign(k, v.contrat, { refus: null });
    return json(res, 200, contratApi(k));
  }
  if (g[2] && req.method === "POST") {
    k.actif = g[2] === "reprendre";
    if (k.actif) while (k.prochaine < aujourdhui()) k.prochaine = suivante(k);
    return json(res, 200, contratApi(k));
  }
  return json(res, 404, { motif: "Introuvable" });
}
/* B0 — « Connecter SkanFact » (serveur/partenaires.ts) : la page où le
   commerçant autorise SkanEcom, puis l'échange du code. Le code n'est pas la
   clé : la clé se dérive du code par une clé que seul SkanFact connaît ; un
   code vaut dix minutes, une fois ; le secret du partenaire est reconnu à son
   empreinte. */
const CLE_SERVEUR = randomBytes(32);
const cleDuCode = (code) => `skf_${createHmac("sha256", CLE_SERVEUR).update(`skanfact.partenaire:${code}`, "utf8").digest("base64url")}`;
const retourPermis = (retour) => !retour.includes("#") && PARTENAIRE.retours.includes(retour.split("?")[0] ?? "");
const echap = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function pageConnecter(res, statut, corps) {
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relier SkanEcom à SkanFact</title>
<style>
  body{font:16px/1.55 system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:2.5rem 1rem;color:#1f2937;background:#f7f7f5}
  .marque{font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin:0 0 1.25rem}
  .carte{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:1.5rem}
  h1{font-size:1.35rem;margin:0 0 .5rem;line-height:1.25} ul{padding-left:1.2rem} li{margin:.2rem 0}
  fieldset{border:0;padding:0;margin:1.25rem 0} legend{font-weight:600;margin-bottom:.5rem}
  label{display:flex;gap:.6rem;align-items:center;border:1px solid #e5e7eb;border-radius:10px;padding:.7rem .85rem;margin:.45rem 0;cursor:pointer}
  label:has(input:checked){border-color:#1d4ed8;background:#eff6ff}
  .gestes{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.25rem} button{font:inherit;border-radius:10px;padding:.7rem 1.1rem;cursor:pointer;border:1px solid #d1d5db;background:#fff}
  button.oui{background:#1d4ed8;border-color:#1d4ed8;color:#fff;font-weight:600} button:focus-visible,input:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}
  .note{font-size:.85rem;color:#6b7280;margin-top:1rem}
</style>
<body><p class="marque">SkanFact simulé · développement</p><main class="carte">${corps}</main></body></html>`;
  res.writeHead(statut, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(html);
}
function connecterGet(res, q) {
  if (q.get("partenaire") !== PARTENAIRE.code) {
    return pageConnecter(res, 400, "<h1>Demande non valable</h1><p>Ce service n'est pas un partenaire connu de SkanFact : rien n'est autorisé.</p>");
  }
  const retour = q.get("retour") ?? "";
  if (!retourPermis(retour)) {
    return pageConnecter(res, 400, `<h1>Demande non valable</h1><p>L'adresse de retour n'est pas celle que ${PARTENAIRE.nom} a déclarée : par prudence, rien n'est autorisé.</p>`);
  }
  const etat = (q.get("etat") ?? "").slice(0, 200);
  const entreprises = Object.entries(commercants).map(([e, c], i) =>
    `<label><input type="radio" name="entreprise" value="${e}"${i === 0 ? " checked" : ""}> ${echap(c.nom)}</label>`).join("");
  return pageConnecter(res, 200, `<h1>Relier ${PARTENAIRE.nom} à SkanFact</h1>
<p>${PARTENAIRE.nom} demande à pouvoir, dans l'entreprise que vous choisissez :</p>
<ul>${PARTENAIRE.gestes.map(([, l]) => `<li>${l}</li>`).join("")}</ul>
<form method="post" action="${PREFIXE}/connecter">
  <input type="hidden" name="retour" value="${echap(retour)}"><input type="hidden" name="etat" value="${echap(etat)}">
  <fieldset><legend>Votre entreprise</legend>${entreprises}</fieldset>
  <div class="gestes"><button class="oui" name="choix" value="autoriser">Autoriser</button><button name="choix" value="refuser">Refuser</button></div>
  <p class="note">Vous pourrez couper cet accès à tout moment depuis SkanFact. L'accès vaut un an.</p>
</form>`);
}
function lireFormulaire(req) {
  return new Promise((resoudre) => {
    let corps = "";
    req.on("data", (m) => (corps += m));
    req.on("end", () => resoudre(new URLSearchParams(corps)));
  });
}
async function connecterPost(req, res) {
  const f = await lireFormulaire(req);
  const retour = f.get("retour") ?? "";
  const etat = f.get("etat") ?? "";
  if (!retourPermis(retour)) return pageConnecter(res, 400, "<h1>Demande non valable</h1><p>Par prudence, rien n'est autorisé.</p>");
  const suite = (params) => res.writeHead(303, { location: `${retour}${retour.includes("?") ? "&" : "?"}${new URLSearchParams(params)}`, "cache-control": "no-store" }).end();
  if (f.get("choix") !== "autoriser") return suite({ erreur: "refusee", etat });
  const entreprise = f.get("entreprise") ?? "";
  if (!commercants[entreprise]) return pageConnecter(res, 400, "<h1>Choisissez votre entreprise</h1>");
  const code = randomBytes(32).toString("base64url");
  codes.set(sha256(code), { entreprise, expire: Date.now() + CODE_MS, servi: false });
  return suite({ code, etat });
}
const secretJuste = (secret) => {
  const voulu = Buffer.from(PARTENAIRE.empreinteSecret, "utf8");
  const vu = Buffer.from(sha256(secret), "utf8");
  return Boolean(secret) && voulu.length === vu.length && timingSafeEqual(voulu, vu);
};
/* Brique 135 : « Déconnecter » chez SkanEcom coupe la clé ici. Seule une clé
   remise à SkanEcom par une connexion ; redemander donne la même réponse. */
async function deconnecter(req, res, secret) {
  if (!secretJuste(secret)) return json(res, 401, { motif: "le secret du partenaire est faux" });
  const d = await lire(req);
  const cle = typeof d?.cle === "string" ? d.cle : "";
  if (cle.length < 20 || cle.length > 200) return json(res, 400, { motif: "Champ invalide", champ: "cle" });
  if (coupees.has(cle)) return json(res, 200, { coupee: true });
  const c = Object.values(commercants).find((x) => x.cles.has(cle));
  if (!c) return json(res, 404, { motif: `cette clé n'a pas été remise à ${PARTENAIRE.nom} par une connexion : rien n'est coupé` });
  c.cles.delete(cle);
  coupees.add(cle);
  return json(res, 200, { coupee: true });
}
async function echanger(req, res, secret) {
  if (!secretJuste(secret)) return json(res, 401, { motif: "le secret du partenaire est faux" });
  const d = await lire(req);
  const code = typeof d?.code === "string" ? d.code : "";
  if (code.length < 20 || code.length > 200) return json(res, 400, { motif: "Champ invalide", champ: "code" });
  const c = codes.get(sha256(code));
  if (!c || c.servi || c.expire < Date.now()) {
    return json(res, 400, { motif: "ce code ne vaut rien : il a déjà servi, il a expiré (il vaut dix minutes), ou il n'a pas été donné à ce partenaire" });
  }
  c.servi = true;
  const cle = cleDuCode(code);
  commercants[c.entreprise].cles.add(cle);
  return json(res, 200, {
    cle, entreprise: c.entreprise, nom: commercants[c.entreprise].nom, gestes: PARTENAIRE.gestes.map(([g]) => g),
    expireLe: new Date(Date.now() + 365 * 86_400_000).toISOString(),
  });
}

/* B1-B4 — la boutique en ligne facturée dans le SkanFact du commerçant
   (serveur/v10/boutique.ts) : le corps validé comme la plateforme le
   valide ; « deux chemins, un chiffre » (le total TTC des lignes, plus le
   timbre, doit être celui de la commande, sinon rien n'est facturé et aucun
   numéro n'est pris) ; la même référence rend la même facture, le même id
   le même paiement ou le même avoir. */
const MODES = ["carte", "en_ligne", "especes", "virement", "cheque", "autre"];
const millimes = (t) => Math.round(Number(t) * 1000);
function lignesValides(lignes) {
  if (!Array.isArray(lignes) || !lignes.length || lignes.length > 200) return "lignes";
  for (const l of lignes) {
    if (!String(l.designation ?? "").trim() || !DECIMAL(3).test(String(l.quantite)) || !DECIMAL(4).test(String(l.tauxTva))) return "lignes";
    if ((l.prixUnitaireTTC === undefined) === (l.prixUnitaire === undefined)) return "lignes.prixUnitaireTTC";
    if (l.prixUnitaireTTC !== undefined && !DECIMAL(3).test(String(l.prixUnitaireTTC))) return "lignes.prixUnitaireTTC";
  }
  return null;
}
function corpsCommande(d) {
  if (!d || !String(d.reference ?? "").trim() || String(d.reference).length > 60) return "reference";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date ?? ""))) return "date";
  if (!d.client || !String(d.client.nom ?? "").trim()) return "client";
  if (d.client.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.client.email)) return "client.email";
  const l = lignesValides(d.lignes);
  if (l) return l;
  if (typeof d.timbre !== "boolean") return "timbre";
  if (d.paiement && (!MODES.includes(d.paiement.mode) || !DECIMAL(3).test(String(d.paiement.montant)) || !String(d.paiement.id ?? "").trim())) return "paiement";
  if (d.totalAttendu !== undefined && !DECIMAL(3).test(String(d.totalAttendu))) return "totalAttendu";
  return null;
}
const ttcDe = (lignes) => (lignes.every((l) => l.prixUnitaireTTC !== undefined)
  ? lignes.reduce((s, l) => s + Math.round(Number(l.quantite) * millimes(l.prixUnitaireTTC)), 0) : null);
// Ce que le client doit encore : la facture, moins ses avoirs, moins ce qu'il a payé (un remboursement compte en moins).
const resteDe = (k) => k.net - k.retours.reduce((s, r) => s + r.net, 0) - k.paiements.reduce((s, p) => s + p.montant, 0);
const resultatCommande = (e, k, deja) => ({
  reference: k.reference, deja, client: k.client,
  facture: { id: k.id, numero: k.numero, date: k.date, netAPayer: texte(k.net), reste: texte(resteDe(k)), ecran: ecran("doc", k.ref, e) },
});
const resultatRetour = (e, k, r, deja) => {
  const { reference, client, facture } = resultatCommande(e, k, true);
  return { reference, client, facture, retour: { id: r.id, deja, avoir: { id: r.uuid, numero: r.numero, date: r.date, montant: texte(r.net), ecran: ecran("doc", r.ref, e) },
    rembourse: texte(k.paiements.filter((p) => p.id === `remb-${r.id}`).reduce((s, p) => s - p.montant, 0)) } };
};
const refus = (res, motif) => json(res, 403, { motif });
function rembourser(k, r, remboursement) {
  if (!remboursement || k.paiements.some((p) => p.id === `remb-${r.id}`)) return null;
  const voulu = millimes(remboursement.montant);
  const reste = resteDe(k);
  if (voulu > -reste) return `le client n'a payé que ${texte(reste < 0 ? -reste : 0)} de plus que ce qu'il doit : on ne lui rend pas ${remboursement.montant}. Rien n'a été enregistré`;
  k.paiements.push({ id: `remb-${r.id}`, montant: -voulu, mode: remboursement.mode, date: r.date });
  return null;
}
async function boutique(req, res, e, commercant, chemin) {
  // Une lecture (le geste ventes.pieces.voir).
  if (chemin === "/ventes" && req.method === "GET") return json(res, 200, { lignes: [], suite: null, total: commercant.commandes.size });
  if (chemin === "/commandes-en-ligne" && req.method === "POST") {
    const d = await lire(req);
    const champ = corpsCommande(d);
    if (champ) return json(res, 400, { motif: "Champ invalide", champ });
    const deja = commercant.commandes.get(d.reference);
    if (deja) return json(res, 200, resultatCommande(e, deja, true));
    const lignes = ttcDe(d.lignes);
    if (lignes === null) return json(res, 400, { motif: "Le simulateur ne facture que des prix TTC", champ: "lignes.prixUnitaire" });
    const ttc = lignes + (d.timbre ? 1000 : 0);
    const attendu = d.totalAttendu !== undefined ? millimes(d.totalAttendu) : ttc;
    // (Le refus demandé en développement fait comme une entreprise qui ajouterait le timbre.)
    const force = commercant.refuser;
    commercant.refuser = false;
    const serveur = force && attendu === ttc ? ttc + 1000 : ttc;
    if (serveur !== attendu) {
      return refus(res, `la facture ferait ${texte(serveur)} et la commande ${texte(attendu)} : rien n'a été facturé, et aucun numéro n'est pris. Vérifie les taux de TVA et le timbre de la commande`);
    }
    const n = ++commercant.numero;
    const k = {
      id: randomUUID(), ref: `cmd-${n}`, reference: d.reference, numero: `FAC-2026-${String(n).padStart(4, "0")}`, date: d.date, net: ttc,
      client: d.client.ref ?? d.client.email ?? d.client.nom, nomClient: d.client.nom, matricule: d.client.matricule ?? "", lignes: d.lignes,
      corpsClient: d.client, timbre: d.timbre, retours: [],
      paiements: d.paiement ? [{ id: d.paiement.id, montant: millimes(d.paiement.montant), mode: d.paiement.mode, date: d.paiement.date }] : [],
    };
    commercant.commandes.set(d.reference, k);
    return json(res, 201, resultatCommande(e, k, false));
  }
  const g = /^\/commandes-en-ligne\/([^/]+)(\/paiements|\/retours)?$/.exec(chemin);
  const k = g ? commercant.commandes.get(decodeURIComponent(g[1])) : null;
  if (g && !g[2] && req.method === "GET") return k ? json(res, 200, resultatCommande(e, k, true)) : json(res, 404, { motif: "Introuvable" });
  if (g && g[2] === "/paiements" && req.method === "POST") {
    if (!k) return json(res, 404, { motif: "Introuvable" });
    const p = await lire(req);
    if (!p || !MODES.includes(p.mode) || !DECIMAL(3).test(String(p.montant)) || !String(p.id ?? "").trim()) return json(res, 400, { motif: "Champ invalide", champ: "paiement" });
    if (!(millimes(p.montant) > 0)) return refus(res, "un montant de zéro ne se paie ni ne se rend");
    if (!k.paiements.some((x) => x.id === p.id)) k.paiements.push({ id: p.id, montant: millimes(p.montant), mode: p.mode, date: p.date });
    return json(res, 200, resultatCommande(e, k, true));
  }
  if (g && g[2] === "/retours" && req.method === "POST") {
    if (!k) return json(res, 404, { motif: "Introuvable" });
    const d = await lire(req);
    if (!d || !String(d.id ?? "").trim() || String(d.id).length > 60) return json(res, 400, { motif: "Champ invalide", champ: "id" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date ?? ""))) return json(res, 400, { motif: "Champ invalide", champ: "date" });
    if (typeof d.timbre !== "boolean") return json(res, 400, { motif: "Champ invalide", champ: "timbre" });
    if (d.lignes !== undefined && lignesValides(d.lignes)) return json(res, 400, { motif: "Champ invalide", champ: lignesValides(d.lignes) });
    if (d.remboursement && (!MODES.includes(d.remboursement.mode) || !DECIMAL(3).test(String(d.remboursement.montant)))) return json(res, 400, { motif: "Champ invalide", champ: "remboursement" });
    // Renvoyé : le même avoir ; l'argent rendu, s'il ne l'était pas encore.
    const deja = k.retours.find((r) => r.id === d.id);
    if (deja) {
      const m = rembourser(k, deja, d.remboursement);
      if (m) return refus(res, m);
      return json(res, 200, resultatRetour(e, k, deja, true));
    }
    const timbreFacture = k.timbre ? 1000 : 0;
    if (d.timbre && (!timbreFacture || k.retours.some((r) => r.timbre))) {
      return refus(res, "le timbre de cette commande n'est pas à rendre : sa facture n'en a pas, ou un autre retour l'a déjà rendu");
    }
    let net;
    let attendu = d.totalAttendu !== undefined ? millimes(d.totalAttendu) : null;
    if (!d.lignes) {
      if (k.retours.length) return json(res, 409, { motif: "une partie de cette commande est déjà rendue : envoie les lignes de ce retour (toute la commande ne se rend plus d'un coup)" });
      net = k.net - (d.timbre ? 0 : timbreFacture);
      attendu ??= net;
    } else {
      const t = ttcDe(d.lignes);
      if (t === null) return json(res, 400, { motif: "Le simulateur ne rend que des prix TTC", champ: "lignes.prixUnitaire" });
      net = t + (d.timbre ? timbreFacture : 0);
      attendu ??= net;
    }
    if (attendu !== net) return refus(res, `l'avoir ferait ${texte(net)} et le retour ${texte(attendu)} : rien n'a été enregistré, et aucun numéro n'est pris. Vérifie les taux de TVA et le timbre du retour`);
    const possible = k.net - k.retours.reduce((s, r) => s + r.net, 0);
    if (net > possible) return refus(res, `ce retour ferait ${texte(net)} alors qu'il ne reste que ${texte(possible)} de la commande à rendre : rien n'a été enregistré`);
    const n = ++commercant.avoirs;
    const r = { id: d.id, uuid: randomUUID(), ref: `avoir-${n}`, numero: `AVO-2026-${String(n).padStart(4, "0")}`, date: d.date, net, timbre: d.timbre, motif: d.motif ?? "", lignes: d.lignes ?? null };
    k.retours.push(r);
    const m = rembourser(k, r, d.remboursement);
    if (m) {
      // Rien n'a été enregistré : l'avoir non plus (et son numéro n'est pas pris).
      k.retours.pop();
      commercant.avoirs--;
      return refus(res, m);
    }
    return json(res, 201, resultatRetour(e, k, r, false));
  }
  return json(res, 404, { motif: "Introuvable" });
}

/** L'échéance d'après : un mois, un trimestre ou un an plus tard, au jour du contrat (le 31 → le dernier jour). */
function suivante(k) {
  const [a, m] = k.prochaine.split("-").map(Number);
  const pas = { mois: 1, trimestre: 3, annee: 12 }[k.periode];
  const mois = m - 1 + pas;
  const dernier = new Date(Date.UTC(a, mois + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, mois, Math.min(k.jour, dernier))).toISOString().slice(0, 10);
}
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

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
  if (nom === "commercant/revoquer") {
    const c = commercants[d.entreprise];
    if (!c) return json(res, 404, { motif: "Entreprise inconnue" });
    c.cles.clear();
    return json(res, 200, { revoquee: true });
  }
  if (nom === "commercant/refuser") {
    const c = commercants[d.entreprise];
    if (!c) return json(res, 404, { motif: "Entreprise inconnue" });
    c.refuser = true;
    return json(res, 200, { refuser: true });
  }
  if (nom === "echoir") {
    // Le tour du serveur (brique 129) : un contrat actif et « Émise seule » émet sa facture et l'annonce.
    const k = etat.contrats.find((x) => x.id === d.contrat);
    if (!k) return json(res, 404, { motif: "Contrat introuvable" });
    if (!k.actif) return json(res, 200, { emise: false, raison: "suspendu" });
    if (!k.emettreSeul) return json(res, 200, { emise: false, raison: "brouillon" });
    const c = clientDe(k.client);
    const [a, m] = k.prochaine.split("-").map(Number);
    const net = k.lignes.reduce((t, l) => {
      const ht = Math.round(Number(l.quantite) * Number(l.prixUnitaire) * 1000);
      return t + ht + Math.round((ht * Number(l.tauxTva)) / 100);
    }, 0);
    const n = ++etat.numero;
    // Émise aujourd'hui (le temps a passé jusqu'à l'échéance), pour la période de l'échéance.
    const f = { id: randomUUID(), ref: `f${n}`, numero: `FAC-2026-${String(n).padStart(3, "0")}`, client: c.id, datePiece: aujourdhui(), echeance: jour(15), net,
      objet: k.objet.replaceAll("{mois}", MOIS[m - 1]).replaceAll("{annee}", String(a)) };
    etat.factures.push(f);
    k.derniere = k.prochaine;
    k.prochaine = suivante(k);
    const avis = [await aviser("facture.emise", {
      id: f.id, numero: f.numero, datePiece: f.datePiece, client: { id: c.id, raisonSociale: c.raison_sociale }, devise: "TND",
      totalHT: texte(Math.round(net / 1.19)), totalTVA: texte(net - Math.round(net / 1.19)), totalTTC: texte(net), retenue: "0.000", netAPayer: texte(net),
    })];
    return json(res, 200, { emise: true, numero: f.numero, netAPayer: texte(net), avis });
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
  const [, vue, ref] = (location.hash.match(/^#\\/(doc|client|contrat)\\/(.+)$/) || []);
  document.getElementById("t").textContent = vue === "doc" ? "La facture " + ref : vue === "client" ? "La fiche du client " + ref
    : vue === "contrat" ? "Le contrat " + ref : "L'accueil de l'entreprise";
</script>`;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(html);
}

/** Le relais confie à SkanFact simulé tout ce qui commence par /skanfact-dev/. */
export function skanfactDev(req, res) {
  const url = new URL(req.url, "http://relais");
  const chemin = url.pathname.slice(PREFIXE.length);
  if (chemin.startsWith("/v1/")) return void api(req, res, url).catch((e) => json(res, 500, { motif: String(e?.message ?? e) }));
  if (chemin.startsWith("/v10/") && req.method === "GET") return ecranSimule(res);
  if (chemin === "/connecter" && req.method === "GET") return connecterGet(res, url.searchParams);
  if (chemin === "/connecter" && req.method === "POST") return void connecterPost(req, res);
  // Développement : les clés valables d'une entreprise (pour essayer qu'une clé coupée reçoit 401).
  if (chemin === "/commercant/cles" && req.method === "GET") {
    const c = commercants[url.searchParams.get("entreprise") ?? ""];
    if (!c) return json(res, 404, { motif: "Entreprise inconnue" });
    return json(res, 200, { cles: [...c.cles] });
  }
  if (chemin === "/commercant/factures" && req.method === "GET") {
    const c = commercants[url.searchParams.get("entreprise") ?? ""];
    if (!c) return json(res, 404, { motif: "Entreprise inconnue" });
    return json(res, 200, {
      cles: c.cles.size,
      factures: [...c.commandes.values()].map((k) => ({
        ...k, net: texte(k.net), reste: texte(resteDe(k)),
        paiements: k.paiements.map((p) => ({ ...p, montant: texte(p.montant) })),
        retours: k.retours.map((r) => ({ ...r, net: texte(r.net) })),
      })),
    });
  }
  const g = /^\/(regler|emettre|echoir|panne|reinitialiser|commercant\/revoquer|commercant\/refuser)$/.exec(chemin);
  if (g && req.method === "POST") return geste(req, res, g[1]);
  return json(res, 404, { motif: "Introuvable" });
}
