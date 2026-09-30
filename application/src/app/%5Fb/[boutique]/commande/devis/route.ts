import { chargeCadre } from "@/lib/boutique";
import { clientAcheteur } from "@/lib/supabase-acheteur";
import { NUMERO_DEVIS, SAISIE_CODE, raisonDe, type ReponseDevis } from "@/lib/commande";

/* Le devis de la page de commande : le panier du navigateur, relu par la base
   (public.devis_commande) — prix, stock, frais du gouvernorat choisi (ou
   retrait en magasin, gratuit), le code promo tapé, total. Rien n'est mis en cache : c'est le
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

  const corps = (await req.json().catch(() => null)) as { lignes?: unknown; gouvernorat?: unknown; mode?: unknown; devis?: unknown; code?: unknown } | null;
  const sb = await clientAcheteur();
  const gouvernorat = typeof corps?.gouvernorat === "string" && corps.gouvernorat ? corps.gouvernorat : null;
  const mode = corps?.mode === "retrait" ? "retrait" : "domicile";
  // Le tunnel d'un devis (module devis) : ses lignes, ses prix et ses frais,
  // pour son client connecté seulement.
  const devis = typeof corps?.devis === "string" && NUMERO_DEVIS.test(corps.devis) ? corps.devis : null;
  // Le code promo tapé (module promotions) : la base dit s'il s'applique.
  const code = typeof corps?.code === "string" && SAISIE_CODE.test(corps.code) ? corps.code : null;
  const { data, error } = devis
    ? await sb.rpc("chiffre_devis", { p_boutique_id: cadre.boutique.id, p_numero: devis, p_gouvernorat: gouvernorat, p_mode: mode })
    : await sb.rpc("devis_commande", { p_boutique_id: cadre.boutique.id, p_lignes: corps?.lignes ?? [], p_gouvernorat: gouvernorat, p_mode: mode, p_code: code });
  if (error) {
    const raison = raisonDe(error.hint);
    if (raison === "inconnue") {
      console.error(`devis_commande (${boutique}) : ${error.code} ${error.message}`);
      return reponse({ ok: false, raison, message: "Erreur du serveur" }, 500);
    }
    return reponse({ ok: false, raison, message: error.message }, 422);
  }
  // Les paniers abandonnés (réglage commande.relance_paniers, compte
  // obligatoire) : le panier d'une personne connectée est gardé à chaque
  // récapitulatif, relu par la base. Un visiteur : rien, pas même l'appel.
  // Un échec ne gêne jamais le devis.
  if (!devis && cadre.relancePaniers && (await sb.auth.getSession()).data.session) {
    const { error: garde } = await sb.rpc("garder_panier", { p_boutique_id: cadre.boutique.id, p_lignes: corps?.lignes ?? [] });
    if (garde) console.error(`garder_panier (${boutique}) : ${garde.code} ${garde.message}`);
  }
  return reponse({ ok: true, devis: data });
}
