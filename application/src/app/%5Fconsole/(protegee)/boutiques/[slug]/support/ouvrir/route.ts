import { clientService } from "@/lib/console/service";
import { boutiqueDe } from "@/lib/console/equipe-serveur";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/* C7 · Ouvrir un accès support au backoffice de la boutique, puis y entrer
   (public.console_ouvrir_support : la base revérifie l'administrateur, borne
   le mode, le motif et la durée, referme l'accès précédent et trace le
   geste). La boutique vient de l'adresse, jamais du formulaire. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/support`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const boutique = await boutiqueDe(slug);
    if (!boutique) return vers("/");
    const motif = String(formulaire.get("motif") ?? "");
    const { error } = await clientService(ip).rpc("console_ouvrir_support", {
      p_acteur: user.id,
      p_boutique_id: boutique.id,
      p_role: String(formulaire.get("role") ?? ""),
      p_motif: motif,
      p_minutes: Number(formulaire.get("minutes") ?? 0),
    });
    if (error) {
      const lisible = ["role", "motif", "duree"].includes(error.hint ?? "") ? (error.message ?? "") : messageBase(error);
      return versAvecErreur(retour, lisible, { motif: motif.slice(0, 300) });
    }
    return vers(`/gestion/${slug}`);
  });
}
