import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const valeurs = {
      nom: String(formulaire.get("nom") ?? "").trim(),
      slug: String(formulaire.get("slug") ?? "").trim().toLowerCase(),
      hote: String(formulaire.get("hote") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
      theme: String(formulaire.get("theme") ?? "premium_sobre"),
    };
    const { error } = await clientService(ip).rpc("console_creer_boutique", {
      p_acteur: user.id,
      p_slug: valeurs.slug,
      p_nom: valeurs.nom,
      p_hote: valeurs.hote,
      p_theme: valeurs.theme,
    });
    if (error) return versAvecErreur("/nouvelle-boutique", messageBase(error), valeurs);
    return vers(`/boutiques/${valeurs.slug}?cree=1`);
  });
}
