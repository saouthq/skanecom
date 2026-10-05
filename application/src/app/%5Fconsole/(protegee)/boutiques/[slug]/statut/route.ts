import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const statut = String(formulaire.get("statut") ?? "");
    const { error } = await clientService(ip).rpc("console_changer_statut", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_statut: statut,
    });
    if (error) return versAvecErreur(`/boutiques/${slug}`, messageBase(error));
    if (statut === "fermee" && formulaire.get("confirme") !== "1") {
      return versAvecErreur(`/boutiques/${slug}`, "Cochez la confirmation pour fermer la boutique.");
    }
    const message = statut === "active" ? "La boutique est ouverte : sa vitrine est servie d'ici quelques secondes."
      : statut === "fermee" ? "La boutique est fermée : sa vitrine n'est plus servie, ses données sont gardées. Elle peut rouvrir."
      : "La boutique est suspendue : sa vitrine n'est plus servie.";
    return vers(`/boutiques/${slug}?${new URLSearchParams({ ok: message })}`);
  });
}
