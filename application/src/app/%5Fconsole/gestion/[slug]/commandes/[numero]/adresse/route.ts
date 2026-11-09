import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine } from "@/lib/console/http";
import { PEUT_CONFIRMER } from "@/lib/gestion/libelles";

/* ============================================================================
   CHANGER L'ADRESSE D'UNE COMMANDE PAS ENCORE PARTIE — l'écran de la commande
   (ModifierAdresse.tsx) envoie la nouvelle adresse : « simuler » rend les
   frais du nouveau gouvernorat sans rien écrire ; sinon, enregistrée au
   total vu (public.gestion_modifier_livraison). Réponse JSON, toujours.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; numero: string }> }) {
  const repond = (corps: unknown, status = 200) => Response.json(corps, { status, headers: { "cache-control": "no-store" } });
  if (!memeOrigine(req)) return repond({ ok: false, raison: "origine" }, 403);
  const { slug, numero } = await params;
  const a = await accesEquipe();
  if (a.etat !== "ok") return repond({ ok: false, raison: "session" }, 401);
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return repond({ ok: false, raison: "introuvable" }, 404);
  if (!PEUT_CONFIRMER.includes(boutique.role)) return repond({ ok: false, raison: "role" }, 403);

  const corps = (await req.json().catch(() => null)) as { adresse?: Record<string, unknown>; simuler?: unknown; total?: unknown } | null;
  const champ = (k: string) => (typeof corps?.adresse?.[k] === "string" ? String(corps.adresse[k]).slice(0, 220) : "");
  const adresse = { ligne1: champ("ligne1"), ligne2: champ("ligne2"), ville: champ("ville"), gouvernorat: champ("gouvernorat"), code_postal: champ("code_postal") };
  const total = typeof corps?.total === "number" && Number.isSafeInteger(corps.total) ? corps.total : null;

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_modifier_livraison", {
    p_boutique_id: boutique.boutique_id, p_numero: decodeURIComponent(numero), p_adresse: adresse, p_simuler: corps?.simuler !== false, p_total_attendu: total,
  });
  if (error) return repond({ ok: false, raison: "erreur" }, 500);
  return repond(data);
}
