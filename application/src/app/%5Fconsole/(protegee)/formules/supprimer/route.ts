import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/* Supprimer une formule qui n'est vendue à personne. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const code = String(formulaire.get("code") ?? "");
    const { error } = await clientService(ip).rpc("console_supprimer_formule", { p_acteur: user.id, p_code: code });
    if (error) return versAvecErreur("/formules", messageBase(error));
    return vers(`/formules?${new URLSearchParams({ ok: "Formule supprimée." })}`);
  });
}
