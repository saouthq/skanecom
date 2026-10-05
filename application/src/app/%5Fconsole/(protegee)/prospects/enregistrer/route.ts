import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/* Créer un prospect (sans id) ou le modifier : toute l'équipe SkanEcom ;
   la base normalise le téléphone et l'e-mail, et trace le geste. */
const CHAMPS = ["nom", "contact_nom", "telephone", "email", "ville", "metier", "source", "prochaine_action", "prochaine_le", "note"] as const;
const LISIBLES = new Set(["nom", "numero", "email", "metier", "source", "prochaine_le"]);

export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const id = String(formulaire.get("id") ?? "") || null;
    const prospect = Object.fromEntries(CHAMPS.map((c) => [c, String(formulaire.get(c) ?? "").slice(0, 2000)]));
    const { data, error } = await clientService(ip).rpc("console_enregistrer_prospect", { p_acteur: user.id, p_id: id, p_prospect: prospect });
    if (error) {
      const message = LISIBLES.has(error.hint ?? "") ? error.message : messageBase(error);
      // Refusé : ce qui a été saisi revient dans le formulaire (création), ou la fiche se rouvre (modification).
      return id
        ? versAvecErreur("/prospects", message, { ouvert: id })
        : versAvecErreur("/prospects", message, Object.fromEntries(Object.entries(prospect).filter(([, v]) => v)));
    }
    const ok = id ? `« ${prospect.nom.trim()} » : enregistré.` : `« ${prospect.nom.trim()} » ajouté aux prospects.`;
    return vers(`/prospects?${new URLSearchParams({ ok, vu: String(data) })}#p-${data}`);
  });
}
