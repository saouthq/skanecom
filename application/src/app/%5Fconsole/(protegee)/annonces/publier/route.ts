import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/** « 2026-10-12T09:00 » saisi à Tunis (UTC+1, sans heure d'été) → instant. */
function instantTunis(valeur: string): string | null {
  const v = valeur.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  return `${v}:00+01:00`;
}

/* Publier une annonce aux équipes des boutiques (public.console_publier_annonce). */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const toutes = formulaire.get("toutes") !== "0";
    const cible = toutes ? [] : formulaire.getAll("boutique").map(String).filter(Boolean);
    if (!toutes && cible.length === 0) return versAvecErreur("/annonces", "Choisissez au moins une boutique, ou « toutes les boutiques ».");
    const debut = instantTunis(String(formulaire.get("debut") ?? ""));
    const fin = instantTunis(String(formulaire.get("fin") ?? ""));
    const { error } = await clientService(ip).rpc("console_publier_annonce", {
      p_acteur: user.id,
      p_titre: String(formulaire.get("titre") ?? ""),
      p_texte: String(formulaire.get("texte") ?? ""),
      p_niveau: String(formulaire.get("niveau") ?? "info"),
      p_lien: String(formulaire.get("lien") ?? ""),
      p_debut: debut,
      p_fin: fin,
      p_cible: cible,
    });
    if (error) {
      const message = error.message?.includes("annonces_periode") ? "La fin doit venir après le début."
        : error.message?.includes("lien") ? "Lien refusé : une adresse https://… ou un chemin /gestion/…" : messageBase(error);
      return versAvecErreur("/annonces", message);
    }
    return vers(`/annonces?${new URLSearchParams({ ok: debut && new Date(debut).getTime() > Date.now() ? "Annonce prévue." : "Annonce publiée : les équipes la voient en haut de leur back-office." })}`);
  });
}
