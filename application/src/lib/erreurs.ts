/* ============================================================================
   LES ERREURS DE L'APPLICATION — ce que le serveur note quand une page ou
   une route casse (instrumentation.ts), et ce qu'une page cassée au
   navigateur signale (les écrans d'erreur, par /erreur). La base les
   regroupe (public.erreurs_noter, migration …_erreurs_application) ; la
   console les montre (État technique → Erreurs de l'application).

   Noter ne doit jamais aggraver la panne : un appel direct à l'API de la
   base (sans client Supabase à charger), trois secondes au plus, et aucune
   exception qui remonte. Rien de personnel ne part : ni en-têtes, ni corps,
   ni requête de l'adresse — la surface, la boutique, la route, le chemin,
   le message et le début de la pile.
   ========================================================================== */

export type Surface = "vitrine" | "backoffice" | "console" | "serveur";

/** Ce que Next.js lance pour se diriger lui-même (une redirection, une page
 *  introuvable, un rendu à refaire au navigateur) : pas des erreurs. */
const CONTROLE = /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/;
export function estControle(e: unknown): boolean {
  const o = e as { digest?: unknown; message?: unknown } | null;
  return (typeof o?.digest === "string" && CONTROLE.test(o.digest)) || (typeof o?.message === "string" && CONTROLE.test(o.message));
}

/** La surface et la boutique d'une adresse, réécrite (/_b/<boutique>/…,
 *  /_console/gestion/<boutique>/…) ou telle que tapée (/gestion/<boutique>/…). */
export function lieuDe(chemin: string, route?: string | null): { surface: Surface; slug: string | null } {
  const c = (chemin.split(/[?#]/)[0] || "/").replace(/^\/_console(?=\/|$)/, "");
  const r = route ?? "";
  const vitrine = c.match(/^\/_b\/([^/]+)/);
  if (vitrine || r.startsWith("/_b/")) return { surface: "vitrine", slug: vitrine ? decodeURIComponent(vitrine[1]) : null };
  const gestion = c.match(/^\/gestion\/([^/]+)/);
  if (gestion || r.includes("/gestion/")) return { surface: "backoffice", slug: gestion ? decodeURIComponent(gestion[1]) : null };
  const fiche = c.match(/^\/boutiques\/([^/]+)/);
  if (r.startsWith("/_console") || fiche) return { surface: "console", slug: fiche ? decodeURIComponent(fiche[1]) : null };
  return { surface: "serveur", slug: null };
}

/** La référence d'une erreur du rendu, telle que l'écran d'erreur la montre :
 *  le digest que le rendu pose (djb2 du message et de la pile, comme Next.js
 *  et vinext), recalculé si l'erreur n'en porte pas. */
export function referenceDe(e: unknown): string {
  const o = e as { digest?: unknown } | null;
  if (typeof o?.digest === "string" && o.digest) return o.digest;
  const texte = e instanceof Error ? e.message + (e.stack || "") : String(e);
  let h = 5381;
  for (let i = texte.length - 1; i >= 0; i--) h = (h * 33) ^ texte.charCodeAt(i);
  return (h >>> 0).toString();
}

/** Une référence signalée par le navigateur : des chiffres, rien d'autre. */
export function referenceLue(v: unknown): string | null {
  return typeof v === "string" && /^\d{1,20}$/.test(v) ? v : null;
}
/** Le message d'une erreur du serveur signalée par le navigateur seul (le
 *  serveur n'a pas pu la noter : son détail est resté dans ses journaux). */
export const sansDetail = (reference: string) => `Erreur du serveur, signalée par le navigateur (référence ${reference}) : le détail n'a pas pu être noté.`;

/** Le début de la pile : ses dix premières lignes. */
export function pileCourte(pile: unknown): string | null {
  if (typeof pile !== "string" || !pile) return null;
  return pile.split("\n").slice(0, 10).join("\n").slice(0, 1500);
}

export type ErreurANoter = {
  surface: Surface; genre: "serveur" | "navigateur"; slug: string | null; hote: string | null;
  route: string | null; chemin: string | null; message: string; pile: string | null; digest: string | null;
};

export async function noterErreur(e: ErreurANoter): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle || !e.message) return;
  try {
    await fetch(`${url}/rest/v1/rpc/erreurs_noter`, {
      method: "POST",
      headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json" },
      body: JSON.stringify({
        p_surface: e.surface, p_genre: e.genre, p_slug: e.slug, p_hote: e.hote, p_route: e.route, p_chemin: e.chemin,
        p_message: e.message.slice(0, 500), p_pile: e.pile, p_digest: e.digest,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // (la base ne répond pas : l'erreur reste dans les journaux du Worker)
  }
}
