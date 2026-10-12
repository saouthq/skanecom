import { clientService } from "./service";
import { configSkanFact, chercherClients } from "./skanfact";
import { configDomaines } from "./domaines-cloudflare";
import { lireEnvoi } from "@/lib/courriels/envoi";
import { lireSms } from "@/lib/sms/envoi";
import { joindreKonnect } from "@/lib/paiement/konnect";

/* ============================================================================
   LES FOURNISSEURS — un appel inoffensif à chacun : rien n'est envoyé,
   rien n'est créé. Il dit s'il répond, en combien de temps, et sinon
   pourquoi (« clé refusée », « injoignable »). Chaque heure (le passage de
   la surveillance) et à la demande (État technique → Fournisseurs).
   En local, les simulateurs du relais répondent à leur place.
   ========================================================================== */

export type CleFournisseur = "courriels" | "sms" | "skanfact" | "konnect" | "cloudflare";
export type Essai = { cle: CleFournisseur; mode: "reel" | "local" | "apercu" | "aucun"; ok: boolean | null; duree_ms: number | null; detail: string | null };

const relais = () => (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const ATTENTE = 8000;

/** Un appel HTTP chronométré : le statut, ou la raison de l'échec. */
async function appeler(url: string, init: RequestInit = {}): Promise<{ statut: number | null; duree: number; raison: string | null }> {
  const debut = Date.now();
  try {
    const r = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(ATTENTE) });
    await r.body?.cancel().catch(() => {});
    return { statut: r.status, duree: Date.now() - debut, raison: null };
  } catch (e) {
    const nom = (e as { name?: string })?.name;
    return { statut: null, duree: Date.now() - debut, raison: nom === "TimeoutError" || nom === "AbortError" ? `Pas de réponse en ${ATTENTE / 1000} secondes` : "Injoignable" };
  }
}

/** Ce que veut dire un statut : 2xx répond, 401/403 refuse la clé, le reste en clair. */
function lire(cle: CleFournisseur, mode: Essai["mode"], r: Awaited<ReturnType<typeof appeler>>, bon = (s: number) => s >= 200 && s < 300): Essai {
  if (r.statut === null) return { cle, mode, ok: false, duree_ms: r.duree, detail: r.raison };
  if (bon(r.statut)) return { cle, mode, ok: true, duree_ms: r.duree, detail: null };
  if (r.statut === 401 || r.statut === 403) return { cle, mode, ok: false, duree_ms: r.duree, detail: `Clé refusée (HTTP ${r.statut})` };
  return { cle, mode, ok: false, duree_ms: r.duree, detail: `Répond HTTP ${r.statut}` };
}

async function courriels(): Promise<Essai> {
  const { fournisseur, cle } = lireEnvoi(process.env.COURRIELS_ENVOI ?? "");
  if (fournisseur === "resend") return lire("courriels", "reel", await appeler("https://api.resend.com/domains", { headers: { authorization: `Bearer ${cle}` } }));
  if (fournisseur === "brevo") return lire("courriels", "reel", await appeler("https://api.brevo.com/v3/account", { headers: { "api-key": cle, accept: "application/json" } }));
  if (fournisseur === "relais") return lire("courriels", "local", await appeler(`${relais()}/email-dev/resend/domains`, { headers: { authorization: "Bearer relais-local" } }));
  if (fournisseur === "apercu") return { cle: "courriels", mode: "apercu", ok: null, duree_ms: null, detail: "Aperçu : les e-mails sont gardés pour la console, rien ne part." };
  return { cle: "courriels", mode: "aucun", ok: false, duree_ms: null, detail: "Aucun fournisseur : aucun e-mail ne part (COURRIELS_ENVOI)." };
}

async function sms(): Promise<Essai> {
  const { fournisseur, parties } = lireSms(process.env.SMS_ENVOI ?? "");
  if (fournisseur === "twilio") {
    const [compte = "", jeton = ""] = parties;
    const r = await appeler(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(compte)}.json`, {
      headers: { authorization: `Basic ${btoa(`${compte}:${jeton}`)}` },
    });
    return lire("sms", "reel", r);
  }
  if (fournisseur === "relais") return { cle: "sms", mode: "local", ok: null, duree_ms: null, detail: "Local : les SMS vont au journal du relais (.outils/sms.log)." };
  return { cle: "sms", mode: "aucun", ok: null, duree_ms: null, detail: "Non branché : les codes passent par Supabase Auth (SMS_ENVOI « aucun »)." };
}

async function skanfact(): Promise<Essai> {
  const c = configSkanFact();
  if (!c) return { cle: "skanfact", mode: "aucun", ok: null, duree_ms: null, detail: "Non branché (SKANFACT_URL « aucune »)." };
  const mode = /^http:\/\/(127\.0\.0\.1|localhost)/.test(c.url) ? "local" : "reel";
  const debut = Date.now();
  // Une recherche de client sans résultat : la clé est lue, rien n'est créé.
  const r = await chercherClients(c, "skanecom-essai");
  const duree = Date.now() - debut;
  if (r.ok) return { cle: "skanfact", mode, ok: true, duree_ms: duree, detail: null };
  if (r.statut === 401 || r.statut === 403) return { cle: "skanfact", mode, ok: false, duree_ms: duree, detail: `Clé refusée (HTTP ${r.statut})` };
  return { cle: "skanfact", mode, ok: false, duree_ms: duree, detail: r.raison.slice(0, 200) };
}

async function konnect(): Promise<Essai> {
  // Chaque boutique a sa clé : on vérifie que l'API de Konnect répond (sans clé, elle refuse — c'est la réponse attendue).
  const r = await joindreKonnect();
  const local = /^http:\/\/(127\.0\.0\.1|localhost)/.test(relais());
  if (r.statut === null) return { cle: "konnect", mode: local ? "local" : "reel", ok: false, duree_ms: r.duree, detail: r.raison };
  return { cle: "konnect", mode: local ? "local" : "reel", ok: r.statut < 500, duree_ms: r.duree, detail: r.statut < 500 ? null : `Répond HTTP ${r.statut}` };
}

async function cloudflare(): Promise<Essai> {
  const { saas } = configDomaines();
  if (saas.mode === "cloudflare") {
    return lire("cloudflare", "reel", await appeler(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(saas.id)}`, { headers: { authorization: `Bearer ${saas.jeton}` } }));
  }
  if (saas.mode === "relais") {
    return lire("cloudflare", "local", await appeler(`${relais()}/cloudflare-dev/client/v4/zones/dev/custom_hostnames?hostname=essai.local`, { headers: { authorization: `Bearer ${saas.jeton}` } }));
  }
  return { cle: "cloudflare", mode: "aucun", ok: null, duree_ms: null, detail: "Non branché : les domaines se branchent à la main (CLOUDFLARE_DOMAINES « aucun »)." };
}

/** Essayer chaque fournisseur (ensemble, chacun huit secondes au plus), et noter le tour. Ne lève jamais. */
export async function essayerFournisseurs(): Promise<Essai[]> {
  const essayeurs: [CleFournisseur, () => Promise<Essai>][] = [["courriels", courriels], ["sms", sms], ["skanfact", skanfact], ["konnect", konnect], ["cloudflare", cloudflare]];
  const essais = await Promise.all(essayeurs.map(([cle, essayer]) =>
    essayer().catch((e): Essai => ({ cle, mode: "aucun", ok: false, duree_ms: null, detail: String(e).slice(0, 200) }))));
  try {
    await clientService().rpc("fournisseurs_noter", { p_essais: essais });
  } catch { /* le tour suivant les notera */ }
  return essais;
}
