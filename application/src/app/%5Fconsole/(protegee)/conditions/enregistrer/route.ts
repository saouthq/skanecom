import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers } from "@/lib/console/http";

/* Enregistrer le brouillon des conditions de service (super-administrateur) :
   le crée s'il n'y en a pas (la version suivante), le réécrit sinon. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const { data, error } = await clientService(ip).rpc("console_enregistrer_conditions", {
      p_acteur: user.id,
      p_titre: String(formulaire.get("titre") ?? ""),
      p_texte: String(formulaire.get("texte") ?? ""),
      p_changements: String(formulaire.get("changements") ?? ""),
    });
    const retour = (m: Record<string, string>) => vers(`/conditions?${new URLSearchParams(m)}#t-cdt-brouillon`);
    if (error) {
      const message = error.code === "23514" && /texte|titre/.test(error.message ?? "")
        ? "Le titre (3 à 120 caractères) et le texte (200 caractères au moins) sont attendus." : messageBase(error);
      return retour({ erreur: message });
    }
    return retour({ ok: `Brouillon de la version ${data} enregistré. Rien ne change pour les boutiques tant qu'il n'est pas publié.` });
  });
}
