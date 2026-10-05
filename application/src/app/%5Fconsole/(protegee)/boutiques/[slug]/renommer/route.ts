import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";

/* Renommer une boutique : le nom seulement, l'adresse reste. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const nom = String(formulaire.get("nom") ?? "").trim();
    const { data: change, error } = await clientService(ip).rpc("console_renommer_boutique", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_nom: nom,
    });
    if (error) return versCarte(`/boutiques/${slug}`, "vie", { erreur: error.hint === "nom" ? (error.message ?? "") : messageBase(error) });
    const ok = change ? `Boutique renommée « ${nom} ». Son adresse ne change pas.` : "Le nom n'a pas changé.";
    return versCarte(`/boutiques/${slug}`, "vie", { ok });
  });
}
