import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine } from "@/lib/console/http";
import { messageSaisie } from "@/lib/gestion/saisie";

/* ============================================================================
   LE CHIFFRAGE EN DIRECT DE LA SAISIE — à chaque article, quantité,
   gouvernorat ou remise, l'écran redemande le prix à la base : le chiffrage
   même de la vitrine (prix par quantité, prix pro du client, livraison par
   zone et par poids), puis la remise et la livraison offerte de la
   direction. Rien n'est réservé ; l'enregistrement rechiffre tout.
   ========================================================================== */

export const dynamic = "force-dynamic";

const reponse = (corps: unknown, statut = 200) =>
  Response.json(corps, { status: statut, headers: { "cache-control": "private, no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!memeOrigine(req)) return reponse({ erreur: "Origine refusée" }, 403);
  const { slug } = await params;
  const a = await accesEquipe();
  if (a.etat !== "ok") return reponse({ erreur: "Session terminée : reconnectez-vous." }, 401);
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return reponse({ erreur: "Boutique introuvable" }, 404);

  const corps = (await req.json().catch(() => null)) as {
    telephone?: string; lignes?: unknown; livraison?: unknown; ajustements?: unknown;
  } | null;
  if (!corps || !Array.isArray(corps.lignes) || corps.lignes.length === 0) return reponse({ chiffrage: null });

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_chiffrer_saisie", {
    p_boutique_id: boutique.boutique_id,
    p_telephone: String(corps.telephone ?? "").slice(0, 30),
    p_lignes: corps.lignes,
    p_livraison: corps.livraison ?? {},
    p_ajustements: corps.ajustements ?? {},
  });
  if (error) return reponse({ chiffrage: null, indice: error.hint, erreur: messageSaisie(error.hint, error.message) }, 422);
  return reponse({ chiffrage: data });
}
