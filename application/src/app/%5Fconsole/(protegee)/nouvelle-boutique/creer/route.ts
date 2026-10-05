import { STRUCTURES } from "@/lib/theme";
import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { messageMetier } from "@/lib/console/metiers";

export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const valeurs = {
      nom: String(formulaire.get("nom") ?? "").trim(),
      slug: String(formulaire.get("slug") ?? "").trim().toLowerCase(),
      hote: String(formulaire.get("hote") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
      theme: (STRUCTURES as string[]).includes(String(formulaire.get("theme"))) ? String(formulaire.get("theme")) : "editorial",
      metier: String(formulaire.get("metier") ?? "").trim(),
      demonstration: formulaire.get("demonstration") === "1" ? "1" : "",
      formule: String(formulaire.get("formule") ?? "").trim(),
      modele: String(formulaire.get("modele") ?? "").trim(),
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
    // La formule vendue : avant le métier, qui pose des réglages (éteints, à la lecture, s'ils sont hors formule).
    if (valeurs.formule) {
      const { error: ef } = await service.rpc("console_changer_formule", { p_acteur: user.id, p_boutique_id: id as string, p_formule: valeurs.formule });
      if (ef) return versAvecErreur(`/boutiques/${valeurs.slug}`, messageBase(ef));
    }
    if (valeurs.demonstration) {
      const { error: ed } = await service.rpc("console_marquer_demonstration", { p_acteur: user.id, p_boutique_id: id as string, p_demonstration: true });
      if (ed) return versAvecErreur(`/boutiques/${valeurs.slug}`, messageBase(ed));
    }
    // À partir d'une boutique : sa configuration (apparence, réglages,
    // livraison, rayons), à la place du métier.
    if (valeurs.modele) {
      const { data: source } = await service.rpc("console_boutique", { p_slug: valeurs.modele });
      const sourceId = (source as { boutique?: { id: string; nom: string } } | null)?.boutique?.id;
      const sourceNom = (source as { boutique?: { nom: string } } | null)?.boutique?.nom ?? valeurs.modele;
      if (!sourceId) return versAvecErreur(`/boutiques/${valeurs.slug}`, "La boutique modèle est introuvable : la nouvelle est créée, vide.");
      const { error: ec } = await service.rpc("console_cloner_configuration", { p_acteur: user.id, p_source: sourceId, p_cible: id as string });
      if (ec) return versAvecErreur(`/boutiques/${valeurs.slug}`, messageBase(ec));
      return vers(`/boutiques/${valeurs.slug}?${new URLSearchParams({ cree: "1", modele: sourceNom })}`);
    }
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
