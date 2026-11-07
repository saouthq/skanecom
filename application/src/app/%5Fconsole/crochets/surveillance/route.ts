import { lancerSurveillance } from "@/lib/console/surveillance";
import { releverTrafic } from "@/lib/console/trafic";
import { jetonInterne } from "@/lib/console/interne";

/* Le passage de l'heure : appelé par le Worker lui-même (son déclencheur
   planifié, src/worker.ts), dans le même isolat, avec un jeton tiré au
   hasard pour cet appel. Personne d'autre ne le connaît : de l'extérieur,
   la route ne répond rien. « ?quoi=trafic » (le déclencheur de la 17e
   minute) : le relevé du trafic seul, deux essais. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const attendu = jetonInterne();
  if (!attendu || req.headers.get("x-surveillance") !== attendu) return new Response(null, { status: 404 });
  if (new URL(req.url).searchParams.get("quoi") === "trafic") {
    const t = await releverTrafic(2);
    return Response.json({ ok: t.ok !== false, detail: t.detail, heures: t.heures.length }, { status: t.ok === false ? 502 : 200, headers: { "cache-control": "no-store" } });
  }
  const r = await lancerSurveillance("heure", null);
  return Response.json(r, { status: r.ok ? 200 : 500, headers: { "cache-control": "no-store" } });
}
