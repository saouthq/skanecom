import { clientService } from "./service";
import { parRequete } from "@/lib/par-requete";

/** Une fonction de lecture de la console (public.console_*), appelée une fois
 *  par requête quels que soient ceux qui la demandent avec les mêmes
 *  arguments : le layout (le compteur de « Boutiques ») et la page (l'accueil,
 *  la fiche d'une boutique, l'État technique) la partagent (lib/par-requete.ts).
 *  Réservée aux lectures : une écriture doit toujours partir. */
export const lecture = parRequete("console.lecture", async (fonction: string, args?: Record<string, unknown>) => {
  const { data, error } = await clientService().rpc(fonction, args);
  return { data, error };
});
