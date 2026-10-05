import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versCarte } from "@/lib/console/http";
import { rafraichirVitrine } from "@/lib/console/vitrine-cache";
import { LIBELLES_MODULES } from "@/lib/console/libelles";
import { SANS_FORMULE, type DonneesFormules } from "@/lib/console/formules";

/* Changer la formule d'une boutique (public.console_changer_formule : coupe
   les modules qu'elle n'ouvre plus, dit les fonctions qui s'éteignent). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    // Depuis l'onglet Formule, on y revient ; depuis la fiche, à sa carte.
    const versDroits = formulaire.get("retour") === "droits";
    const retour = `/boutiques/${slug}`;
    const dire = (m: { ok: string } | { erreur: string }) =>
      versDroits ? vers(`${retour}/droits?${new URLSearchParams(m)}`) : versCarte(retour, "formule", m);
    const formule = String(formulaire.get("formule") ?? "");
    const { data, error } = await clientService(ip).rpc("console_changer_formule", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_formule: formule || null,
    });
    if (error) return dire({ erreur: messageBase(error) });
    const r = data as { change: boolean; modules_coupes: string[]; fonctions_eteintes: string[] };
    if (!r.change) return dire({ ok: "La formule n'a pas changé." });
    rafraichirVitrine(slug);
    const { data: df } = await clientService(ip).rpc("console_formules", { p_acteur: user.id });
    const nom = ((df as DonneesFormules | null)?.formules ?? []).find((f) => f.code === formule)?.nom ?? SANS_FORMULE.toLowerCase();
    const coupes = r.modules_coupes.map((m) => LIBELLES_MODULES[m] ?? m);
    const suite = [
      coupes.length ? `module${coupes.length > 1 ? "s" : ""} coupé${coupes.length > 1 ? "s" : ""} : ${coupes.join(", ")}` : null,
      r.fonctions_eteintes.length ? `éteint${r.fonctions_eteintes.length > 1 ? "es" : "e"} sur la vitrine : ${r.fonctions_eteintes.join(", ")}` : null,
    ].filter(Boolean).join(" ; ");
    return dire({ ok: `Formule « ${nom} » posée.${suite ? ` ${suite.charAt(0).toUpperCase()}${suite.slice(1)}.` : ""}` });
  });
}
