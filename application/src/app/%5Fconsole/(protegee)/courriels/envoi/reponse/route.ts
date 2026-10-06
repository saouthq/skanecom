import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";

/* L'adresse où vont les réponses des équipes (invitations, mots de passe) ;
   vide : l'adresse d'expédition. La base revérifie le super-administrateur
   et trace (public.console_regler_reponse_plateforme). */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const reponse = String(formulaire.get("reponse_a") ?? "");
    const { data, error } = await clientService(ip).rpc("console_regler_reponse_plateforme", { p_acteur: user.id, p_reponse_a: reponse });
    if (error) return versCarte("/courriels/envoi", "reponse", { erreur: messageBase(error) });
    if (data === false) return versCarte("/courriels/envoi", "reponse", { ok: "Rien n'a changé." });
    return versCarte("/courriels/envoi", "reponse", {
      ok: reponse.trim() ? `Enregistré : les réponses des équipes vont à ${reponse.trim().toLowerCase()}.` : "Enregistré : elles reviennent à l'adresse d'expédition.",
    });
  });
}
