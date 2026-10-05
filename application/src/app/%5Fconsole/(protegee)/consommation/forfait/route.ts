import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import { entierSaisi } from "@/lib/console/consommation";

/* Le forfait du fournisseur (ce que l'abonnement chez Resend, ou chez le
   fournisseur de SMS, permet) : la console compare et prévient à 80 %.
   Tout vide : le forfait est oublié (public.console_regler_forfait_envoi). */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const mois = entierSaisi(formulaire.get("mois"));
    const jour = entierSaisi(formulaire.get("jour"));
    if (Number.isNaN(mois) || Number.isNaN(jour)) {
      return versCarte("/consommation", "forfait", { erreur: "Un forfait s'écrit en nombre entier d'envois (par exemple 3000), ou se laisse vide." });
    }
    if (mois === null && jour !== null) {
      return versCarte("/consommation", "forfait", { erreur: "Donnez aussi ce que le forfait permet par mois." });
    }
    const { data, error } = await clientService(ip).rpc("console_regler_forfait_envoi", {
      p_acteur: user.id, p_canal: String(formulaire.get("canal") ?? ""),
      p_fournisseur: String(formulaire.get("fournisseur") ?? "").trim(), p_par_mois: mois, p_par_jour: jour,
    });
    if (error) return versCarte("/consommation", "forfait", { erreur: messageBase(error) });
    return versCarte("/consommation", "forfait", { ok: data === false ? "Rien n'a changé." : mois === null ? "Forfait oublié." : "Forfait enregistré." });
  });
}
