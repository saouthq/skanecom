import { clientService } from "./service";
import { tourCourriels } from "@/lib/courriels/commandes";
import { envoyerFile } from "@/lib/gestion/skanfact";

/* ============================================================================
   LES TÂCHES DE FOND — vider les files d'envoi de toutes les boutiques.

   Chaque heure (le passage de la surveillance, avant de vérifier), ou à la
   demande (État technique → Tâches de fond) : les e-mails de commande dus,
   puis les envois à SkanFact dus, boutique par boutique, dans un temps
   borné — ce qui n'a pas eu le temps part au tour suivant. Chaque tour est
   noté (public.taches_noter) : quand, ce qui est parti, ce qui reste.
   Ne lève jamais : une file qui casse n'empêche pas l'autre, ni le passage.
   ========================================================================== */

export type Declencheur = "heure" | "console";
export type BilanTaches = {
  courriels: { faits: number; echecs: number; raison: string | null };
  skanfact: { faits: number; echecs: number; plus_tard: number; boutiques: number; raison: string | null };
};

const enClair = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export async function viderFiles(declencheur: Declencheur, budgetMs = 25_000): Promise<BilanTaches> {
  const service = clientService();
  const fin = Date.now() + budgetMs;
  const bilan: BilanTaches = {
    courriels: { faits: 0, echecs: 0, raison: null },
    skanfact: { faits: 0, echecs: 0, plus_tard: 0, boutiques: 0, raison: null },
  };

  // 1. Les e-mails de commande : dix par tour de file, tant qu'il en reste de dus.
  const debutC = new Date().toISOString();
  let okC = true;
  try {
    for (let i = 0; i < 10 && Date.now() < fin; i++) {
      const r = await tourCourriels(null);
      bilan.courriels.faits += r.partis;
      bilan.courriels.echecs += r.essayes - r.partis;
      if (r.raison) bilan.courriels.raison = r.raison;
      if (r.erreur) { okC = false; bilan.courriels.raison = r.erreur; break; }
      if (r.essayes < 10) break;
    }
  } catch (e) {
    okC = false;
    bilan.courriels.raison = enClair(e);
  }
  await service.rpc("taches_noter", {
    p_tache: "courriels", p_declencheur: declencheur, p_debut: debutC, p_ok: okC,
    p_faits: bilan.courriels.faits, p_echecs: bilan.courriels.echecs, p_detail: bilan.courriels.raison,
  });

  // 2. Les envois à SkanFact (et les clés à couper), boutique par boutique.
  const debutS = new Date().toISOString();
  let okS = true;
  try {
    const { data, error } = await service.rpc("taches_skanfact_dues", { p_limite: 30 });
    if (error) throw new Error(error.message);
    for (const id of (data ?? []) as string[]) {
      const reste = fin - Date.now();
      if (reste < 1500) { bilan.skanfact.raison = "Le temps du tour est écoulé : le reste part au tour suivant."; break; }
      const b = await envoyerFile(id, { max: 20, budgetMs: Math.min(6000, reste - 500) });
      bilan.skanfact.boutiques += 1;
      bilan.skanfact.faits += b.faits;
      bilan.skanfact.echecs += b.refuses;
      bilan.skanfact.plus_tard += b.plus_tard;
    }
    if (!bilan.skanfact.raison && bilan.skanfact.plus_tard) bilan.skanfact.raison = `${bilan.skanfact.plus_tard} pour plus tard : SkanFact n'a pas pris l'envoi cette fois.`;
  } catch (e) {
    okS = false;
    bilan.skanfact.raison = enClair(e);
  }
  await service.rpc("taches_noter", {
    p_tache: "skanfact", p_declencheur: declencheur, p_debut: debutS, p_ok: okS,
    p_faits: bilan.skanfact.faits, p_echecs: bilan.skanfact.echecs, p_detail: bilan.skanfact.raison,
  });
  return bilan;
}
