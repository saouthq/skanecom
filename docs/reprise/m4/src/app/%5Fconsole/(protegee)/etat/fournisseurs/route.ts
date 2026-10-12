import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import { essayerFournisseurs } from "@/lib/console/fournisseurs";

/* « Essayer maintenant » (État technique → Fournisseurs) : un appel
   inoffensif à chaque fournisseur, tout de suite, au journal. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, ip }) => {
    const { error } = await clientService(ip).rpc("console_tracer_fournisseurs", { p_acteur: user.id });
    if (error) return versCarte("/etat", "fournisseurs", { erreur: messageBase(error) });
    const essais = await essayerFournisseurs();
    const [repondent, cassent, autres] = [essais.filter((e) => e.ok === true).length, essais.filter((e) => e.ok === false).length, essais.filter((e) => e.ok === null).length];
    const morceaux = [
      `${repondent} répond${repondent > 1 ? "ent" : ""}`,
      cassent ? `${cassent} en panne` : null,
      autres ? `${autres} non branché${autres > 1 ? "s" : ""} ou simulé${autres > 1 ? "s" : ""}` : null,
    ].filter(Boolean);
    return versCarte("/etat", "fournisseurs", cassent ? { erreur: `Essayés : ${morceaux.join(", ")}.` } : { ok: `Essayés : ${morceaux.join(", ")}.` });
  });
}
