import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import { viderFiles } from "@/lib/console/taches";

/* « Faire partir les files maintenant » (État technique → Tâches de fond,
   super-administrateur) : un tour des tâches de fond, tout de suite, au journal. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, ip }) => {
    const { error } = await clientService(ip).rpc("console_tracer_taches", { p_acteur: user.id });
    if (error) return versCarte("/etat", "taches", { erreur: messageBase(error) });
    const b = await viderFiles("console", 20_000);
    const morceaux = [
      b.courriels.faits || b.courriels.echecs
        ? `${b.courriels.faits} e-mail${b.courriels.faits > 1 ? "s" : ""} de commande parti${b.courriels.faits > 1 ? "s" : ""}${b.courriels.echecs ? `, ${b.courriels.echecs} en échec` : ""}`
        : "aucun e-mail de commande dû",
      b.skanfact.boutiques
        ? `${b.skanfact.faits} envoi${b.skanfact.faits > 1 ? "s" : ""} arrivé${b.skanfact.faits > 1 ? "s" : ""} dans SkanFact${b.skanfact.echecs ? `, ${b.skanfact.echecs} refusé${b.skanfact.echecs > 1 ? "s" : ""}` : ""}${b.skanfact.plus_tard ? `, ${b.skanfact.plus_tard} pour plus tard` : ""}`
        : "aucun envoi à SkanFact dû",
    ];
    return versCarte("/etat", "taches", { ok: `Tour fait : ${morceaux.join(" ; ")}.` });
  });
}
