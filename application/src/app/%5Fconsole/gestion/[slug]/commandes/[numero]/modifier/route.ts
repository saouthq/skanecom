import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine } from "@/lib/console/http";
import { PEUT_CONFIRMER } from "@/lib/gestion/libelles";

/* ============================================================================
   MODIFIER UNE COMMANDE PAS ENCORE PARTIE — l'écran de la commande
   (ModifierCommande.tsx) envoie les lignes voulues : « simuler » rend le
   nouveau chiffrage sans rien écrire ; sinon, enregistré au total vu
   (public.gestion_modifier_commande : stock rendu puis réservé, prix refait
   par le calcul de la vitrine, journal tenu). Réponse JSON, toujours.
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

  const corps = (await req.json().catch(() => null)) as { lignes?: unknown; simuler?: unknown; total?: unknown } | null;
  const lignes = Array.isArray(corps?.lignes)
    ? corps.lignes.flatMap((l) => {
        const o = l as { variante_id?: unknown; quantite?: unknown };
        const q = Number(o.quantite);
        return typeof o.variante_id === "string" && Number.isInteger(q) && q > 0 && q <= 999 ? [{ variante_id: o.variante_id, quantite: q }] : [];
      })
    : [];
  const simuler = corps?.simuler !== false;
  const total = typeof corps?.total === "number" && Number.isSafeInteger(corps.total) ? corps.total : null;

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_modifier_commande", {
    p_boutique_id: boutique.boutique_id, p_numero: decodeURIComponent(numero), p_lignes: lignes, p_simuler: simuler, p_total_attendu: total,
  });
  if (error) return repond({ ok: false, raison: "erreur" }, 500);
  return repond(data);
}
