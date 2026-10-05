import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { LIBELLES_MODULES } from "@/lib/console/libelles";
import { rafraichirVitrine } from "@/lib/console/vitrine-cache";

/* C3 · Activer ou couper un module (public.console_changer_module : la base
   revérifie l'administrateur, refuse un module à venir, trace le geste). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/modules`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const code = String(formulaire.get("module") ?? "");
    const actif = formulaire.get("actif") === "true";
    // Un module hors formule : l'ouvrir d'abord à cette boutique (un écart à sa formule, tracé).
    if (actif && new URL(req.url).searchParams.get("ouvrir") === "1") {
      const { error: e } = await clientService(ip).rpc("console_ouvrir_droit", {
        p_acteur: user.id, p_boutique_id: String(formulaire.get("boutique_id") ?? ""), p_droit: `module.${code}`, p_ouvert: true,
      });
      if (e) return versAvecErreur(retour, messageBase(e));
    }
    const { error } = await clientService(ip).rpc("console_changer_module", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_module: code,
      p_actif: actif,
    });
    if (error) return versAvecErreur(retour, error.hint === "a_venir" ? (error.message ?? "") : messageBase(error));
    rafraichirVitrine(slug);
    const nom = LIBELLES_MODULES[code] ?? code;
    const ouvert = actif && new URL(req.url).searchParams.get("ouvrir") === "1" ? " Il lui est ouvert en plus de sa formule (onglet Formule)." : "";
    return vers(`${retour}?${new URLSearchParams({
      ok: actif ? `« ${nom} » activé : la vitrine le propose dès maintenant.${ouvert}` : `« ${nom} » coupé : la vitrine ne le propose plus.`,
    })}`);
  });
}
