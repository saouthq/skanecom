import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const hote = String(formulaire.get("hote") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const geste = String(formulaire.get("geste") ?? "ajouter");
    if (geste === "principal" || geste === "retirer") {
      const { error } = await clientService(ip).rpc(geste === "principal" ? "console_domaine_principal" : "console_retirer_domaine", {
        p_acteur: user.id,
        p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
        p_hote: hote,
      });
      if (error) return versCarte(`/boutiques/${slug}`, "domaines", { erreur: error.hint === "domaine" ? (error.message ?? "") : messageBase(error) });
      const ok = geste === "principal" ? `${hote} est maintenant le domaine principal : les liens et le référencement le prennent.` : `Domaine ${hote} retiré.`;
      return versCarte(`/boutiques/${slug}`, "domaines", { ok });
    }
    const { error } = await clientService(ip).rpc("console_ajouter_domaine", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_hote: hote,
      p_principal: formulaire.get("principal") === "1",
    });
    if (error) return versCarte(`/boutiques/${slug}`, "domaines", { erreur: messageBase(error) });
    return versCarte(`/boutiques/${slug}`, "domaines", { ok: `Domaine ${hote} ajouté.` });
  });
}
