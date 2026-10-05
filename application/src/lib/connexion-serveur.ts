import { supabase } from "./supabase";
import { verificationDe, type Verification } from "./connexion";

/* Le canal des codes, tel que la page le propose (commande, compte, devis) :
   le réglage de la boutique (compte.verification), sauf quand ses SMS du
   mois sont épuisés et qu'elle a choisi, au dépassement, de faire passer
   les codes par e-mail (la consommation, migration …_console_consommation).
   Une base qui ne répond pas laisse le réglage tel quel : un code part
   toujours. */
export async function verificationVitrine(c: { boutique: { id: string }; reglages: Record<string, unknown> }): Promise<Verification> {
  const v = verificationDe(c.reglages);
  if (v === "email") return v;
  const { data } = await supabase.rpc("vitrine_codes_par_email", { p_boutique_id: c.boutique.id });
  return data === true ? "email" : v;
}
