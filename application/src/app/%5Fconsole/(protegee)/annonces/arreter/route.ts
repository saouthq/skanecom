import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/* Arrêter une annonce (elle passe dans les finies), ou la supprimer. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const supprimer = formulaire.get("geste") === "supprimer";
    const { error } = await clientService(ip).rpc("console_arreter_annonce", {
      p_acteur: user.id,
      p_annonce_id: Number(formulaire.get("annonce_id") ?? 0),
      p_supprimer: supprimer,
    });
    if (error) return versAvecErreur("/annonces", messageBase(error));
    return vers(`/annonces?${new URLSearchParams({ ok: supprimer ? "Annonce supprimée." : "Annonce arrêtée : elle ne s'affiche plus." })}`);
  });
}
