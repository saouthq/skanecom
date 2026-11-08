import { clientService } from "./service";
import { parRequete } from "@/lib/par-requete";

/** Une boutique vue de la console (public.console_boutique), lue une fois par
 *  requête : le titre d'onglet, l'en-tête commun (layout) et la page la
 *  partagent (lib/par-requete.ts). */
export const boutiqueConsole = parRequete("console.boutique", async (slug: string) => {
  const { data, error } = await clientService().rpc("console_boutique", { p_slug: slug });
  return { data, error };
});
