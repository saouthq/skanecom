import { chargeCadre } from "@/lib/boutique";
import { supabase } from "@/lib/supabase";

/* « Prévenez-moi de son retour » : la demande d'une déclinaison épuisée,
   vérifiée et notée par la base (public.demander_alerte_retour, qui compte
   les demandes par contact). Rien n'est mis en cache : c'est le contact
   d'une personne. */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Les refus que l'acheteur peut lire tels quels (la phrase vient de la base). */
const LISIBLES = new Set(["telephone", "email", "contact", "disponible", "variante", "essais", "reglage"]);

const reponse = (corps: unknown, statut = 200) =>
  Response.json(corps, { status: statut, headers: { "cache-control": "private, no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) return reponse({ ok: false, raison: "boutique" }, 404);

  const corps = (await req.json().catch(() => null)) as { variante_id?: unknown; telephone?: unknown; email?: unknown } | null;
  const variante = typeof corps?.variante_id === "string" && UUID.test(corps.variante_id) ? corps.variante_id : null;
  if (!variante) return reponse({ ok: false, raison: "variante", message: "Cette pièce n'est plus en vente." }, 422);
  const telephone = typeof corps?.telephone === "string" ? corps.telephone.slice(0, 20) : null;
  const email = typeof corps?.email === "string" ? corps.email.slice(0, 200) : null;

  const { data, error } = await supabase.rpc("demander_alerte_retour", {
    p_boutique_id: cadre.boutique.id, p_variante_id: variante, p_telephone: telephone, p_email: email,
  });
  if (error) {
    if (error.hint && LISIBLES.has(error.hint)) return reponse({ ok: false, raison: error.hint, message: error.message }, 422);
    console.error(`demander_alerte_retour (${boutique}) : ${error.code} ${error.message}`);
    return reponse({ ok: false, raison: "serveur" }, 500);
  }
  return reponse({ ok: true, deja: Boolean((data as { deja?: boolean } | null)?.deja) });
}
