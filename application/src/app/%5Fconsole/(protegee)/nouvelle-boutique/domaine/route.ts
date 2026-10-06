import { acces } from "@/lib/console/session";
import { verifierAchat } from "@/lib/console/domaines-cloudflare";

/* « Vérifier » (Nouvelle boutique → Le domaine → En acheter un) : libre ?
   à quel prix ? — demandé au registre, en direct, juste avant d'acheter.
   Le super-administrateur seul (un achat engage SkanEcom). Rien n'est acheté ici. */
export const dynamic = "force-dynamic";

const NOM = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export async function GET(req: Request) {
  const a = await acces();
  if (a.etat !== "ok" || a.role !== "super_admin") return Response.json({ ok: false, raison: "réservé au super-administrateur" }, { status: 403 });
  const nom = (new URL(req.url).searchParams.get("nom") ?? "").trim().toLowerCase();
  if (!NOM.test(nom)) return Response.json({ ok: false, raison: "un nom de domaine, par exemple maymar-shop.com" }, { status: 422 });
  const r = await verifierAchat([nom]);
  return Response.json(r.ok ? r : { ok: false, raison: r.raison === "non_branche" ? "le Registrar de Cloudflare n'est pas branché" : r.raison },
    { status: r.ok ? 200 : 502, headers: { "cache-control": "no-store" } });
}
