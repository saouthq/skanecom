import { chargeCadre } from "@/lib/boutique";
import { supabase } from "@/lib/supabase";
import type { Lot, ReponseLots } from "@/lib/lots";

/* Les lots qui comptent l'un des produits demandés (module promotions,
   public.vitrine_lots) : pour le tiroir du panier, qui les applique et
   propose de compléter ceux qu'il a entamés. Rien de personnel : la même
   réponse pour le même panier, d'où le cache partagé (court : un lot coupé
   au backoffice doit vite quitter la vitrine). */

export const dynamic = "force-dynamic";

function reponse(corps: ReponseLots, statut = 200): Response {
  return Response.json(corps, { status: statut, headers: { "cache-control": "public, max-age=60" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) return reponse({ lots: [] }, 404);
  if (!cadre.promotions || cadre.siteVitrine) return reponse({ lots: [] });
  const slugs = (new URL(req.url).searchParams.get("slugs") ?? "")
    .split(",")
    .filter((s) => /^[a-z0-9-]{1,120}$/.test(s))
    .slice(0, 30);
  if (slugs.length === 0) return reponse({ lots: [] });
  const { data, error } = await supabase.rpc("vitrine_lots", { p_boutique_id: cadre.boutique.id, p_slugs: slugs });
  if (error) return Response.json({ lots: [] } satisfies ReponseLots, { status: 503, headers: { "cache-control": "no-store" } });
  return reponse({ lots: (data ?? []) as Lot[] });
}
