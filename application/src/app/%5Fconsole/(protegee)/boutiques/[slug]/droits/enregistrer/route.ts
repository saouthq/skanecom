import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { millimes } from "@/lib/console/import";
import { formateMontant } from "@/lib/prix";
import { LIBELLES_MODULES } from "@/lib/console/libelles";
import { rafraichirVitrine } from "@/lib/console/vitrine-cache";
import type { DonneesDroits } from "@/lib/console/droits";

/* Personnaliser la formule d'une boutique : les cases cochées sont ce qui
   lui est ouvert ; « Revenir à la formule » reprend exactement sa formule.
   La base garde seulement les écarts, coupe les modules retirés et trace
   le geste (public.console_personnaliser_formule). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/droits`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const service = clientService(ip);
    const boutiqueId = String(formulaire.get("boutique_id") ?? "");
    const prixBrut = String(formulaire.get("prix") ?? "").trim();
    const prix = prixBrut ? millimes(prixBrut) : null;
    if (prix !== null && Number.isNaN(prix)) return versAvecErreur(retour, "Prix illisible : écrivez par exemple 59,000.");
    let droits = formulaire.getAll("droit").map(String);
    if (formulaire.get("revenir") === "1") {
      const { data } = await service.rpc("console_droits_boutique", { p_acteur: user.id, p_boutique_id: boutiqueId });
      droits = ((data as DonneesDroits | null)?.droits ?? []).filter((x) => x.dans_formule).map((x) => x.code);
    }
    const { data, error } = await service.rpc("console_personnaliser_formule", {
      p_acteur: user.id, p_boutique_id: boutiqueId, p_droits: droits, p_prix_millimes: prix,
    });
    if (error) return versAvecErreur(retour, messageBase(error));
    const r = data as {
      change: boolean; ajoutes: string[]; retires: string[]; modules_coupes: string[]; fonctions_eteintes: string[];
      prix_change?: boolean; prix?: number | null;
    };
    if (!r.change) return vers(`${retour}?${new URLSearchParams({ ok: "Rien n'a changé." })}`);
    rafraichirVitrine(slug);
    const phrases = [
      r.ajoutes.length ? `ouvert : ${r.ajoutes.join(", ")}` : null,
      r.retires.length ? `retiré : ${r.retires.join(", ")}` : null,
      r.modules_coupes.length ? `module${r.modules_coupes.length > 1 ? "s" : ""} coupé${r.modules_coupes.length > 1 ? "s" : ""} : ${r.modules_coupes.map((m) => LIBELLES_MODULES[m] ?? m).join(", ")}` : null,
      r.fonctions_eteintes.length ? `éteint sur la vitrine : ${r.fonctions_eteintes.join(", ")}` : null,
      r.prix_change ? (r.prix == null ? "son prix : celui de sa formule" : `son prix : ${formateMontant(r.prix)} TND par mois`) : null,
    ].filter(Boolean).join(" ; ");
    const debut = formulaire.get("revenir") === "1" ? "Revenue à sa formule." : "Formule de la boutique enregistrée.";
    return vers(`${retour}?${new URLSearchParams({ ok: `${debut}${phrases ? ` ${phrases.charAt(0).toUpperCase()}${phrases.slice(1)}.` : ""}` })}`);
  });
}
