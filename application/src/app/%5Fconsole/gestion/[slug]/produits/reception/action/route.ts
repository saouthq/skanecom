import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { messageReception } from "@/lib/gestion/reception";
import { rafraichirVitrine } from "@/lib/console/vitrine-cache";

/* ============================================================================
   ENREGISTRER UNE RÉCEPTION — un formulaire HTML ordinaire : une quantité
   par déclinaison (`q:<id>`), la note du bon de livraison. Les quantités
   vides ou nulles sont ignorées ; la base passe le reste en un seul geste,
   tout ou rien (…_reception_arrivage.sql), avec la session du membre.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug } = await params;
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const f = await req.formData();
  const page = `/gestion/${slug}/produits/reception`;
  const lignes: { variante_id: string; quantite: string }[] = [];
  for (const [cle, brut] of f.entries()) {
    if (!cle.startsWith("q:")) continue;
    const quantite = String(brut).replace(/\s/g, "");
    if (quantite === "" || quantite === "0") continue;
    lignes.push({ variante_id: cle.slice(2), quantite });
  }

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_reception", {
    p_boutique_id: boutique.boutique_id,
    p_lignes: lignes,
    p_commentaire: String(f.get("note") ?? "").trim() || null,
  });
  if (error) return versAvecErreur(page, messageReception(error.hint, error.message));
  const r = data as { declinaisons: number; pieces: number };
  // Le stock reçu paraît tout de suite sur les fiches.
  rafraichirVitrine(slug);
  return vers(`${page}?${new URLSearchParams({ recues: String(r.pieces), declinaisons: String(r.declinaisons) })}`);
}
