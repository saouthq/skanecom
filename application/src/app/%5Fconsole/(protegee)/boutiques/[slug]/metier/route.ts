import { clientService } from "@/lib/console/service";
import { ecriture, vers, versAvecErreur } from "@/lib/console/http";
import { messageMetier } from "@/lib/console/metiers";

/* Appliquer le préréglage d'un métier à une boutique vide
   (public.console_appliquer_metier, tracé) : ses rayons, ses
   caractéristiques, sa palette, quelques réglages, son accueil. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const metier = String(formulaire.get("metier") ?? "");
    if (!metier) return versAvecErreur(`/boutiques/${slug}`, "Choisissez un métier.");
    const { data, error } = await clientService(ip).rpc("console_appliquer_metier", {
      p_acteur: user.id, p_boutique_id: String(formulaire.get("boutique_id") ?? ""), p_metier: metier,
    });
    if (error) return versAvecErreur(`/boutiques/${slug}`, messageMetier(error.hint, error.message));
    const r = data as { rayons: number; caracteristiques: number; accueil?: boolean };
    const accueil = r.accueil ? " et son accueil" : "";
    return vers(`/boutiques/${slug}?${new URLSearchParams({ ok: `Préréglage posé : ${r.rayons} rayons, ${r.caracteristiques} caractéristiques, la palette du métier${accueil}.` })}`);
  });
}
