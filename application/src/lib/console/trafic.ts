import { clientService } from "./service";

/* ============================================================================
   LE TRAFIC — ce que Cloudflare a servi, lu chez lui, heure par heure
   (migration …_trafic). L'API GraphQL des analyses, avec une clé en
   lecture seule (Account Analytics: Read) : les appels des Workers de
   SkanEcom sur les 25 dernières heures — requêtes, erreurs, sous-requêtes,
   temps de calcul (médiane, 99e centile). Rien n'est modifié chez
   Cloudflare. Chaque heure, à la 17e minute (son propre déclencheur,
   cloudflare.config.ts : à l'heure pile, l'API des analyses est encombrée
   par toutes les tâches planifiées et l'heure écoulée n'y est pas encore
   close — le premier relevé, à 00:00, n'avait pas eu de réponse en dix
   secondes, quand la même lecture répondait en 0,4 s à 00:11), et à la
   demande (État technique → Trafic).

   Secret CLOUDFLARE_TRAFIC = « compte:<id du compte>:<jeton> », « relais »
   en local (outils/cloudflare-dev.mjs simule la réponse), « aucun » sinon.
   ========================================================================== */

export type ModeTrafic = "reel" | "local" | "aucun";
/** Le Worker de l'application : il sert toutes les boutiques (les autres sont les routeurs de l'aperçu). */
export const APPLICATION = "skanecom-application";
const API = "https://api.cloudflare.com/client/v4/graphql";
const ATTENTE = 20_000;

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

// Une date telle que Cloudflare l'écrit (à la seconde, sans millièmes).
const date = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** Ce que dit une réponse en erreur : une clé refusée (Cloudflare répond 400,
 *  « Authentication failed », pour une clé inconnue), sinon son message. */
function lireRefus(statut: number, json: unknown): string {
  const e = (json as { errors?: { code?: number; message?: string }[] } | null)?.errors?.[0];
  if (statut === 401 || statut === 403 || e?.code === 9106 || e?.code === 10000 || /authenticat/i.test(e?.message ?? "")) return `Clé refusée (HTTP ${statut})`;
  return `Cloudflare répond HTTP ${statut}${e?.message ? ` : ${String(e.message).slice(0, 160)}` : ""}`;
}

/** Une lecture des 25 dernières heures chez Cloudflare. Ne lève jamais. */
async function lireUneFois(c: ReturnType<typeof configTrafic>, maintenant: Date): Promise<Releve & { reessayer: boolean }> {
  const url = c.mode === "local" ? `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")}/cloudflare-dev/client/v4/graphql` : API;
  const jusque = new Date(maintenant);
  const depuis = new Date(jusque.getTime() - 25 * 3600_000);
  depuis.setUTCMinutes(0, 0, 0);
  const debut = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${c.jeton}`, "content-type": "application/json", "user-agent": "SkanEcom-trafic/1" },
      body: JSON.stringify({ query: REQUETE, variables: { compte: c.compte, depuis: date(depuis), jusque: date(jusque) } }),
      signal: AbortSignal.timeout(ATTENTE),
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) return { mode: c.mode, ok: false, detail: lireRefus(r.status, json), heures: [], reessayer: r.status >= 500 || r.status === 429 };
    const lu = lireReponse(json);
    return lu.ok ? { mode: c.mode, ok: true, detail: null, heures: lu.heures, reessayer: false } : { mode: c.mode, ok: false, detail: lu.raison, heures: [], reessayer: false };
  } catch (e) {
    const nom = (e as { name?: string })?.name;
    const attente = nom === "TimeoutError" || nom === "AbortError";
    return { mode: c.mode, ok: false, detail: attente ? `Pas de réponse en ${ATTENTE / 1000} secondes` : `Cloudflare injoignable (après ${((Date.now() - debut) / 1000).toFixed(1)} s)`, heures: [], reessayer: true };
  }
}

/** Lire les 25 dernières heures chez Cloudflare ; `essais` : une lenteur ou
 *  une panne passagère de l'API se retente (le relevé de l'heure en a deux). Ne lève jamais. */
export async function lireTrafic(maintenant = new Date(), essais = 1): Promise<Releve> {
  const c = configTrafic();
  if (c.mode === "aucun") return { mode: "aucun", ok: null, detail: "Non branché : posez la clé en lecture (CLOUDFLARE_TRAFIC).", heures: [] };
  let lu = await lireUneFois(c, maintenant);
  for (let n = 1; n < essais && lu.reessayer; n++) {
    await new Promise((ok) => setTimeout(ok, 3000));
    const second = await lireUneFois(c, new Date());
    lu = second.ok ? second : { ...second, detail: `${second.detail} (${n + 1} essais)` };
  }
  return { mode: lu.mode, ok: lu.ok, detail: lu.detail, heures: lu.heures };
}

/** Lire et noter (le relevé de l'heure, « Relire maintenant »). Ne lève jamais. */
export async function releverTrafic(essais = 1): Promise<Releve> {
  const releve = await lireTrafic(new Date(), essais);
  try {
    await clientService().rpc("trafic_noter", { p_mode: releve.mode, p_ok: releve.ok, p_detail: releve.detail, p_heures: releve.heures });
  } catch { /* le tour suivant le notera */ }
  return releve;
}
