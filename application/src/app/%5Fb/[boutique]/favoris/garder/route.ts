import { chargeCadre } from "@/lib/boutique";
import { clientAcheteur } from "@/lib/supabase-acheteur";

/* Les favoris d'un client connecté (lib/favoris.ts) : le geste du cœur, ou
   la liste du navigateur à fusionner, gardés par son compte
   (public.garder_favoris). Sans session : 204, rien n'est gardé — la liste
   vit dans le navigateur. */

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]{1,120}$/;
const slugs = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && SLUG.test(s)).slice(0, 100) : []);

export async function POST(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre?.favoris) return new Response(null, { status: 204 });
  const corps = (await req.json().catch(() => null)) as { ajouts?: unknown; retraits?: unknown } | null;
  const sb = await clientAcheteur();
  if (!(await sb.auth.getSession()).data.session) return new Response(null, { status: 204 });
  const { data, error } = await sb.rpc("garder_favoris", { p_boutique_id: cadre.boutique.id, p_ajouts: slugs(corps?.ajouts), p_retraits: slugs(corps?.retraits) });
  if (error) {
    console.error(`garder_favoris (${boutique}) : ${error.code} ${error.message}`);
    return new Response(null, { status: 500 });
  }
  if (data === null) return new Response(null, { status: 204 });
  return Response.json({ favoris: data as string[] }, { headers: { "cache-control": "private, no-store" } });
}
