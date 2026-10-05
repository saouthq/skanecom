import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { millimes } from "@/lib/console/import";

/* Créer ou modifier une formule (public.console_enregistrer_formule : la
   base revérifie le super-administrateur, les droits, et coupe dans ses
   boutiques un module que la formule n'ouvre plus). */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const neuve = formulaire.get("neuve") === "1";
    const code = String(formulaire.get("code") ?? "").trim().toLowerCase();
    const retour = neuve ? "/formules?nouvelle=1" : "/formules";
    const prixBrut = String(formulaire.get("prix") ?? "").trim();
    const prix = prixBrut ? millimes(prixBrut) : null;
    if (prix !== null && Number.isNaN(prix)) return versAvecErreur(retour, "Prix illisible : écrivez par exemple 49,000.");
    const { data, error } = await clientService(ip).rpc("console_enregistrer_formule", {
      p_acteur: user.id,
      p_code: code,
      p_nom: String(formulaire.get("nom") ?? ""),
      p_description: String(formulaire.get("description") ?? ""),
      p_prix_millimes: prix,
      p_droits: formulaire.getAll("droit").map(String),
    });
    if (error) return versAvecErreur(retour, messageBase(error));
    const r = data as { cree: boolean; modules_coupes: number };
    const nom = String(formulaire.get("nom") ?? code).trim();
    const coupes = r.modules_coupes ? ` ${r.modules_coupes} module${r.modules_coupes > 1 ? "s" : ""} coupé${r.modules_coupes > 1 ? "s" : ""} dans ses boutiques.` : "";
    return vers(`/formules?${new URLSearchParams({ ok: `Formule « ${nom} » ${r.cree ? "créée" : "enregistrée"}.${coupes}` })}#f-${code}`);
  });
}
