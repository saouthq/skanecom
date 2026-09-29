import { clientService } from "@/lib/console/service";
import { boutiqueDe } from "@/lib/console/equipe-serveur";
import { deNom } from "@/lib/console/libelles";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/* C7 · Fermer son accès support, depuis la console ou depuis le bandeau du
   backoffice (public.console_fermer_support, tracé), puis revenir à la page
   Support de la boutique. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/support`;
  return ecriture(req, async ({ user, ip }) => {
    const boutique = await boutiqueDe(slug);
    if (!boutique) return vers("/");
    const { data, error } = await clientService(ip).rpc("console_fermer_support", {
      p_acteur: user.id,
      p_boutique_id: boutique.id,
    });
    if (error) return versAvecErreur(retour, messageBase(error));
    const ok = data ? `Accès support fermé : vous n'êtes plus dans le backoffice ${deNom(boutique.nom)}.` : "Aucun accès support n'était ouvert.";
    return vers(`${retour}?${new URLSearchParams({ ok })}`);
  });
}
