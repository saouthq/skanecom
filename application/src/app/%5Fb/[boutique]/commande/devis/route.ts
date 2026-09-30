import { chargeCadre } from "@/lib/boutique";
import { clientAcheteur } from "@/lib/supabase-acheteur";
import { raisonDe, type ReponseDevis } from "@/lib/commande";

/* Le devis de la page de commande : le panier du navigateur, relu par la base
   (public.devis_commande) — prix, stock, frais du gouvernorat choisi (ou
   retrait en magasin, gratuit), total. Rien n'est mis en cache : c'est le
   panier d'une personne — lu avec sa session, comme la commande (un pro
   validé y voit ses prix pro, module comptes_pro). */

export const dynamic = "force-dynamic";

function reponse(corps: ReponseDevis, statut = 200): Response {
  return Response.json(corps, { status: statut, headers: { "cache-control": "private, no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) return reponse({ ok: false, raison: "boutique", message: "Boutique introuvable" }, 404);

  const corps = (await req.json().catch(() => null)) as { lignes?: unknown; gouvernorat?: unknown; mode?: unknown } | null;
  const sb = await clientAcheteur();
  const { data, error } = await sb.rpc("devis_commande", {
    p_boutique_id: cadre.boutique.id,
    p_lignes: corps?.lignes ?? [],
    p_gouvernorat: typeof corps?.gouvernorat === "string" && corps.gouvernorat ? corps.gouvernorat : null,
    p_mode: corps?.mode === "retrait" ? "retrait" : "domicile",
  });
  if (error) {
    const raison = raisonDe(error.hint);
    if (raison === "inconnue") {
      console.error(`devis_commande (${boutique}) : ${error.code} ${error.message}`);
      return reponse({ ok: false, raison, message: "Erreur du serveur" }, 500);
    }
    return reponse({ ok: false, raison, message: error.message }, 422);
  }
  return reponse({ ok: true, devis: data });
}
