import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { cheminEquipeBoutique, messageEquipe } from "@/lib/gestion/equipe";

/* Le propriétaire ferme un accès support encore ouvert (C7) : le support est
   dehors aussitôt (public.gestion_fermer_support, tracé à son nom). */

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

  const retour = cheminEquipeBoutique(slug);
  const id = Number((await req.formData()).get("id") ?? 0);
  const { data, error } = await (await clientSession()).rpc("gestion_fermer_support", { p_boutique_id: boutique.boutique_id, p_id: id });
  if (error) return versAvecErreur(retour, messageEquipe(error.hint, error.message));
  const ok = data ? "Accès du support fermé : SkanEcom n'est plus dans votre backoffice." : "Cet accès était déjà fermé.";
  return vers(`${retour}?${new URLSearchParams({ ok })}#t-support`);
}
