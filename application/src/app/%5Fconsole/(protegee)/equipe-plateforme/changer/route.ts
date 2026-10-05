import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/* Changer le rôle d'un membre de l'équipe SkanEcom, ou le retirer. */
export async function POST(req: Request) {
  const retour = "/equipe-plateforme";
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const cible = String(formulaire.get("user_id") ?? "");
    const geste = String(formulaire.get("geste") ?? "");
    const svc = clientService(ip);
    const { error } = geste === "retirer"
      ? await svc.rpc("console_retirer_administrateur", { p_acteur: user.id, p_user_id: cible })
      : await svc.rpc("console_nommer_administrateur", { p_acteur: user.id, p_user_id: cible, p_role: String(formulaire.get("role") ?? "") });
    if (error) return versAvecErreur(retour, ["dernier", "soi", "role"].includes(error.hint ?? "") ? (error.message ?? "") : messageBase(error));
    return vers(`${retour}?${new URLSearchParams({ ok: geste === "retirer" ? "Retiré de l'équipe SkanEcom : ce compte n'entre plus dans la console." : "Rôle changé." })}`);
  });
}
