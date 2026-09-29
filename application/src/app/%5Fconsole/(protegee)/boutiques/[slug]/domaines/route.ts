import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const hote = String(formulaire.get("hote") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const { error } = await clientService(ip).rpc("console_ajouter_domaine", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_hote: hote,
      p_principal: formulaire.get("principal") === "1",
    });
    if (error) return versAvecErreur(`/boutiques/${slug}`, messageBase(error));
    return vers(`/boutiques/${slug}?${new URLSearchParams({ ok: `Domaine ${hote} ajouté.` })}`);
  });
}
