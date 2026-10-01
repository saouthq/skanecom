import { chargeCadre } from "@/lib/boutique";
import { clientAcheteur } from "@/lib/supabase-acheteur";
import { memeOrigine } from "@/lib/origine";
import { POIDS_MAX, deposerFichier, dimensionsImage, retirerFichier, sansMetadonnees, typeImage } from "@/lib/gestion/fichiers";

/* Les photos d'un avis (réglage avis.photos), envoyées par « Donner mon
   avis » (components/DonnerAvis.tsx) juste après l'avis : le navigateur les
   a réduites (lib/reduire-photo.ts) ; ici, on lit ce qu'elles contiennent
   (JPEG, PNG ou WebP d'après leurs premiers octets, 10 Mo au plus), on leur
   ôte leurs métadonnées (lieu, appareil), on les dépose sous
   <boutique>/avis/<avis>/, puis la base les inscrit — pour l'auteur de
   l'avis seulement, trois au plus, dans l'heure
   (public.ajouter_photo_avis). Refusée par la base, la photo est retirée
   aussitôt. Réponse : combien sont passées, et pourquoi la première
   refusée l'a été. */

export const dynamic = "force-dynamic";

const ENVOI_MAX = 32 * 1024 * 1024;

const MESSAGES: Record<string, string> = {
  compte: "Reconnectez-vous pour joindre vos photos.",
  module: "Cette boutique ne recueille pas de photos avec les avis.",
  avis: "Avis introuvable.",
  delai: "Les photos se joignent au moment de donner son avis.",
  nombre: "Trois photos au plus par avis.",
  chemin: "Photo refusée.",
};

function reponse(passees: number, erreur: string | null, statut = 200): Response {
  return Response.json({ passees, erreur }, { status: statut, headers: { "cache-control": "private, no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  if (!memeOrigine(req)) return reponse(0, "Origine refusée.", 403);
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre?.avisPhotos) return reponse(0, MESSAGES.module, 404);
  if (Number(req.headers.get("content-length") ?? 0) > ENVOI_MAX) return reponse(0, "Envoi trop lourd.", 413);

  const sb = await clientAcheteur();
  if (!(await sb.auth.getSession()).data.session) return reponse(0, MESSAGES.compte, 401);
  let f: FormData;
  try {
    f = await req.formData();
  } catch {
    return reponse(0, "Envoi illisible : recommencez.", 400);
  }
  const avis = String(f.get("avis_id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(avis)) return reponse(0, MESSAGES.avis, 400);
  const fichiers = f.getAll("photos").filter((x): x is File => typeof x !== "string" && x.size > 0).slice(0, 3);

  let passees = 0;
  for (const fichier of fichiers) {
    if (fichier.size > POIDS_MAX) return reponse(passees, "Une photo pèse plus de 10 Mo.");
    // Sans ses métadonnées (le lieu de la prise de vue) : elle sera publique.
    const octets = sansMetadonnees(new Uint8Array(await fichier.arrayBuffer()));
    const corps = octets.slice().buffer;
    const genre = typeImage(octets.subarray(0, 16));
    if (!genre) return reponse(passees, "Une photo n'est ni JPEG, ni PNG, ni WebP.");
    const dims = dimensionsImage(octets);
    const chemin = `${cadre.boutique.slug}/avis/${avis}/${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}.${genre.extension}`;
    try {
      await deposerFichier(chemin, corps, genre.type);
    } catch (e) {
      console.error("avis : dépôt de la photo en échec", e);
      return reponse(passees, "Le dépôt de la photo a échoué : votre avis est bien parti.");
    }
    const { error } = await sb.rpc("ajouter_photo_avis", {
      p_boutique_id: cadre.boutique.id, p_avis_id: avis, p_chemin: chemin,
      p_largeur: dims?.largeur ?? null, p_hauteur: dims?.hauteur ?? null,
    });
    if (error) {
      await retirerFichier(chemin).catch(() => {});
      return reponse(passees, MESSAGES[error.hint ?? ""] ?? "Photo refusée.");
    }
    passees += 1;
  }
  return reponse(passees, null);
}
