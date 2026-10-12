import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";

/* Accepter les conditions de service en vigueur : le propriétaire, la case
   cochée, au nom de son entreprise (public.gestion_accepter_conditions, au
   journal). La base revérifie le rôle (un accès support n'accepte jamais)
   et la version. */
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
  const retour = (m: Record<string, string>) => vers(`/gestion/${slug}/conditions?${new URLSearchParams(m)}`);
  if (f.get("lu") !== "oui") return retour({ erreur: "Cochez la case pour dire que vous avez lu les conditions et que vous les acceptez." });
  const { error } = await (await clientSession()).rpc("gestion_accepter_conditions", {
    p_boutique_id: boutique.boutique_id, p_version: Number(f.get("version") ?? 0),
  });
  if (error) return retour({ erreur: error.hint === "proprietaire" || error.hint === "version" ? `${error.message}.` : "L'accord n'a pas été enregistré : réessayez." });
  return retour({ ok: "Merci : les conditions de service sont acceptées au nom de l'entreprise. Vous les retrouvez ici à tout moment." });
}
