import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/* Retirer un prospect saisi par erreur : super-administrateur (la base le redit) ; tracé. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const { error } = await clientService(ip).rpc("console_retirer_prospect", { p_acteur: user.id, p_id: String(formulaire.get("id") ?? "") });
    if (error) return versAvecErreur("/prospects", messageBase(error));
    return vers(`/prospects?${new URLSearchParams({ ok: "Prospect retiré." })}`);
  });
}
