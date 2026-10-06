import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import type { CourrielsBoutique } from "@/lib/console/courriels";

/* Le nom affiché et l'adresse où vont les réponses des clients d'une
   boutique ; « Répondre à <son e-mail> » reprend celui de ses mentions
   légales. La base revérifie le super-administrateur et trace
   (public.console_regler_courriels_boutique). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/courriels`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const service = clientService(ip);
    const boutiqueId = String(formulaire.get("boutique_id") ?? "");
    let reponse = String(formulaire.get("reponse_a") ?? "");
    if (formulaire.get("reponse_boutique") === "1") {
      const { data } = await service.rpc("console_courriels_boutique", { p_acteur: user.id, p_boutique_id: boutiqueId });
      reponse = (data as CourrielsBoutique | null)?.email_boutique ?? reponse;
    }
    const { data, error } = await service.rpc("console_regler_courriels_boutique", {
      p_acteur: user.id, p_boutique_id: boutiqueId, p_nom: String(formulaire.get("nom") ?? ""), p_reponse_a: reponse,
    });
    if (error) return versCarte(retour, "expediteur", { erreur: messageBase(error) });
    const r = data as { change: boolean; nom: string | null; reponse_a: string | null };
    if (!r.change) return versCarte(retour, "expediteur", { ok: "Rien n'a changé." });
    return versCarte(retour, "expediteur", {
      ok: r.reponse_a ? `Enregistré : les réponses de ses clients vont à ${r.reponse_a}.` : "Enregistré : pas d'adresse de réponse, elles reviennent à l'adresse d'expédition.",
    });
  });
}
