import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";

/* Retirer un crédit du mois en cours (un mois passé, il a servi). */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const carte = `b-${String(formulaire.get("slug") ?? "")}`;
    const { error } = await clientService(ip).rpc("console_retirer_credit_envois", {
      p_acteur: user.id, p_credit_id: Number(formulaire.get("id") ?? 0),
    });
    if (error) return versCarte("/consommation", carte, { erreur: messageBase(error) });
    return versCarte("/consommation", carte, { ok: "Crédit retiré." });
  });
}
