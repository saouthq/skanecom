import { chargeCadre } from "@/lib/boutique";
import { supabase } from "@/lib/supabase";

/* Le suivi d'une commande sans compte : son numéro et le téléphone qui l'a
   passée, vérifiés par la base (public.suivre_commande, qui compte les
   essais manqués). Rien n'est mis en cache : c'est la commande d'une
   personne. */

export const dynamic = "force-dynamic";

const reponse = (corps: unknown, statut = 200) =>
  Response.json(corps, { status: statut, headers: { "cache-control": "private, no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) return reponse({ ok: false, raison: "boutique" }, 404);

  const corps = (await req.json().catch(() => null)) as { numero?: unknown; telephone?: unknown } | null;
  const numero = typeof corps?.numero === "string" ? corps.numero.slice(0, 40) : "";
  const telephone = typeof corps?.telephone === "string" ? corps.telephone.slice(0, 20) : "";
  const { data, error } = await supabase.rpc("suivre_commande", { p_boutique_id: cadre.boutique.id, p_numero: numero, p_telephone: telephone });
  if (error) {
    if (error.hint === "saisie" || error.hint === "essais") return reponse({ ok: false, raison: error.hint, message: error.message }, 422);
    console.error(`suivre_commande (${boutique}) : ${error.code} ${error.message}`);
    return reponse({ ok: false, raison: "serveur" }, 500);
  }
  return data ? reponse({ ok: true, commande: data }) : reponse({ ok: false, raison: "introuvable" });
}
