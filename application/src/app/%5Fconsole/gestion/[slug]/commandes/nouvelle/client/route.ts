import { accesEquipe, clientSession } from "@/lib/console/session";

/* ============================================================================
   LE CLIENT D'UN NUMÉRO — pendant la saisie d'une commande, le numéro tapé
   retrouve le client que la boutique connaît : son nom, son historique, son
   compte pro, l'adresse de sa dernière livraison (gestion_saisie_client,
   avec la session du membre : la base revérifie ses droits).
   ========================================================================== */

export const dynamic = "force-dynamic";

const reponse = (corps: unknown, statut = 200) =>
  Response.json(corps, { status: statut, headers: { "cache-control": "private, no-store" } });

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await accesEquipe();
  if (a.etat !== "ok") return reponse({ client: null }, 401);
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return reponse({ client: null }, 404);
  const telephone = (new URL(req.url).searchParams.get("tel") ?? "").slice(0, 30);

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_saisie_client", { p_boutique_id: boutique.boutique_id, p_telephone: telephone });
  if (error) return reponse({ client: null, erreur: error.message }, error.code === "42501" ? 403 : 500);
  return reponse({ client: data });
}
