import { clientService } from "./service";

/* ============================================================================
   LE TRAFIC — ce que Cloudflare a servi, lu chez lui, heure par heure
   (migration …_trafic). L'API GraphQL des analyses, avec une clé en
   lecture seule (Account Analytics: Read) : les appels des Workers de
   SkanEcom sur les 25 dernières heures — requêtes, erreurs, sous-requêtes,
   temps de calcul (médiane, 99e centile). Rien n'est modifié chez
   Cloudflare. Chaque heure (le passage de la surveillance) et à la demande
   (État technique → Trafic).

   Secret CLOUDFLARE_TRAFIC = « compte:<id du compte>:<jeton> », « relais »
   en local (outils/cloudflare-dev.mjs simule la réponse), « aucun » sinon.
   ========================================================================== */

export type ModeTrafic = "reel" | "local" | "aucun";
/** Le Worker de l'application : il sert toutes les boutiques (les autres sont les routeurs de l'aperçu). */
export const APPLICATION = "skanecom-application";
const API = "https://api.cloudflare.com/client/v4/graphql";
const ATTENTE = 10_000;

export function configTrafic(): { mode: ModeTrafic; compte: string; jeton: string } {
  const s = (process.env.CLOUDFLARE_TRAFIC ?? "").trim();
  if (s === "relais") return { mode: "local", compte: "dev", jeton: "relais-local-cloudflare" };
  const [genre, compte, jeton] = s.split(":");
  return genre === "compte" && compte && jeton ? { mode: "reel", compte, jeton } : { mode: "aucun", compte: "", jeton: "" };
}

const REQUETE = `query Trafic($compte: string!, $depuis: Time!, $jusque: Time!) {
  viewer {
    accounts(filter: { accountTag: $compte }) {
      workersInvocationsAdaptive(limit: 5000, filter: { datetime_geq: $depuis, datetime_leq: $jusque }) {
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 }
        dimensions { datetimeHour scriptName }
      }
    }
  }
}`;

type Ligne = {
  sum?: { requests?: number; errors?: number; subrequests?: number };
  quantiles?: { cpuTimeP50?: number; cpuTimeP99?: number };
  dimensions?: { datetimeHour?: string; scriptName?: string };
};
export type HeureLue = { heure: string; script: string; principal: boolean; requetes: number; erreurs: number; sous_requetes: number; cpu_p50: number | null; cpu_p99: number | null };
export type Releve = { mode: ModeTrafic; ok: boolean | null; detail: string | null; heures: HeureLue[] };

const ms = (us: number | undefined) => (typeof us === "number" && Number.isFinite(us) ? Math.round(us / 10) / 100 : null);

/** Les heures que Cloudflare rend : les Workers de SkanEcom seuls (le compte en porte peut-être d'autres). */
export function lireReponse(json: unknown): { ok: true; heures: HeureLue[] } | { ok: false; raison: string } {
  const r = json as { data?: { viewer?: { accounts?: { workersInvocationsAdaptive?: Ligne[] }[] } } | null; errors?: { message?: string }[] | null };
  if (r?.errors?.length) return { ok: false, raison: `Cloudflare refuse la lecture : ${String(r.errors[0]?.message ?? "erreur").slice(0, 200)}` };
  const comptes = r?.data?.viewer?.accounts;
  if (!Array.isArray(comptes)) return { ok: false, raison: "Réponse illisible de Cloudflare." };
  if (comptes.length === 0) return { ok: false, raison: "Compte introuvable : l'identifiant du compte ne correspond pas à la clé." };
  const heures: HeureLue[] = [];
  for (const l of comptes[0]?.workersInvocationsAdaptive ?? []) {
    const script = l.dimensions?.scriptName ?? "";
    const heure = l.dimensions?.datetimeHour ?? "";
    if (!script.startsWith("skanecom-") || !heure) continue;
    heures.push({
      heure, script, principal: script === APPLICATION,
      requetes: Math.max(0, Math.round(l.sum?.requests ?? 0)), erreurs: Math.max(0, Math.round(l.sum?.errors ?? 0)),
      sous_requetes: Math.max(0, Math.round(l.sum?.subrequests ?? 0)),
      cpu_p50: ms(l.quantiles?.cpuTimeP50), cpu_p99: ms(l.quantiles?.cpuTimeP99),
    });
  }
  return { ok: true, heures };
}

/** Lire les 25 dernières heures chez Cloudflare. Ne lève jamais. */
export async function lireTrafic(maintenant = new Date()): Promise<Releve> {
  const c = configTrafic();
  if (c.mode === "aucun") return { mode: "aucun", ok: null, detail: "Non branché : posez la clé en lecture (CLOUDFLARE_TRAFIC).", heures: [] };
  const url = c.mode === "local" ? `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")}/cloudflare-dev/client/v4/graphql` : API;
  const jusque = new Date(maintenant);
  const depuis = new Date(jusque.getTime() - 25 * 3600_000);
  depuis.setUTCMinutes(0, 0, 0);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${c.jeton}`, "content-type": "application/json" },
      body: JSON.stringify({ query: REQUETE, variables: { compte: c.compte, depuis: depuis.toISOString(), jusque: jusque.toISOString() } }),
      signal: AbortSignal.timeout(ATTENTE),
    });
    if (r.status === 401 || r.status === 403) return { mode: c.mode, ok: false, detail: `Clé refusée (HTTP ${r.status})`, heures: [] };
    if (!r.ok) return { mode: c.mode, ok: false, detail: `Cloudflare répond HTTP ${r.status}`, heures: [] };
    const lu = lireReponse(await r.json().catch(() => null));
    return lu.ok ? { mode: c.mode, ok: true, detail: null, heures: lu.heures } : { mode: c.mode, ok: false, detail: lu.raison, heures: [] };
  } catch (e) {
    const nom = (e as { name?: string })?.name;
    return { mode: c.mode, ok: false, detail: nom === "TimeoutError" || nom === "AbortError" ? `Pas de réponse en ${ATTENTE / 1000} secondes` : "Cloudflare injoignable", heures: [] };
  }
}

/** Lire et noter (le passage de l'heure, « Relire maintenant »). Ne lève jamais. */
export async function releverTrafic(): Promise<Releve> {
  const releve = await lireTrafic();
  try {
    await clientService().rpc("trafic_noter", { p_mode: releve.mode, p_ok: releve.ok, p_detail: releve.detail, p_heures: releve.heures });
  } catch { /* le tour suivant le notera */ }
  return releve;
}
