import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers } from "@/lib/console/http";

/* Les erreurs de l'application (État technique) : en marquer une réglée, ou
   toutes celles d'une boutique, ou toutes (public.console_regler_erreurs :
   le support le peut aussi, au journal). Revenue, une erreur réglée se note
   de nouveau. On revient à la carte, avec son filtre. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const id = Number.parseInt(String(formulaire.get("id") ?? ""), 10);
    const boutique = String(formulaire.get("boutique_id") ?? "").trim() || null;
    const filtre = String(formulaire.get("filtre") ?? "").trim();
    const retour = (m: Record<string, string>) =>
      vers(`/etat?${new URLSearchParams({ ...m, carte: "erreurs", ...(filtre ? { erreurs: filtre } : {}) })}#t-erreurs`);
    const { data, error } = await clientService(ip).rpc("console_regler_erreurs", {
      p_acteur: user.id, p_ids: Number.isFinite(id) ? [id] : null, p_boutique_id: boutique,
    });
    if (error) return retour({ erreur: error.hint === "etat" ? `${error.message}.` : messageBase(error) });
    const n = Number(data ?? 0);
    return retour({
      ok: n > 1 ? `${n} erreurs marquées réglées. Si l'une revient, elle se note de nouveau.` : "Erreur marquée réglée. Si elle revient, elle se note de nouveau.",
    });
  });
}
