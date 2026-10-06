// Tient lieu, en local, de Konnect (le paiement en ligne des boutiques) :
// l'application ouvre un paiement, l'acheteur arrive sur une page de
// paiement comme celle de Konnect (carte bancaire ou e-Dinar, cartes
// d'essai), puis le relais prévient la boutique (l'appel sans signature de
// Konnect, ?payment_ref=…) et ramène l'acheteur sur la vitrine
// (src/lib/paiement/konnect.ts). Aucune vraie carte : la saisie d'une carte
// ne se fait jamais chez SkanEcom, en ligne c'est la page de Konnect.
//   POST /konnect-dev/api/v2/payments/init-payment   (x-api-key)
//   GET  /konnect-dev/api/v2/payments/<référence>
//   GET  /konnect-dev/payer/<référence>               la page de l'acheteur
//   POST /konnect-dev/payer/<référence>               choix=payer (la carte) | annuler
// Une clé qui contient « refusee » est refusée (401) ; un portefeuille qui
// contient « panne » fait tomber l'ouverture des paiements (503). Gardé en
// mémoire : jamais en production.
import http from "node:http";
import { randomBytes } from "node:crypto";

export const PREFIXE = "/konnect-dev";
const PAIEMENTS = new Map(); // référence → paiement

const json = (res, statut, corps) => res.writeHead(statut, { "content-type": "application/json" }).end(JSON.stringify(corps));
const echappe = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dinars = (m) => (m / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Prévenir la boutique : un GET sur son adresse, l'hôte gardé (maymar.localhost). */
function prevenir(adresse, reference) {
  try {
    const u = new URL(adresse);
    u.searchParams.set("payment_ref", reference);
    const r = http.request({ host: "127.0.0.1", port: u.port || 80, path: `${u.pathname}${u.search}`, method: "GET", headers: { host: u.host } });
    r.on("error", () => {});
    r.end();
  } catch { /* une adresse illisible : la vitrine relira au retour */ }
}

export function konnectDev(req, res, relais) {
  const [chemin] = req.url.slice(PREFIXE.length).split("?");
  let corps = "";
  req.on("data", (m) => (corps += m));
  req.on("end", () => {
    if (chemin.startsWith("/api/v2/")) {
      const cle = String(req.headers["x-api-key"] ?? "");
      if (!cle || cle.includes("refusee")) return json(res, 401, { errors: [{ message: "Unauthorized" }] });
      if (chemin === "/api/v2/payments/init-payment" && req.method === "POST") {
        let d = {};
        try { d = JSON.parse(corps || "{}"); } catch { return json(res, 400, { errors: [{ message: "JSON illisible" }] }); }
        if (!d.receiverWalletId || !(d.amount > 0)) return json(res, 422, { errors: [{ message: "receiverWalletId et amount attendus" }] });
        // Un portefeuille dont le nom contient « panne » : Konnect ne répond plus (pour essayer la vitrine sans Konnect).
        if (String(d.receiverWalletId).includes("panne")) return json(res, 503, { errors: [{ message: "Service unavailable" }] });
        const reference = randomBytes(12).toString("hex");
        PAIEMENTS.set(reference, { reference, montant: d.amount, statut: "pending", commande: d.orderId, description: d.description,
          webhook: d.webhook, retour: d.successUrl, echec: d.failUrl ?? d.successUrl, paye: 0 });
        return json(res, 200, { payUrl: `${relais}${PREFIXE}/payer/${reference}`, paymentRef: reference });
      }
      const m = chemin.match(/^\/api\/v2\/payments\/([\w-]+)$/);
      if (m && req.method === "GET") {
        const p = PAIEMENTS.get(m[1]);
        if (!p) return json(res, 404, { errors: [{ message: "Payment not found" }] });
        return json(res, 200, { payment: { id: p.reference, status: p.statut, amount: p.montant, reachedAmount: p.paye, orderId: p.commande,
          transactions: p.statut === "completed" ? [{ status: "success", amount: p.paye }] : [] } });
      }
      return json(res, 404, { errors: [{ message: "Route inconnue" }] });
    }
    const m = chemin.match(/^\/payer\/([\w-]+)$/);
    const p = m ? PAIEMENTS.get(m[1]) : null;
    if (!p) return res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Paiement introuvable");
    if (req.method === "POST") {
      const f = new URLSearchParams(corps);
      if (f.get("choix") !== "payer") {
        // « Annuler » : le paiement échoue, l'acheteur revient à la boutique.
        p.statut = "failed";
        p.paye = 0;
        if (p.webhook) prevenir(p.webhook, p.reference);
        return res.writeHead(303, { location: p.echec }).end();
      }
      const saisie = lireSaisie(f);
      // Comme une vraie page de paiement : l'erreur ou le refus se disent
      // dans la page, rendue normalement (200), le formulaire prêt à corriger.
      if (saisie.erreurs.size > 0) return page(res, p, saisie, 200);
      if (saisie.refusee) return page(res, p, { ...saisie, refus: "Paiement refusé par votre banque : aucun montant n'a été prélevé. Essayez une autre carte." }, 200);
      p.statut = "completed";
      p.paye = p.montant;
      if (p.webhook) prevenir(p.webhook, p.reference);
      return res.writeHead(303, { location: p.retour }).end();
    }
    return page(res, p, { methode: "carte", valeurs: {}, erreurs: new Map() }, 200);
  });
}

/* ---- La page de paiement, comme celle de Konnect : carte bancaire ou e-Dinar.
   Cartes d'essai : 4242 4242 4242 4242 acceptée, 4000 0000 0000 0002 refusée
   par la banque ; une carte e-Dinar qui finit par 0002 est refusée aussi. */
const chiffres = (x) => String(x ?? "").replace(/\D/g, "");
function luhn(n) {
  let somme = 0;
  for (let i = 0; i < n.length; i++) {
    let c = Number(n[n.length - 1 - i]);
    if (i % 2 === 1) { c *= 2; if (c > 9) c -= 9; }
    somme += c;
  }
  return n.length >= 13 && somme % 10 === 0;
}
function lireSaisie(f) {
  const methode = f.get("methode") === "edinar" ? "edinar" : "carte";
  const erreurs = new Map();
  const valeurs = {};
  if (methode === "carte") {
    valeurs.titulaire = String(f.get("titulaire") ?? "").trim().slice(0, 60);
    valeurs.numero = chiffres(f.get("numero")).slice(0, 19);
    valeurs.expiration = String(f.get("expiration") ?? "").trim().slice(0, 7);
    const cvv = chiffres(f.get("cvv"));
    if (valeurs.titulaire.length < 2) erreurs.set("titulaire", "Le nom écrit sur la carte.");
    if (!luhn(valeurs.numero)) erreurs.set("numero", "Ce numéro de carte n'est pas valable : vérifiez les 16 chiffres.");
    const m = valeurs.expiration.match(/^(\d{1,2})\s*\/\s*(\d{2})$/);
    const maintenant = new Date();
    const fin = m ? new Date(2000 + Number(m[2]), Number(m[1]), 1) : null;
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) erreurs.set("expiration", "La date d'expiration, sous la forme MM/AA.");
    else if (fin <= maintenant) erreurs.set("expiration", "Cette carte a expiré.");
    if (!/^\d{3,4}$/.test(cvv)) erreurs.set("cvv", "Les 3 chiffres au dos de la carte.");
    return { methode, valeurs, erreurs, refusee: valeurs.numero === "4000000000000002" };
  }
  valeurs.numero = chiffres(f.get("numero_edinar")).slice(0, 16);
  const code = chiffres(f.get("code_edinar"));
  if (valeurs.numero.length !== 16) erreurs.set("numero_edinar", "Les 16 chiffres de la carte e-Dinar.");
  if (!/^\d{4,6}$/.test(code)) erreurs.set("code_edinar", "Le code secret de la carte (4 à 6 chiffres).");
  return { methode, valeurs, erreurs, refusee: valeurs.numero.endsWith("0002") };
}
const groupes = (n) => String(n ?? "").replace(/(\d{4})(?=\d)/g, "$1 ");
function champ({ id, nom, libelle, valeur = "", erreurs, attributs = "" }) {
  const e = erreurs.get(nom);
  return `<div class="champ${e ? " a-erreur" : ""}"><label for="${id}">${libelle}</label>
<input id="${id}" name="${nom}" value="${echappe(valeur)}" ${attributs}${e ? ` aria-invalid="true" aria-describedby="${id}-e"` : ""}>
${e ? `<p class="erreur" id="${id}-e">${echappe(e)}</p>` : ""}</div>`;
}
function page(res, p, s, statut) {
  const v = s.valeurs ?? {};
  const err = s.erreurs ?? new Map();
  const carte = s.methode !== "edinar";
  const premiere = [...err.keys()][0];
  res.writeHead(statut, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(`<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Paiement sécurisé — ${echappe(p.description)}</title>
<style>
*{box-sizing:border-box}body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;min-height:100vh;background:#f2f4f8;color:#141a2e}
.cadre{max-width:27rem;margin:0 auto;padding:1.25rem 1rem 2rem}
.tete{display:flex;align-items:center;gap:.5rem;font-size:.8125rem;color:#5b6378;margin-bottom:1rem}.tete svg{flex:none}
.carte-paiement{background:#fff;border-radius:16px;box-shadow:0 1px 2px #141a2e14,0 8px 28px #141a2e12;padding:1.5rem}
.commande{margin:0;color:#5b6378;font-size:.9375rem}.montant{margin:.25rem 0 1.25rem;font-size:2rem;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.montant small{font-size:1rem;font-weight:600;color:#5b6378}
fieldset{border:0;margin:0 0 1.25rem;padding:0}legend{font-weight:600;font-size:.9375rem;margin-bottom:.5rem}
.methodes{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
.methodes label{display:flex;align-items:center;gap:.5rem;padding:.75rem .875rem;border:1.5px solid #d6dae4;border-radius:12px;cursor:pointer;font-weight:600;font-size:.9375rem}
.methodes label:has(input:checked){border-color:#2347e8;background:#f3f6ff}.methodes input{accent-color:#2347e8;margin:0}
.methodes label:has(input:focus-visible){outline:2px solid #2347e8;outline-offset:2px}
main:has(input[value=carte]:checked) .bloc-edinar,main:has(input[value=edinar]:checked) .bloc-carte{display:none}
.champ{display:grid;gap:.25rem;margin-bottom:.875rem}.champ label{font-size:.875rem;font-weight:600}
.champ input{font:inherit;font-size:1rem;padding:.75rem .875rem;border:1.5px solid #c9cedb;border-radius:10px;background:#fff;color:inherit;width:100%;font-variant-numeric:tabular-nums}
.champ input:focus{outline:none;border-color:#2347e8;box-shadow:0 0 0 3px #2347e833}
.a-erreur input{border-color:#c62828}.erreur{margin:0;color:#b71c1c;font-size:.8125rem}
.ligne{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
.refus{margin:0 0 1rem;padding:.75rem .875rem;border-radius:10px;background:#fdecea;color:#8a1c1c;font-size:.9375rem}
.payer{display:block;width:100%;font:inherit;font-weight:700;font-size:1.0625rem;padding:.9rem;border:0;border-radius:12px;background:#2347e8;color:#fff;cursor:pointer}
.payer:hover{background:#1b3bc9}.payer:focus-visible,.annuler:focus-visible{outline:2px solid #141a2e;outline-offset:2px}
.annuler{display:block;width:100%;margin-top:.5rem;font:inherit;font-size:.9375rem;padding:.75rem;border:0;border-radius:12px;background:transparent;color:#3a4256;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.essai{margin-top:1.25rem;padding:.75rem .875rem;border:1px dashed #b9c0d0;border-radius:10px;font-size:.8125rem;color:#4a5268}
.essai b{font-variant-numeric:tabular-nums}.essai p{margin:.125rem 0}
</style>
<div class="cadre">
<p class="tete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Paiement sécurisé · simulation locale de Konnect</p>
<main class="carte-paiement">
<p class="commande">${echappe(p.description)}</p>
<p class="montant">${dinars(p.montant)} <small>TND</small></p>
${s.refus ? `<p class="refus" role="alert">${echappe(s.refus)}</p>` : ""}
<form method="post" novalidate>
<fieldset><legend>Payer par</legend><div class="methodes">
<label><input type="radio" name="methode" value="carte"${carte ? " checked" : ""}> Carte bancaire</label>
<label><input type="radio" name="methode" value="edinar"${carte ? "" : " checked"}> e-Dinar</label>
</div></fieldset>
<div class="bloc-carte">
${champ({ id: "titulaire", nom: "titulaire", libelle: "Nom sur la carte", valeur: v.titulaire, erreurs: err, attributs: 'autocomplete="cc-name" autocapitalize="characters"' })}
${champ({ id: "numero", nom: "numero", libelle: "Numéro de carte", valeur: groupes(v.numero), erreurs: err, attributs: 'inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" maxlength="23"' })}
<div class="ligne">
${champ({ id: "expiration", nom: "expiration", libelle: "Expiration", valeur: v.expiration, erreurs: err, attributs: 'inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" maxlength="5"' })}
${champ({ id: "cvv", nom: "cvv", libelle: "Code de sécurité", erreurs: err, attributs: 'inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4"' })}
</div></div>
<div class="bloc-edinar">
${champ({ id: "numero_edinar", nom: "numero_edinar", libelle: "Numéro de la carte e-Dinar", valeur: groupes(v.numero), erreurs: err, attributs: 'inputmode="numeric" placeholder="1234 5678 9012 3456" maxlength="19"' })}
${champ({ id: "code_edinar", nom: "code_edinar", libelle: "Code secret", erreurs: err, attributs: 'type="password" inputmode="numeric" maxlength="6"' })}
</div>
<button class="payer" type="submit" name="choix" value="payer">Payer ${dinars(p.montant)} TND</button>
<button class="annuler" type="submit" name="choix" value="annuler" formnovalidate>Annuler et revenir à la boutique</button>
</form>
<div class="essai bloc-carte"><p><b>Cartes d'essai</b> (rien n'est prélevé) :</p><p><b>4242 4242 4242 4242</b> acceptée · <b>4000 0000 0000 0002</b> refusée</p><p>Toute date à venir, tout code à 3 chiffres.</p></div>
<div class="essai bloc-edinar"><p><b>e-Dinar d'essai</b> (rien n'est prélevé) :</p><p>Tout numéro à 16 chiffres et tout code à 4 chiffres ; un numéro qui finit par <b>0002</b> est refusé.</p></div>
</main></div>
<script>
// Le numéro par groupes de quatre, la date avec sa barre, au fil de la frappe.
for (const id of ["numero", "numero_edinar"]) {
  const c = document.getElementById(id);
  c?.addEventListener("input", () => { const n = c.value.replace(/\\D/g, "").slice(0, id === "numero" ? 19 : 16); c.value = n.replace(/(\\d{4})(?=\\d)/g, "$1 "); });
}
const e = document.getElementById("expiration");
e?.addEventListener("input", (ev) => { const n = e.value.replace(/\\D/g, "").slice(0, 4); e.value = n.length > 2 || (n.length === 2 && ev.inputType !== "deleteContentBackward") ? n.slice(0, 2) + "/" + n.slice(2) : n; });
${premiere ? `document.getElementById(${JSON.stringify(premiere)})?.focus();` : ""}
</script></html>`);
}
