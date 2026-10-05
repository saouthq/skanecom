import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/* Réinitialiser la double authentification d'une personne qui a perdu son
   téléphone (public.console_reinitialiser_double_auth : super-administrateur,
   jamais pour soi) : ses facteurs et ses sessions tombent. Le retour : la
   page d'où vient le geste, l'équipe SkanEcom ou l'équipe d'une boutique. */
const RETOURS = /^\/(equipe-plateforme|boutiques\/[a-z0-9-]{1,48}\/equipe)$/;

export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const demande = String(formulaire.get("retour") ?? "");
    const retour = RETOURS.test(demande) ? demande : "/equipe-plateforme";
    const qui = String(formulaire.get("email") ?? "Cette personne");
    const { error } = await clientService(ip).rpc("console_reinitialiser_double_auth", {
      p_acteur: user.id, p_user_id: String(formulaire.get("user_id") ?? ""),
    });
    if (error) return versAvecErreur(retour, error.hint === "soi" ? (error.message ?? "") : messageBase(error));
    return vers(`${retour}?${new URLSearchParams({
      ok: `Double authentification de ${qui} réinitialisée : ses sessions sont fermées ; la prochaine connexion demandera d'enregistrer de nouveau une application.`,
    })}`);
  });
}
