import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { millimes } from "@/lib/console/import";
import type { DonneesFormules } from "@/lib/console/formules";

/* Enregistrer les formules : tout le tableau arrive en un envoi (champs
   « nom__pro », « droit__pro »…, et « …__neuve » pour une formule à créer).
   Seules celles qui ont changé passent par public.console_enregistrer_formule
   (la base revérifie le super-administrateur, les droits, et coupe dans ses
   boutiques un module que la formule n'ouvre plus) : rien d'inutile au journal. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const service = clientService(ip);
    const neuve = formulaire.get("neuve") === "1";
    const retour = neuve ? "/formules?nouvelle=1" : "/formules";
    const { data: d } = await service.rpc("console_formules", { p_acteur: user.id });
    const actuelles = new Map(((d ?? { formules: [] }) as DonneesFormules).formules.map((f) => [f.code, f]));

    const lue = (cle: string) => {
      const prixBrut = String(formulaire.get(`prix__${cle}`) ?? "").trim();
      const prix = prixBrut ? millimes(prixBrut) : null;
      return {
        nom: String(formulaire.get(`nom__${cle}`) ?? "").trim(),
        description: String(formulaire.get(`description__${cle}`) ?? "").trim(),
        prix, prixIllisible: prix !== null && Number.isNaN(prix),
        droits: formulaire.getAll(`droit__${cle}`).map(String).sort(),
      };
    };

    const aEcrire: { code: string; v: ReturnType<typeof lue> }[] = [];
    for (const code of formulaire.getAll("codes").map(String)) {
      const v = lue(code);
      const avant = actuelles.get(code);
      if (!avant) continue;
      if (v.prixIllisible) return versAvecErreur(retour, `Prix de « ${v.nom || avant.nom} » illisible : écrivez par exemple 49,000.`);
      const change = v.nom !== avant.nom || v.description !== (avant.description ?? "") || v.prix !== avant.prix
        || v.droits.join(",") !== [...avant.droits].sort().join(",");
      if (change) aEcrire.push({ code, v });
    }
    if (neuve) {
      const code = String(formulaire.get("code__neuve") ?? "").trim().toLowerCase();
      const v = lue("neuve");
      if (v.prixIllisible) return versAvecErreur(retour, "Prix de la nouvelle formule illisible : écrivez par exemple 49,000.");
      aEcrire.push({ code, v });
    }
    if (!aEcrire.length) return vers(`/formules?${new URLSearchParams({ ok: "Rien n'a changé." })}`);

    const faites: string[] = [];
    let coupes = 0;
    let creee: string | null = null;
    for (const { code, v } of aEcrire) {
      const { data, error } = await service.rpc("console_enregistrer_formule", {
        p_acteur: user.id, p_code: code, p_nom: v.nom, p_description: v.description, p_prix_millimes: v.prix, p_droits: v.droits,
      });
      if (error) {
        const deja = faites.length ? ` (${faites.join(", ")} : enregistrée${faites.length > 1 ? "s" : ""})` : "";
        return versAvecErreur(retour, `« ${v.nom || code} » : ${messageBase(error)}${deja}`);
      }
      const r = data as { cree: boolean; modules_coupes: number };
      coupes += r.modules_coupes;
      if (r.cree) creee = code;
      faites.push(`« ${v.nom || code} »`);
    }
    const dit = faites.length === 1 ? `Formule ${faites[0]} ${creee ? "créée" : "enregistrée"}.` : `Formules ${faites.join(", ")} enregistrées.`;
    const suite = coupes ? ` ${coupes} module${coupes > 1 ? "s" : ""} coupé${coupes > 1 ? "s" : ""} dans leurs boutiques.` : "";
    return vers(`/formules?${new URLSearchParams({ ok: dit + suite })}${creee ? `#f-${creee}` : ""}`);
  });
}
