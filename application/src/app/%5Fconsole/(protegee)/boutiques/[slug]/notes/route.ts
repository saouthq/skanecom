import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";

/* Les notes de suivi d'une boutique : ajouter, épingler, détacher, retirer. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const geste = String(formulaire.get("geste") ?? "ajouter");
    const service = clientService(ip);
    if (geste === "ajouter") {
      const { error } = await service.rpc("console_ajouter_note", {
        p_acteur: user.id,
        p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
        p_texte: String(formulaire.get("texte") ?? ""),
        p_epinglee: formulaire.get("epinglee") === "1",
      });
      if (error) return versCarte(retour, "notes", { erreur: messageBase(error) });
      return versCarte(retour, "notes", { ok: "Note gardée." });
    }
    const { error } = await service.rpc("console_changer_note", {
      p_acteur: user.id,
      p_note_id: Number(formulaire.get("note_id") ?? 0),
      p_geste: geste,
    });
    if (error) return versCarte(retour, "notes", { erreur: messageBase(error) });
    const dit: Record<string, string> = { epingler: "Note épinglée en tête.", detacher: "Note détachée.", supprimer: "Note retirée." };
    return versCarte(retour, "notes", { ok: dit[geste] ?? "C'est fait." });
  });
}
