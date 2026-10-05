import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";

/* La double authentification de l'équipe SkanEcom : proposée (par défaut)
   ou exigée. Super-administrateur seulement (la base le redit) ; tracé. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const obligatoire = formulaire.get("obligatoire") === "1";
    const { error } = await clientService(ip).rpc("console_exiger_double_auth", { p_acteur: user.id, p_obligatoire: obligatoire });
    if (error) return versCarte("/equipe-plateforme", "securite", { erreur: messageBase(error) });
    return versCarte("/equipe-plateforme", "securite", {
      ok: obligatoire ? "Exigée : qui n'a pas d'application l'enregistrera à sa prochaine page." : "Proposée : chacun peut la reporter, et l'activer depuis « Mon compte ».",
    });
  });
}
