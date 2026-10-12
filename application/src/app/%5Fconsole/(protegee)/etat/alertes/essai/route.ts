import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import { alerteDEssai } from "@/lib/console/surveillance";

/* « Envoyer un essai » : une alerte d'exemple (un incident, un
   rétablissement, le sujet précédé de « [Essai] ») aux adresses réglées,
   pour voir qu'elle arrive — sans rien noter sur les vrais incidents. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, ip }) => {
    const { data, error } = await clientService(ip).rpc("console_alertes", { p_acteur: user.id });
    if (error) return versCarte("/etat", "alertes", { erreur: messageBase(error) });
    const destinataires = (data as { destinataires: string[] }).destinataires;
    const r = await alerteDEssai(destinataires);
    return versCarte("/etat", "alertes", r.ok
      ? { ok: `Essai envoyé à ${destinataires.join(", ")} : il arrive sous « [Essai] Alerte · 1 incident, 1 rétabli ».` }
      : { erreur: `L'essai n'est pas parti : ${r.raison}` });
  });
}
