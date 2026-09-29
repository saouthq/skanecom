import { accesEquipe, clientSession } from "@/lib/console/session";

/* La veille du backoffice ouvert (components/console/Veille.tsx) : combien de
   commandes attendent l'appel, et la dernière arrivée. JSON, jamais en cache. */

export const dynamic = "force-dynamic";

const PRIVE = { "cache-control": "private, no-store" };

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await accesEquipe();
  if (a.etat !== "ok") return Response.json({ ok: false }, { status: 401, headers: PRIVE });
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return Response.json({ ok: false }, { status: 404, headers: PRIVE });
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_veille", { p_boutique_id: boutique.boutique_id });
  if (error) return Response.json({ ok: false }, { status: 500, headers: PRIVE });
  return Response.json({ ok: true, ...(data as object) }, { headers: PRIVE });
}
