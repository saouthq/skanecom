import { cache } from "react";
import { clientService } from "./service";
import { configSkanFact } from "./skanfact";
import { vigilances, type LignePilotage, type Quotas, type Rappel, type Sante } from "./pilotage";
import { rangeVigilances, type Reportee } from "./accueil";
import type { DonneesFormules } from "./formules";

/* L'état de la plateforme que lisent l'accueil et la navigation (son
   compteur d'alertes) : lu une fois par requête, même si le layout et la
   page le demandent tous deux. */
export const chargeAccueil = cache(async (acteur: string) => {
  const service = clientService();
  const [{ data, error }, { data: df }, { data: ds }, { data: dr }, { data: de }, { data: dv }, { data: dq }] = await Promise.all([
    service.rpc("console_pilotage"),
    service.rpc("console_formules", { p_acteur: acteur }),
    service.rpc("console_sante", { p_acteur: acteur }),
    service.rpc("console_rappels", { p_acteur: acteur }),
    // (une ligne suffit : on n'en lit que la semaine)
    service.rpc("console_envois", { p_acteur: acteur, p_echecs: true, p_limite: 1 }),
    service.rpc("console_vigilances_reportees", { p_acteur: acteur }),
    service.rpc("console_quotas", { p_acteur: acteur }),
  ]);
  if (error) throw new Error(`Boutiques illisibles : ${error.message}`);
  const boutiques = (data ?? []) as LignePilotage[];
  const formules = (df ?? { formules: [], droits: [], boutiques: [] }) as DonneesFormules;
  const maintenant = new Date().getTime();
  const signaux = vigilances(boutiques, maintenant, {
    skanfact: configSkanFact() !== null, sante: (ds ?? []) as Sante[], rappels: (dr ?? []) as Rappel[],
    envoisRefuses: (de as { semaine?: { refuses: number } } | null)?.semaine?.refuses ?? 0,
    quotas: (dq as Quotas | null) ?? null,
  });
  const reportees = (Array.isArray(dv) ? dv : []) as Reportee[];
  return { boutiques, formules, signaux, ...rangeVigilances(signaux, reportees), maintenant };
});
