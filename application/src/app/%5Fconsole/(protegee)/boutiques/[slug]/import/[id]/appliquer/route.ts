import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return ecriture(req, async ({ user, ip }) => {
    const { data, error } = await clientService(ip).rpc("console_appliquer_import", { p_acteur: user.id, p_import_id: id });
    if (error) return versAvecErreur(`/boutiques/${slug}/import/${id}`, messageBase(error));
    const r = data as { produits: number; lignes: number };
    return vers(`/boutiques/${slug}?${new URLSearchParams({ ok: `Catalogue importé : ${r.produits} produits, ${r.lignes} variantes.` })}`);
  });
}
