import { ecriture, versCarte } from "@/lib/console/http";
import { lancerSurveillance } from "@/lib/console/surveillance";

/* « Vérifier maintenant » (État technique) : le même passage que celui de
   l'heure, demandé par un administrateur (tracé à son nom). */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, ip }) => {
    const r = await lancerSurveillance("console", user.id, ip);
    if (!r.ok) return versCarte("/etat", "surveillance", { erreur: r.raison });
    const { verifies, defauts } = r.bilan;
    return versCarte("/etat", "surveillance", defauts === 0
      ? { ok: `Vérifié : ${verifies} point${verifies > 1 ? "s" : ""}, tout répond.` }
      : { erreur: `Vérifié : ${verifies} point${verifies > 1 ? "s" : ""}, ${defauts} défaut${defauts > 1 ? "s" : ""} (le détail ci-dessous).` });
  });
}
