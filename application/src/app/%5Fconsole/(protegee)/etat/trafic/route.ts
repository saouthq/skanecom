import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import { releverTrafic } from "@/lib/console/trafic";

/* « Relire maintenant » (État technique → Trafic) : les 25 dernières heures,
   lues tout de suite chez Cloudflare (en lecture seule), au journal. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, ip }) => {
    const { error } = await clientService(ip).rpc("console_tracer_trafic", { p_acteur: user.id });
    if (error) return versCarte("/etat", "trafic", { erreur: messageBase(error) });
    const r = await releverTrafic();
    if (r.ok === null) return versCarte("/etat", "trafic", { erreur: r.detail ?? "Non branché." });
    if (!r.ok) return versCarte("/etat", "trafic", { erreur: `Lecture impossible : ${r.detail ?? "Cloudflare ne répond pas"}.` });
    return versCarte("/etat", "trafic", { ok: r.heures.some((h) => h.principal) ? "Relu : le trafic des dernières 24 heures est à jour." : "Relu : aucune requête de l'application sur les dernières 24 heures." });
  });
}
