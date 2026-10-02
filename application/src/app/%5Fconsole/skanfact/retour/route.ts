import { accesEquipe } from "@/lib/console/session";
import { clientService } from "@/lib/console/service";
import { COOKIE_ETAT_SKANFACT, adresseSkanFact, secretPartenaire } from "@/lib/console/skanfact";
import { chiffrer } from "@/lib/gestion/chiffre";
import { enFond, envoyerFile } from "@/lib/gestion/skanfact";

/* ============================================================================
   LA PAGE DE RETOUR DE « CONNECTER SKANFACT » (B0) — l'adresse exacte que
   SkanFact a déclarée pour SkanEcom : https://<console>/skanfact/retour, sans
   paramètres. SkanFact y renvoie le commerçant avec ?code=…&etat=…, ou
   ?erreur=refusee&etat=… s'il a refusé.
   1. L'état doit être le nôtre : celui du cookie de CE navigateur, et celui
      que la base garde pour CE membre, depuis moins de dix minutes (consommé
      une fois). Sinon, rien.
   2. Le code s'échange ici, au SERVEUR (jamais dans le navigateur), avec le
      secret de SkanEcom : POST /v1/partenaires/skanecom/echanger →
      { cle, entreprise, nom, gestes, expireLe } (la clé vaut un an).
   3. La clé est chiffrée (src/lib/gestion/chiffre.ts) avant d'entrer dans la
      base ; le commerçant lit « Connecté à <nom> ».
   ========================================================================== */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const effacer = `${COOKIE_ETAT_SKANFACT}=; Path=/skanfact/retour; Max-Age=0; HttpOnly; SameSite=Lax`;

const versPage = (chemin: string, params: Record<string, string>) =>
  new Response(null, {
    status: 303,
    headers: { location: `${chemin}?${new URLSearchParams(params)}`, "cache-control": "no-store", "set-cookie": effacer },
  });

function cookie(req: Request, nom: string): string | null {
  for (const morceau of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = morceau.trim().split("=");
    if (k === nom) return v.join("=");
  }
  return null;
}

/** Deux textes égaux, comparés sans dire où ils diffèrent. */
function egaux(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const etat = (q.get("etat") ?? "").slice(0, 200);
  const garde = cookie(req, COOKIE_ETAT_SKANFACT) ?? "";
  // 1. L'état : celui de ce navigateur…
  if (!etat || !garde || !egaux(etat, garde)) return versPage("/skanfact/refus", { raison: "etat" });
  const a = await accesEquipe();
  if (a.etat === "anonyme") return versPage("/skanfact/refus", { raison: "session" });
  if (a.etat === "aal1") return versPage("/skanfact/refus", { raison: "session" });
  // … et celui que la base garde pour ce membre (dix minutes, une fois).
  const service = clientService();
  const { data: trouve } = await service.rpc("skanfact_retrouver_etat", { p_etat: etat, p_user: a.user.id });
  const b = trouve as { boutique_id: string; slug: string } | null;
  if (!b) return versPage("/skanfact/refus", { raison: "etat" });
  const page = `/gestion/${b.slug}/skanfact`;
  const membre = a.etat === "ok" ? a.boutiques.find((m) => m.boutique_id === b.boutique_id) : undefined;
  if (!membre || !["proprietaire", "admin"].includes(membre.role)) {
    return versPage("/skanfact/refus", { raison: "role" });
  }
  if (q.get("erreur")) {
    return versPage(page, { erreur: q.get("erreur") === "refusee"
      ? "Vous avez refusé la connexion dans SkanFact : rien n'a changé."
      : "SkanFact n'a pas autorisé la connexion : rien n'a changé." });
  }
  const code = q.get("code") ?? "";
  if (code.length < 20 || code.length > 200) return versPage(page, { erreur: "SkanFact n'a pas rendu de code valable : recommencez." });

  // 2. L'échange du code, au serveur, avec le secret de SkanEcom.
  const url = adresseSkanFact();
  const secret = secretPartenaire();
  if (!url || !secret) return versPage(page, { erreur: "SkanFact n'est pas encore branché sur la plateforme : SkanEcom s'en occupe." });
  let r: Response;
  try {
    r = await fetch(`${url}/v1/partenaires/skanecom/echanger`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return versPage(page, { erreur: "SkanFact ne répond pas : recommencez dans un instant." });
  }
  let d: Record<string, unknown> = {};
  try {
    d = (await r.json()) as Record<string, unknown>;
  } catch {
    // corps illisible : le statut suffit
  }
  if (r.status === 401) return versPage(page, { erreur: "SkanFact ne reconnaît pas SkanEcom (le secret de la plateforme) : SkanEcom s'en occupe, rien n'a changé." });
  if (r.status === 400) return versPage(page, { erreur: "Ce code de SkanFact ne vaut plus (il a déjà servi, ou plus de dix minutes ont passé) : recommencez." });
  if (!r.ok) return versPage(page, { erreur: "SkanFact ne répond pas pour l'instant : recommencez dans un instant." });
  const cle = typeof d.cle === "string" ? d.cle : "";
  const entreprise = typeof d.entreprise === "string" && UUID.test(d.entreprise) ? d.entreprise.toLowerCase() : "";
  const nom = typeof d.nom === "string" ? d.nom.trim().slice(0, 300) : "";
  const gestes = Array.isArray(d.gestes) ? d.gestes.filter((g): g is string => typeof g === "string").slice(0, 30) : [];
  const expire = typeof d.expireLe === "string" && !Number.isNaN(Date.parse(d.expireLe)) ? new Date(d.expireLe).toISOString() : "";
  if (cle.length < 20 || cle.length > 500 || !entreprise || !nom || !expire) {
    return versPage(page, { erreur: "SkanFact a répondu de façon inattendue : recommencez, et prévenez SkanEcom si cela se répète." });
  }
  if (!gestes.includes("ventes.boutique.facturer")) {
    return versPage(page, { erreur: "La clé que SkanFact a donnée ne permet pas de facturer les commandes de la boutique : rien n'a changé." });
  }

  // 3. La clé chiffrée, la boutique connectée.
  const chiffree = await chiffrer(cle, b.boutique_id);
  if (!chiffree) return versPage(page, { erreur: "La plateforme ne peut pas encore garder de clé (le chiffrement n'est pas posé) : SkanEcom s'en occupe." });
  const { error } = await service.rpc("skanfact_connecter", {
    p_boutique_id: b.boutique_id, p_user: a.user.id, p_entreprise: entreprise, p_nom: nom, p_gestes: gestes,
    p_cle_chiffree: chiffree, p_expire_le: expire,
  });
  if (error) return versPage(page, { erreur: `La connexion n'a pas pu être enregistrée : ${error.message}` });
  // Ce qui attendait (une boutique reconnectée) part, sans faire attendre le commerçant.
  enFond(envoyerFile(b.boutique_id));
  return versPage(page, { ok: `Connecté à ${nom}.` });
}
