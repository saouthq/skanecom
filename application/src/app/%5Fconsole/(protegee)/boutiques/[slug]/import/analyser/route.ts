import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { litTableur } from "@/lib/console/tableur";
import { lisLignes, type AttributImport } from "@/lib/console/import";
import { boutiqueDe } from "@/lib/console/equipe-serveur";

const TAILLE_MAX = 5 * 1024 * 1024;

/* Lit le fichier, le traduit en lignes, et demande à la base de les
   vérifier (console_preparer_import) : rien n'est encore écrit au catalogue.
   Les colonnes qui nomment une caractéristique de la boutique (B9) vont à
   la fiche technique des produits. La boutique vient de l'adresse. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/import`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const fichier = formulaire.get("fichier");
    if (!(fichier instanceof File) || fichier.size === 0) return versAvecErreur(retour, "Choisissez un fichier.");
    if (fichier.size > TAILLE_MAX) return versAvecErreur(retour, "Fichier trop lourd : 5 Mo au plus.");

    const boutique = await boutiqueDe(slug);
    if (!boutique) return vers("/");
    const { data: definis } = await clientService().from("attributs").select("cle, label_fr, unite, type").eq("boutique_id", boutique.id);
    const attributs: AttributImport[] = ((definis ?? []) as { cle: string; label_fr: string; unite: string | null; type: "texte" | "nombre" }[])
      .map((a) => ({ cle: a.cle, label: a.label_fr, unite: a.unite, type: a.type }));

    let lecture;
    try {
      lecture = lisLignes(litTableur(new Uint8Array(await fichier.arrayBuffer())), attributs);
    } catch (e) {
      return versAvecErreur(retour, `Fichier illisible : ${e instanceof Error ? e.message : "format inconnu"}. Enregistrez-le en .xlsx ou en .csv.`);
    }
    if (lecture.erreurs.length > 0) return versAvecErreur(retour, lecture.erreurs.join(" "));

    const { data: id, error } = await clientService(ip).rpc("console_preparer_import", {
      p_acteur: user.id,
      p_boutique_id: boutique.id,
      p_fichier: fichier.name,
      p_axes: lecture.axes,
      p_lignes: lecture.lignes,
    });
    if (error) return versAvecErreur(retour, messageBase(error));
    return vers(`${retour}/${id}`);
  });
}
