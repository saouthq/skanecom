import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/* Marquer une boutique de démonstration, ou de nouveau cliente
   (public.console_marquer_demonstration : la base revérifie
   l'administrateur et trace le geste). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const demonstration = formulaire.get("demonstration") === "true";
    const { error } = await clientService(ip).rpc("console_marquer_demonstration", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_demonstration: demonstration,
    });
    if (error) return versAvecErreur(retour, messageBase(error));
    const ok = demonstration
      ? "Boutique de démonstration : elle ne compte plus dans la synthèse ni dans « À surveiller »."
      : "Boutique cliente : elle compte de nouveau dans la synthèse et dans « À surveiller ».";
    return vers(`${retour}?${new URLSearchParams({ ok })}#t-demonstration`);
  });
}
