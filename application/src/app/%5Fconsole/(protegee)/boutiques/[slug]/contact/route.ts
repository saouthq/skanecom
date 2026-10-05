import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";

/* Les coordonnées du client d'une boutique (carte « Le client ») : toute
   l'équipe SkanEcom les tient à jour ; la base normalise les numéros et
   trace les champs changés. */
const CHAMPS = ["nom", "telephone", "whatsapp", "email", "matricule", "adresse", "note"] as const;

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const contact = Object.fromEntries(CHAMPS.map((c) => [c, String(formulaire.get(c) ?? "").slice(0, 1200)]));
    const { data, error } = await clientService(ip).rpc("console_enregistrer_contact", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_contact: contact,
    });
    if (error) {
      const message = error.hint === "numero" || error.hint === "email" ? error.message : messageBase(error);
      return versCarte(retour, "client", { erreur: message });
    }
    const n = Array.isArray(data) ? data.length : 0;
    return versCarte(retour, "client", { ok: n ? "Coordonnées enregistrées." : "Rien n'a changé." });
  });
}
