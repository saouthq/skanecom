import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const statut = String(formulaire.get("statut") ?? "");
    // Fermer ou suspendre retire une vitrine en ligne : la confirmation se vérifie AVANT le geste.
    if ((statut === "fermee" || statut === "suspendue") && formulaire.get("confirme") !== "1") {
      return versAvecErreur(`/boutiques/${slug}`, statut === "fermee"
        ? "Cochez la confirmation pour fermer la boutique." : "Confirmez la suspension : la vitrine cesse d'être servie.");
    }
    const boutiqueId = String(formulaire.get("boutique_id") ?? "");
    // Suspendre dit pourquoi, et peut laisser un message que l'équipe de la boutique lira.
    const { error } = statut === "suspendue"
      ? await clientService(ip).rpc("console_suspendre", {
          p_acteur: user.id, p_boutique_id: boutiqueId,
          p_motif: String(formulaire.get("motif") ?? ""), p_message: String(formulaire.get("message") ?? "").slice(0, 600),
        })
      : await clientService(ip).rpc("console_changer_statut", { p_acteur: user.id, p_boutique_id: boutiqueId, p_statut: statut });
    if (error) return versAvecErreur(`/boutiques/${slug}`, error.hint === "motif" || error.hint === "message" ? error.message ?? "" : messageBase(error));
    const message = statut === "active" ? "La boutique est ouverte : sa vitrine est servie d'ici quelques secondes."
      : statut === "fermee" ? "La boutique est fermée : sa vitrine n'est plus servie, ses données sont gardées. Elle peut rouvrir."
      : "La boutique est suspendue : sa vitrine n'est plus servie, et son équipe lit pourquoi en tête de son backoffice.";
    return vers(`/boutiques/${slug}?${new URLSearchParams({ ok: message })}`);
  });
}
