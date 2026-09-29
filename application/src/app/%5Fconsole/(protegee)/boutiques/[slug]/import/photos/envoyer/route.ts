import { clientService } from "@/lib/console/service";
import { boutiqueDe } from "@/lib/console/equipe-serveur";
import { acces } from "@/lib/console/session";
import { ipDe, memeOrigine } from "@/lib/console/http";
import { POIDS_MAX, deposerFichier, retirerFichier, typeImage } from "@/lib/gestion/fichiers";

/* ============================================================================
   C5 · UNE PHOTO À L'IMPORT — appelée par la page des photos (fetch), une
   photo par envoi, déjà réduite par le navigateur. Le serveur revérifie
   tout : administrateur en double authentification, même origine, poids,
   type d'après les premiers octets ; il dépose le fichier sous
   `<slug>/produits/<produit>/`, puis public.console_ajouter_photo l'inscrit
   dans son lot (la base revérifie le produit, la déclinaison, le dossier et
   les douze photos au plus). Si la base refuse, le fichier est retiré.
   Réponse en JSON : { ok } ou { ok: false, message }.
   ========================================================================== */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const MESSAGES: Record<string, string> = {
  photos: "ce produit a déjà douze photos",
  variante: "la déclinaison n'est pas celle du produit",
  chemin: "dossier refusé",
  lot: "l'envoi est clos : rechargez la page",
  produit: "le produit n'existe plus",
};

function reponse(corps: { ok: boolean; message?: string }, status = 200): Response {
  return Response.json(corps, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!memeOrigine(req)) return reponse({ ok: false, message: "origine refusée" }, 403);
  const a = await acces();
  if (a.etat !== "ok") return reponse({ ok: false, message: "session à rouvrir" }, 401);
  const { slug } = await params;
  const boutique = await boutiqueDe(slug);
  if (!boutique) return reponse({ ok: false, message: "boutique introuvable" }, 404);
  if (Number(req.headers.get("content-length") ?? 0) > POIDS_MAX + 64 * 1024) return reponse({ ok: false, message: "plus de 10 Mo" }, 413);

  let f: FormData;
  try {
    f = await req.formData();
  } catch {
    return reponse({ ok: false, message: "envoi illisible" }, 400);
  }
  const lot = String(f.get("lot") ?? "");
  const produit = String(f.get("produit_id") ?? "");
  const variante = String(f.get("variante_id") ?? "");
  const photo = f.get("photo");
  if (!UUID.test(lot) || !UUID.test(produit) || (variante && !UUID.test(variante))) return reponse({ ok: false, message: "envoi incomplet" }, 400);
  if (!photo || typeof photo === "string" || photo.size === 0) return reponse({ ok: false, message: "photo manquante" }, 400);
  if (photo.size > POIDS_MAX) return reponse({ ok: false, message: "plus de 10 Mo, même réduite" });
  const corps = await photo.arrayBuffer();
  const genre = typeImage(new Uint8Array(corps, 0, Math.min(16, corps.byteLength)));
  if (!genre) return reponse({ ok: false, message: "ce n'est pas une photo JPEG, PNG ou WebP" });

  const chemin = `${slug}/produits/${produit}/${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}.${genre.extension}`;
  try {
    await deposerFichier(chemin, corps, genre.type);
  } catch (e) {
    console.error("photos à l'import : dépôt en échec", e);
    return reponse({ ok: false, message: "le dépôt a échoué, réessayez" }, 502);
  }
  const { error } = await clientService(ipDe(req)).rpc("console_ajouter_photo", {
    p_acteur: a.user.id,
    p_boutique_id: boutique.id,
    p_lot: lot,
    p_produit_id: produit,
    p_variante_id: variante || null,
    p_chemin: chemin,
    p_alt: String(f.get("alt") ?? "").slice(0, 200),
  });
  if (error) {
    await retirerFichier(chemin).catch(() => {});
    return reponse({ ok: false, message: MESSAGES[error.hint ?? ""] ?? error.message ?? "refusée" });
  }
  return reponse({ ok: true });
}
