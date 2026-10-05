import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { LIBELLE_ETAPE, type EtapeProspect } from "@/lib/console/prospects";

/* Faire avancer un prospect d'une étape (perdu : un motif). Tracé. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const id = String(formulaire.get("id") ?? "");
    const etape = String(formulaire.get("etape") ?? "") as EtapeProspect;
    const motif = String(formulaire.get("motif") ?? "").slice(0, 300);
    const { error } = await clientService(ip).rpc("console_etape_prospect", { p_acteur: user.id, p_id: id, p_etape: etape, p_motif: motif || null });
    if (error) return versAvecErreur("/prospects", error.hint === "motif" ? error.message : messageBase(error), { ouvert: id });
    const ok = `Étape : ${LIBELLE_ETAPE[etape] ?? etape}.`;
    return vers(`/prospects?${new URLSearchParams({ ok, vu: id })}#p-${id}`);
  });
}
