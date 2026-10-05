import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import { jourValide } from "@/lib/console/journal";

/* Les notes de suivi d'une boutique : ajouter (avec un rappel daté, au
   besoin), épingler, détacher, dire le rappel fait, retirer. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const geste = String(formulaire.get("geste") ?? "ajouter");
    const service = clientService(ip);
    if (geste === "ajouter") {
      const saisi = String(formulaire.get("rappel") ?? "").trim();
      const rappel = jourValide(saisi);
      if (saisi && !rappel) return versCarte(retour, "notes", { erreur: "La date du rappel n'est pas lisible." });
      const { error } = await service.rpc("console_ajouter_note", {
        p_acteur: user.id,
        p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
        p_texte: String(formulaire.get("texte") ?? ""),
        p_epinglee: formulaire.get("epinglee") === "1",
        p_rappel: rappel,
      });
      if (error) {
        const message = error.hint === "rappel" ? "Un rappel se pose dans l'année qui vient." : messageBase(error);
        return versCarte(retour, "notes", { erreur: message });
      }
      return versCarte(retour, "notes", { ok: rappel ? "Note gardée : elle reviendra dans « À surveiller » le jour dit." : "Note gardée." });
    }
    const { error } = await service.rpc("console_changer_note", {
      p_acteur: user.id,
      p_note_id: Number(formulaire.get("note_id") ?? 0),
      p_geste: geste,
    });
    if (error) return versCarte(retour, "notes", { erreur: messageBase(error) });
    const dit: Record<string, string> = { epingler: "Note épinglée en tête.", detacher: "Note détachée.", supprimer: "Note retirée.", rappel_fait: "Rappel fait : la note ne remonte plus." };
    return versCarte(retour, "notes", { ok: dit[geste] ?? "C'est fait." });
  });
}
