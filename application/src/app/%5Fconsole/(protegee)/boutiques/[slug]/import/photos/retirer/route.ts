import { clientService } from "@/lib/console/service";
import { boutiqueDe } from "@/lib/console/equipe-serveur";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { retirerFichier } from "@/lib/gestion/fichiers";

/* C5 · Retirer un envoi de photos entier (public.console_retirer_lot_photos,
   tracé) : ses photos quittent les produits, puis les fichiers que plus rien
   n'emploie quittent R2. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/import/photos`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const boutique = await boutiqueDe(slug);
    if (!boutique) return vers("/");
    const { data, error } = await clientService(ip).rpc("console_retirer_lot_photos", {
      p_acteur: user.id,
      p_boutique_id: boutique.id,
      p_lot: String(formulaire.get("lot") ?? ""),
    });
    if (error) return versAvecErreur(retour, error.hint === "lot" ? (error.message ?? "") : messageBase(error));
    const r = data as { retirees: number; produits: number; orphelins: string[] };
    await Promise.all(r.orphelins.map((c) => retirerFichier(c).catch((e) => console.error(`photos à l'import : ${c} reste sur R2`, e))));
    const ok = `${r.retirees} photo${r.retirees > 1 ? "s" : ""} retirée${r.retirees > 1 ? "s" : ""} de ${r.produits} produit${r.produits > 1 ? "s" : ""}.`;
    return vers(`${retour}?${new URLSearchParams({ ok })}`);
  });
}
