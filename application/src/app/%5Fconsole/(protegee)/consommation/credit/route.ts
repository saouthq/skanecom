import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import { entierSaisi, nombre } from "@/lib/console/consommation";

/* Un crédit ponctuel pour le mois en cours (une promotion, un mois chargé) :
   il s'ajoute au quota, ce mois-ci seulement (public.console_crediter_envois). */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const slug = String(formulaire.get("slug") ?? "");
    const carte = `b-${slug}`;
    const canal = String(formulaire.get("canal") ?? "");
    const quantite = entierSaisi(formulaire.get("quantite"));
    if (quantite === null || Number.isNaN(quantite) || quantite < 1) {
      return versCarte("/consommation", carte, { erreur: "Le crédit est un nombre d'envois (par exemple 500)." });
    }
    const { error } = await clientService(ip).rpc("console_crediter_envois", {
      p_acteur: user.id, p_boutique_id: String(formulaire.get("boutique_id") ?? ""), p_canal: canal,
      p_quantite: quantite, p_motif: String(formulaire.get("motif") ?? "").trim(),
    });
    if (error) return versCarte("/consommation", carte, { erreur: messageBase(error) });
    return versCarte("/consommation", carte, { ok: `${nombre(quantite)} ${canal === "sms" ? "SMS" : quantite > 1 ? "e-mails" : "e-mail"} de plus ce mois-ci.` });
  });
}
