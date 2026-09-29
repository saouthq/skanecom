import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { LIBELLES_MODULES } from "@/lib/console/libelles";

/* C3 · Activer ou couper un module (public.console_changer_module : la base
   revérifie l'administrateur, refuse un module à venir, trace le geste). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/modules`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const code = String(formulaire.get("module") ?? "");
    const actif = formulaire.get("actif") === "true";
    const { error } = await clientService(ip).rpc("console_changer_module", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_module: code,
      p_actif: actif,
    });
    if (error) return versAvecErreur(retour, error.hint === "a_venir" ? (error.message ?? "") : messageBase(error));
    const nom = LIBELLES_MODULES[code] ?? code;
    return vers(`${retour}?${new URLSearchParams({
      ok: actif ? `« ${nom} » activé : la vitrine le propose d'ici cinq minutes.` : `« ${nom} » coupé : la vitrine ne le propose plus d'ici cinq minutes.`,
    })}`);
  });
}
