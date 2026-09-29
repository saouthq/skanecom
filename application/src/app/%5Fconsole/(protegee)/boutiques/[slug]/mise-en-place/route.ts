import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { ETAPES_MISE_EN_PLACE, type CleEtape } from "@/lib/console/mise-en-place";

/* C6 · Cocher (ou décocher) une étape de mise en place qui ne se constate
   pas : recueil, commande test, formation (public.console_marquer_etape :
   la base revérifie l'administrateur et trace le geste). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const etape = String(formulaire.get("etape") ?? "") as CleEtape;
    const fait = formulaire.get("fait") === "true";
    const { error } = await clientService(ip).rpc("console_marquer_etape", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_etape: etape,
      p_fait: fait,
    });
    if (error) return versAvecErreur(retour, error.hint === "etape" ? (error.message ?? "") : messageBase(error));
    const titre = ETAPES_MISE_EN_PLACE[etape]?.titre ?? etape;
    return vers(`${retour}?${new URLSearchParams({ ok: fait ? `« ${titre} » : faite.` : `« ${titre} » : de nouveau à faire.` })}#t-mise-en-place`);
  });
}
