import { accesEquipe } from "@/lib/console/session";
import { memeOrigine } from "@/lib/console/http";
import { defautImage } from "@/lib/console/images-marque";
import { POIDS_MAX, deposerFichier, dimensionsImage, sansMetadonnees, typeImage } from "@/lib/gestion/fichiers";
import { PEUT_ECRIRE } from "@/lib/gestion/pages";
import { CHEMIN_PHOTO_ACCUEIL, EMPLACEMENTS_ACCUEIL, type EmplacementAccueil } from "@/lib/gestion/accueil";

/* ============================================================================
   UNE PHOTO DE L'ACCUEIL, DEPUIS LE BACKOFFICE — l'ouverture, son cadrage
   pour téléphone, le récit. Le composeur la réduit dans le navigateur
   (WebP), l'envoie ici, puis la pose dans sa section : c'est
   « Enregistrer l'accueil » qui l'inscrit au thème (la base revérifie que
   le chemin est dans le dossier de la boutique).

   Ici : le rôle d'abord (rien n'est déposé pour qui ne compose pas), puis
   le fichier — son type d'après ses octets, ses dimensions lues dans son
   en-tête, les règles de l'emplacement —, ses métadonnées ôtées, déposé
   sous `<boutique>/accueil/photo-<12 caractères>.<ext>`.
   ========================================================================== */

export const dynamic = "force-dynamic";

const ENVOI_MAX = 12 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug } = await params;
  const refus = (message: string, status = 200) => Response.json({ ok: false, message }, { status, headers: { "cache-control": "no-store" } });
  if (Number(req.headers.get("content-length") ?? 0) > ENVOI_MAX) return refus("Envoi trop lourd : 10 Mo au plus par photo.");

  const a = await accesEquipe();
  if (a.etat !== "ok") return refus("Votre session a expiré : reconnectez-vous, puis recommencez.", 401);
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });
  if (!PEUT_ECRIRE.includes(boutique.role)) return refus("Seuls le propriétaire et l'administrateur composent l'accueil.", 403);

  const f = await req.formData();
  const e = String(f.get("emplacement") ?? "") as EmplacementAccueil;
  if (!EMPLACEMENTS_ACCUEIL.includes(e)) return refus("Emplacement de photo inconnu.");
  const fichier = f.get("fichier");
  if (!fichier || typeof fichier === "string" || fichier.size === 0) return refus("Choisissez une photo.");
  if (fichier.size > POIDS_MAX) return refus("Cette photo pèse plus de 10 Mo.");

  const octets = sansMetadonnees(new Uint8Array(await fichier.arrayBuffer()));
  const genre = typeImage(octets);
  if (!genre) return refus("Ce fichier n'est pas une photo JPEG, PNG ou WebP.");
  const dimensions = dimensionsImage(octets);
  if (!dimensions) return refus("Cette photo est illisible.");
  const defaut = defautImage(e, dimensions.largeur, dimensions.hauteur);
  if (defaut) return refus(defaut);

  const chemin = `${slug}/accueil/photo-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}.${genre.extension}`;
  if (!CHEMIN_PHOTO_ACCUEIL(slug).test(chemin)) return refus("Adresse de la boutique illisible.");
  try {
    await deposerFichier(chemin, octets.slice().buffer, genre.type);
  } catch (err) {
    console.error("accueil : dépôt de la photo en échec", err);
    return refus("Le dépôt de la photo a échoué : recommencez dans un instant.");
  }
  return Response.json({ ok: true, chemin, ...dimensions }, { headers: { "cache-control": "no-store" } });
}
