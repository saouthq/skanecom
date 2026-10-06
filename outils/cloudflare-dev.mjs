// Tient lieu, en local, de l'API de Cloudflare pour les domaines des
// boutiques (src/lib/console/domaines-cloudflare.ts lui parle comme à
// api.cloudflare.com, CLOUDFLARE_API=relais) :
//   · Cloudflare for SaaS — brancher le domaine qu'un commerçant possède
//     déjà (un .tn acheté chez un registrar tunisien) :
//       POST /cloudflare-dev/client/v4/zones/<zone>/custom_hostnames   { hostname, ssl }
//       GET  /cloudflare-dev/client/v4/zones/<zone>/custom_hostnames?hostname=<h>
//     Le nom attend (« pending ») ses deux enregistrements ; relu, il est
//     actif — sauf un nom qui contient « attente » (toujours en attente) ou
//     « echec » (refusé), pour essayer chaque état.
//   · Registrar — en acheter un :
//       POST /cloudflare-dev/client/v4/accounts/<compte>/registrar/domain-check   { domains: [...] }
//       POST /cloudflare-dev/client/v4/accounts/<compte>/registrar/registrations  { domain_name }
//     Un .tn n'est pas vendu par Cloudflare (« extension_not_supported ») ;
//     un nom qui contient « pris » est déjà pris ; le prix suit l'extension.
// Gardé en mémoire : jamais en production.
export const PREFIXE = "/cloudflare-dev/client/v4";
const NOMS = new Map(); // nom → nom personnalisé
const ACHETES = new Set();
let suivant = 1;

const PRIX = { com: "10.44", net: "11.84", org: "10.11", shop: "1.50", store: "2.20", online: "1.80", app: "14.20", dev: "12.20" };
const json = (res, statut, corps) => res.writeHead(statut, { "content-type": "application/json" }).end(JSON.stringify(corps));
const ok = (res, result) => json(res, 200, { success: true, errors: [], messages: [], result });
const refus = (res, statut, code, message) => json(res, statut, { success: false, errors: [{ code, message }], messages: [], result: null });

const lisible = (nom) => /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(nom);

/** Ce que Cloudflare rend pour un nom personnalisé (le strict nécessaire). */
function vue(n) {
  return {
    id: n.id, hostname: n.hostname, status: n.status, created_at: n.cree,
    ownership_verification: { type: "txt", name: `_cf-custom-hostname.${n.hostname}`, value: n.jeton },
    ssl: { status: n.status === "active" ? "active" : "pending_validation", method: "http", type: "dv" },
    verification_errors: n.status === "blocked" ? ["Le nom ne pointe pas vers la plateforme (CNAME absent)."] : [],
  };
}

export function cloudflareDev(req, res) {
  const [chemin, requete] = req.url.slice(PREFIXE.length).split("?");
  let corps = "";
  req.on("data", (m) => (corps += m));
  req.on("end", () => {
    if (!/^Bearer \S{8,}/.test(String(req.headers.authorization ?? ""))) return refus(res, 403, 10000, "Authentication error");
    let entree = {};
    try { entree = JSON.parse(corps || "{}"); } catch { return refus(res, 400, 1001, "Invalid JSON"); }

    // ---- Cloudflare for SaaS ----
    if (/^\/zones\/[\w-]+\/custom_hostnames$/.test(chemin)) {
      if (req.method === "POST") {
        const nom = String(entree.hostname ?? "").toLowerCase();
        if (!lisible(nom)) return refus(res, 400, 1409, "Invalid custom hostname");
        if (NOMS.has(nom)) return refus(res, 409, 1406, "Duplicate custom hostname found.");
        const n = { id: `ch_dev_${suivant++}`, hostname: nom, status: "pending", cree: new Date().toISOString(), jeton: crypto.randomUUID() };
        NOMS.set(nom, n);
        return ok(res, vue(n));
      }
      if (req.method === "GET") {
        const nom = new URLSearchParams(requete ?? "").get("hostname") ?? "";
        const n = NOMS.get(nom.toLowerCase());
        if (n && n.status === "pending") n.status = nom.includes("echec") ? "blocked" : nom.includes("attente") ? "pending" : "active";
        return ok(res, n ? [vue(n)] : []);
      }
    }

    // ---- Registrar ----
    if (/^\/accounts\/[\w-]+\/registrar\/domain-check$/.test(chemin) && req.method === "POST") {
      const domaines = (Array.isArray(entree.domains) ? entree.domains : []).slice(0, 20).map((d) => String(d).toLowerCase());
      return ok(res, {
        domains: domaines.map((name) => {
          const ext = name.split(".").pop();
          if (!lisible(name)) return { name, registrable: false, reason: "domain_unavailable" };
          if (ext === "tn") return { name, registrable: false, reason: "extension_not_supported" };
          if (!PRIX[ext]) return { name, registrable: false, reason: "extension_not_supported_via_api" };
          if (name.includes("pris") || ACHETES.has(name)) return { name, registrable: false, reason: "domain_unavailable" };
          return { name, registrable: true, tier: "standard", pricing: { currency: "USD", registration_cost: PRIX[ext], renewal_cost: PRIX[ext] } };
        }),
      });
    }
    if (/^\/accounts\/[\w-]+\/registrar\/registrations$/.test(chemin) && req.method === "POST") {
      const name = String(entree.domain_name ?? "").toLowerCase();
      const ext = name.split(".").pop();
      if (!lisible(name) || !PRIX[ext]) return refus(res, 400, 1002, "Extension not supported");
      if (name.includes("pris") || ACHETES.has(name)) return refus(res, 409, 1003, "Domain unavailable");
      ACHETES.add(name);
      return ok(res, { domain_name: name, status: "completed", auto_renew: false, created_at: new Date().toISOString() });
    }
    return refus(res, 404, 7003, "No route for that URI");
  });
}
