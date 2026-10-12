/* ============================================================================
   LE MODE MAINTENANCE — toute la plateforme, ou une boutique (posé dans la
   console : État technique → Dépannage, ou la fiche de la boutique).

   Le proxy le lit avant toute page de la vitrine et répond lui-même une page
   d'attente (HTTP 503, « nous revenons très vite ») : elle tient même quand
   l'application est en cause, puisqu'elle n'en rend rien. L'état se garde
   vingt secondes dans la mémoire du Worker (une lecture de la base par
   isolat et par tranche de vingt secondes) ; si la base ne répond pas, le
   dernier état connu vaut, et à défaut rien n'est fermé.
   ========================================================================== */

export type EtatMaintenance = {
  plateforme: { message: string | null; depuis: string } | null;
  boutiques: Record<string, { nom: string; message: string | null; depuis: string }>;
  noms?: Record<string, string>;
};

const VIDE: EtatMaintenance = { plateforme: null, boutiques: {} };
const DUREE = 20_000;
let memoire: { etat: EtatMaintenance; expire: number } | null = null;

export async function etatMaintenance(): Promise<EtatMaintenance> {
  if (memoire && memoire.expire > Date.now()) return memoire.etat;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const r = await fetch(`${url}/rest/v1/rpc/maintenance_etat`, {
      method: "POST",
      headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(1200),
    });
    if (!r.ok) throw new Error(`maintenance_etat : HTTP ${r.status}`);
    const etat = (await r.json()) as EtatMaintenance;
    memoire = { etat: { plateforme: etat?.plateforme ?? null, boutiques: etat?.boutiques ?? {}, noms: etat?.noms }, expire: Date.now() + DUREE };
    return memoire.etat;
  } catch {
    return memoire?.etat ?? VIDE;
  }
}

/** Pendant une maintenance : ce jeton d'aperçu (« <uuid>.<version> ») est-il le vrai, celui du brouillon de
 *  la boutique ? Sans réponse de la base : non (la page d'attente reste). */
export async function apercuValide(slug: string, jeton: string): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const r = await fetch(`${url}/rest/v1/rpc/maintenance_apercu`, {
      method: "POST",
      headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json" },
      body: JSON.stringify({ p_slug: slug, p_jeton: jeton.split(".")[0] }),
      signal: AbortSignal.timeout(1200),
    });
    return r.ok && (await r.json()) === true;
  } catch {
    return false;
  }
}

/** Oublier l'état gardé (après un geste de la console, dans le même isolat). */
export function oublierMaintenance(): void {
  memoire = null;
}

const echappe = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** La page d'attente : sobre, aux couleurs neutres (claires ou sombres selon l'appareil), en français. */
export function pageMaintenance(nom: string | null, message: string | null): Response {
  const titre = nom ? echappe(nom) : "La boutique";
  const initiale = nom ? echappe(nom.trim().charAt(0).toUpperCase()) : "·";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${titre} — de retour très vite</title><style>
:root{color-scheme:light dark;--fond:#f7f6f3;--encre:#1b1f24;--doux:#5d6470;--trait:#e4e1da}
@media (prefers-color-scheme:dark){:root{--fond:#121416;--encre:#f1efe9;--doux:#a5abb4;--trait:#2a2e33}}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;display:grid;place-items:center;padding:2rem 1.25rem;background:var(--fond);color:var(--encre);font:17px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:30rem;text-align:center}
.initiale{display:inline-grid;place-items:center;width:3.25rem;height:3.25rem;border-radius:999px;border:1px solid var(--trait);font-weight:600;font-size:1.25rem;margin-bottom:1.5rem}
h1{margin:0;font-size:clamp(1.75rem,5vw,2.25rem);font-weight:600;letter-spacing:-.02em;line-height:1.15;text-wrap:balance}
p{margin:.875rem 0 0;color:var(--doux);text-wrap:pretty}.mot{color:var(--encre)}
.pied{margin-top:2.5rem;font-size:.8125rem;letter-spacing:.04em;text-transform:uppercase}
</style></head><body><main><span class="initiale" aria-hidden="true">${initiale}</span><h1>${titre} revient très vite.</h1>${message ? `<p class="mot">${echappe(message)}</p>` : ""}<p>Une courte pause pour l'entretien du site. Votre panier vous attend : revenez dans quelques minutes.</p><p class="pied">Merci de votre patience</p></main></body></html>`;
  return new Response(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "600",
      "x-robots-tag": "noindex", "x-skanecom-maintenance": "1",
    },
  });
}
