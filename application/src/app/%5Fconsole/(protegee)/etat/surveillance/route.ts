import { ecriture, versCarte } from "@/lib/console/http";
import { lancerSurveillance } from "@/lib/console/surveillance";

/* « Vérifier maintenant » (État technique) : le même passage que celui de
   l'heure, demandé par un administrateur (tracé à son nom). */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, ip }) => {
    const r = await lancerSurveillance("console", user.id, ip);
    if (!r.ok) return versCarte("/etat", "surveillance", { erreur: r.raison });
    const { verifies, defauts, alertes } = r.bilan;
    // Ce que l'alerte a fait, s'il y avait à annoncer.
    const annonce = !alertes ? "" : alertes.envoye
      ? ` Alerte envoyée (${[alertes.ouverts ? `${alertes.ouverts} incident${alertes.ouverts > 1 ? "s" : ""}` : "", alertes.retablis ? `${alertes.retablis} rétabli${alertes.retablis > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ")}).`
      : ` L'alerte n'est pas partie : ${alertes.raison ?? "envoi refusé"} (retentée au prochain passage).`;
    return versCarte("/etat", "surveillance", defauts === 0
      ? { ok: `Vérifié : ${verifies} point${verifies > 1 ? "s" : ""}, tout répond.${annonce}` }
      : { erreur: `Vérifié : ${verifies} point${verifies > 1 ? "s" : ""}, ${defauts} défaut${defauts > 1 ? "s" : ""} (le détail ci-dessous).${annonce}` });
  });
}
