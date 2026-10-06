// Tient lieu, en local, de l'API des domaines de Resend (COURRIELS_ENVOI=relais) :
// la console y ajoute le domaine d'envoi d'une boutique, lit les
// enregistrements DNS à poser, demande la vérification
// (src/lib/courriels/domaines.ts parle à ce relais comme à Resend).
//   POST /email-dev/resend/domains               { name, region }
//   GET  /email-dev/resend/domains               { data: [...] }
//   GET  /email-dev/resend/domains/<id>
//   POST /email-dev/resend/domains/<id>/verify
// Un domaine ajouté attend ; la vérification le dit vérifié — sauf un
// domaine dont le nom contient « echec » (refusé) ou « attente » (toujours
// en attente), pour essayer chaque état. Gardé en mémoire : jamais en production.
export const PREFIXE = "/email-dev/resend";
const DOMAINES = new Map(); // id → domaine
let suivant = 1;

function enregistrements(nom, etat) {
  return [
    { record: "SPF", name: `send.${nom}`, type: "MX", ttl: "Auto", status: etat, value: "feedback-smtp.eu-west-1.exemple-dev.tn", priority: 10 },
    { record: "SPF", name: `send.${nom}`, type: "TXT", ttl: "Auto", status: etat, value: "v=spf1 include:exemple-dev.tn ~all" },
    { record: "DKIM", name: `resend._domainkey.${nom}`, type: "TXT", ttl: "Auto", status: etat, value: `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEV${nom.replace(/\W/g, "").toUpperCase()}IDAQAB` },
  ];
}

const json = (res, statut, corps) => res.writeHead(statut, { "content-type": "application/json" }).end(JSON.stringify(corps));

export function resendDev(req, res) {
  const chemin = req.url.slice(PREFIXE.length).split("?")[0];
  let corps = "";
  req.on("data", (m) => (corps += m));
  req.on("end", () => {
    if (!/^Bearer \S+/.test(String(req.headers.authorization ?? ""))) return json(res, 401, { name: "missing_api_key", message: "Clé absente" });
    if (chemin === "/domains" && req.method === "GET") {
      return json(res, 200, { data: [...DOMAINES.values()].map(({ records, ...d }) => d) });
    }
    if (chemin === "/domains" && req.method === "POST") {
      let nom = "";
      try { nom = String(JSON.parse(corps || "{}").name ?? "").toLowerCase(); } catch { /* illisible */ }
      if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(nom)) return json(res, 422, { name: "validation_error", message: "Nom de domaine illisible" });
      if ([...DOMAINES.values()].some((d) => d.name === nom)) return json(res, 403, { name: "validation_error", message: `${nom} has already been registered` });
      const d = { object: "domain", id: `dom_dev_${suivant++}`, name: nom, status: "not_started", created_at: new Date().toISOString(),
        region: "eu-west-1", records: enregistrements(nom, "not_started") };
      DOMAINES.set(d.id, d);
      return json(res, 200, d);
    }
    const m = chemin.match(/^\/domains\/([\w-]+)(\/verify)?$/);
    const d = m ? DOMAINES.get(m[1]) : null;
    if (m && !d) return json(res, 404, { name: "not_found", message: "Domain not found" });
    if (m && !m[2] && req.method === "GET") return json(res, 200, d);
    if (m && m[2] && req.method === "POST") {
      const etat = d.name.includes("echec") ? "failed" : d.name.includes("attente") ? "pending" : "verified";
      d.status = etat;
      d.records = enregistrements(d.name, etat);
      return json(res, 200, { object: "domain", id: d.id });
    }
    return json(res, 404, { name: "not_found", message: "Route inconnue" });
  });
}
