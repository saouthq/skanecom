import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import { millimes } from "@/lib/console/import";
import { entierSaisi, type DonneesConsommation } from "@/lib/console/consommation";

/* Les quotas des formules, tout le tableau en un envoi (« emails__pro »,
   « prix_sms__pro »…) : seules les formules changées sont réécrites, chacune
   tracée au journal (public.console_regler_quotas_formule). */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const service = clientService(ip);
    const { data } = await service.rpc("console_consommation", { p_acteur: user.id });
    const avant = new Map(((data ?? { formules: [] }) as DonneesConsommation).formules.map((f) => [f.code, f]));
    const faites: string[] = [];
    for (const code of formulaire.getAll("codes").map(String)) {
      const f = avant.get(code);
      if (!f) continue;
      const emails = entierSaisi(formulaire.get(`emails__${code}`));
      const sms = entierSaisi(formulaire.get(`sms__${code}`));
      const prixSms = millimes(String(formulaire.get(`prix_sms__${code}`) ?? ""));
      const prixEmails = millimes(String(formulaire.get(`prix_emails__${code}`) ?? ""));
      if (Number.isNaN(emails) || Number.isNaN(sms)) {
        return versCarte("/consommation", "formules", { erreur: `« ${f.nom} » : un quota s'écrit en nombre entier d'envois par mois, ou se laisse vide.` });
      }
      if (Number.isNaN(prixSms) || Number.isNaN(prixEmails)) {
        return versCarte("/consommation", "formules", { erreur: `« ${f.nom} » : prix illisible — écrivez par exemple 0,080.` });
      }
      if (emails === f.emails && sms === f.sms && prixSms === f.prix_sms && prixEmails === f.prix_emails) continue;
      const { error } = await service.rpc("console_regler_quotas_formule", {
        p_acteur: user.id, p_code: code, p_emails_mois: emails, p_sms_mois: sms,
        p_prix_sms_millimes: prixSms, p_prix_emails_millimes: prixEmails,
      });
      if (error) {
        const deja = faites.length ? ` (${faites.join(", ")} : enregistrée${faites.length > 1 ? "s" : ""})` : "";
        return versCarte("/consommation", "formules", { erreur: `« ${f.nom} » : ${messageBase(error)}${deja}` });
      }
      faites.push(`« ${f.nom} »`);
    }
    if (!faites.length) return versCarte("/consommation", "formules", { ok: "Rien n'a changé." });
    return versCarte("/consommation", "formules", {
      ok: faites.length === 1 ? `Quotas de ${faites[0]} enregistrés.` : `Quotas de ${faites.join(", ")} enregistrés.`,
    });
  });
}
