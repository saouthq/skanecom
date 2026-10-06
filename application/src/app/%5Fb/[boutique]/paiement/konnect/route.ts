import { chargeCadre } from "@/lib/boutique";
import { relirePaiement } from "@/lib/paiement/commande";

/* L'appel de Konnect quand un paiement change d'état (GET ?payment_ref=…).
   Il n'est pas signé : on n'en prend que la référence, on relit l'état chez
   Konnect avec la clé de la boutique, et on note ce que Konnect répond. Un
   même appel reçu deux fois ne change rien de plus. */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  const reference = new URL(req.url).searchParams.get("payment_ref") ?? "";
  if (!cadre || !reference) return new Response("Inconnu", { status: 404 });
  const r = await relirePaiement(reference, cadre.boutique.id);
  if (!r) return new Response("Paiement inconnu", { status: 404 });
  return Response.json({ ok: true, statut: r.statut }, { headers: { "cache-control": "no-store" } });
}
