import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers } from "@/lib/console/http";

/* Publier le brouillon (super-administrateur) : refusé tant qu'un champ
   entre crochets reste à compléter, ou, après la première, sans dire ce
   qui change. Publiée, la version ne change plus. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const { data, error } = await clientService(ip).rpc("console_publier_conditions", {
      p_acteur: user.id, p_version: Number(formulaire.get("version") ?? 0),
    });
    if (error) {
      const lisible = ["a_completer", "changements", "version"].includes(error.hint ?? "");
      return vers(`/conditions?${new URLSearchParams({ erreur: lisible ? `${error.message}.` : messageBase(error) })}#t-cdt-brouillon`);
    }
    return vers(`/conditions?${new URLSearchParams({ ok: `Version ${data} publiée : chaque propriétaire la trouve dans son backoffice, à accepter.` })}`);
  });
}
