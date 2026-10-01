import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { messageMetier } from "@/lib/console/metiers";

export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const valeurs = {
      nom: String(formulaire.get("nom") ?? "").trim(),
      slug: String(formulaire.get("slug") ?? "").trim().toLowerCase(),
      hote: String(formulaire.get("hote") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
      theme: formulaire.get("theme") === "technique" ? "technique" : "editorial",
      metier: String(formulaire.get("metier") ?? "").trim(),
    };
    const service = clientService(ip);
    const { data: id, error } = await service.rpc("console_creer_boutique", {
      p_acteur: user.id,
      p_slug: valeurs.slug,
      p_nom: valeurs.nom,
      p_hote: valeurs.hote,
      p_theme: valeurs.theme,
    });
    if (error) return versAvecErreur("/nouvelle-boutique", messageBase(error), valeurs);
    // Le métier : ses rayons, ses caractéristiques, sa palette (le gabarit
    // aussi). La boutique, vide, l'accepte toujours ; un refus est dit sur sa fiche.
    if (valeurs.metier) {
      const { error: em } = await service.rpc("console_appliquer_metier", { p_acteur: user.id, p_boutique_id: id as string, p_metier: valeurs.metier });
      if (em) return versAvecErreur(`/boutiques/${valeurs.slug}`, messageMetier(em.hint, em.message));
      return vers(`/boutiques/${valeurs.slug}?cree=1&metier=1`);
    }
    return vers(`/boutiques/${valeurs.slug}?cree=1`);
  });
}
