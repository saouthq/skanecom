import { clientService } from "@/lib/console/service";
import { boutiqueDe } from "@/lib/console/equipe-serveur";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/* Délier une boutique de son client SkanFact : la console oublie le lien et
   la situation gardée ; dans SkanFact, rien ne change (ni le client, ni ses
   factures). Tracé. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/facturation`;
  return ecriture(req, async ({ user, ip }) => {
    const boutique = await boutiqueDe(slug);
    if (!boutique) return vers("/");
    const { error } = await clientService(ip).rpc("console_delier_skanfact", { p_acteur: user.id, p_boutique_id: boutique.id });
    if (error) return versAvecErreur(retour, messageBase(error));
    return vers(`${retour}?${new URLSearchParams({ ok: `${boutique.nom} n'est plus reliée à SkanFact. Ses factures, elles, restent dans SkanFact.` })}`);
  });
}
