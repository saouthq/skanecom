import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import { entierSaisi } from "@/lib/console/consommation";

/* Les quotas d'une boutique : son exception (vide : ceux de sa formule) et
   ce qui se passe au dépassement. La base revérifie le super-administrateur
   et trace au journal (public.console_regler_quota_boutique). */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const slug = String(formulaire.get("slug") ?? "");
    const retour = "/consommation";
    const carte = `b-${slug}`;
    const emails = entierSaisi(formulaire.get("emails"));
    const sms = entierSaisi(formulaire.get("sms"));
    if (Number.isNaN(emails) || Number.isNaN(sms)) {
      return versCarte(retour, carte, { erreur: "Un quota s'écrit en nombre entier d'envois par mois (par exemple 5000), ou se laisse vide." });
    }
    const { data, error } = await clientService(ip).rpc("console_regler_quota_boutique", {
      p_acteur: user.id, p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_emails_mois: emails, p_sms_mois: sms, p_depassement: String(formulaire.get("depassement") ?? "compter"),
    });
    if (error) return versCarte(retour, carte, { erreur: messageBase(error) });
    return versCarte(retour, carte, { ok: data === false ? "Rien n'a changé." : "Quotas de la boutique enregistrés." });
  });
}
