import { lancerSurveillance } from "@/lib/console/surveillance";
import { jetonInterne } from "@/lib/console/interne";

/* Le passage de l'heure : appelé par le Worker lui-même (son déclencheur
   planifié, src/worker.ts), dans le même isolat, avec un jeton tiré au
   hasard pour cet appel. Personne d'autre ne le connaît : de l'extérieur,
   la route ne répond rien. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const attendu = jetonInterne();
  if (!attendu || req.headers.get("x-surveillance") !== attendu) return new Response(null, { status: 404 });
  const r = await lancerSurveillance("heure", null);
  return Response.json(r, { status: r.ok ? 200 : 500, headers: { "cache-control": "no-store" } });
}
