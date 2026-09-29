import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { litTableur } from "@/lib/console/tableur";
import { lisLignes } from "@/lib/console/import";

const TAILLE_MAX = 5 * 1024 * 1024;

/* Lit le fichier, le traduit en lignes, et demande à la base de les
   vérifier (console_preparer_import) : rien n'est encore écrit au catalogue. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/import`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const fichier = formulaire.get("fichier");
    if (!(fichier instanceof File) || fichier.size === 0) return versAvecErreur(retour, "Choisissez un fichier.");
    if (fichier.size > TAILLE_MAX) return versAvecErreur(retour, "Fichier trop lourd : 5 Mo au plus.");

    let lecture;
    try {
      lecture = lisLignes(litTableur(new Uint8Array(await fichier.arrayBuffer())));
    } catch (e) {
      return versAvecErreur(retour, `Fichier illisible : ${e instanceof Error ? e.message : "format inconnu"}. Enregistrez-le en .xlsx ou en .csv.`);
    }
    if (lecture.erreurs.length > 0) return versAvecErreur(retour, lecture.erreurs.join(" "));

    const { data: id, error } = await clientService(ip).rpc("console_preparer_import", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_fichier: fichier.name,
      p_axes: lecture.axes,
      p_lignes: lecture.lignes,
    });
    if (error) return versAvecErreur(retour, messageBase(error));
    return vers(`${retour}/${id}`);
  });
}
