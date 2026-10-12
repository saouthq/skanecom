import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";

/* Les alertes de la surveillance (État technique) : les allumer, dire à qui
   écrire (public.console_regler_alertes : super-administrateur, au journal).
   Les adresses : une par ligne, ou séparées par des virgules. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const actives = formulaire.get("actives") === "oui";
    const destinataires = String(formulaire.get("destinataires") ?? "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    const { data, error } = await clientService(ip).rpc("console_regler_alertes", {
      p_acteur: user.id, p_actives: actives, p_destinataires: destinataires,
    });
    if (error) return versCarte("/etat", "alertes", { erreur: error.hint === "adresse" ? `${error.message}.` : messageBase(error) });
    const n = ((data as { destinataires?: string[] } | null)?.destinataires ?? []).length;
    return versCarte("/etat", "alertes", {
      ok: actives
        ? `Alertes allumées : ${n > 1 ? `${n} adresses seront prévenues` : "une adresse sera prévenue"} dès qu'un incident s'ouvre, puis quand il se rétablit.`
        : "Alertes coupées : les incidents restent suivis ici, sans e-mail.",
    });
  });
}
