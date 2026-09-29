import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { cheminEquipeBoutique, messageEquipe, type MembreBoutique } from "@/lib/gestion/equipe";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";

/* Changer le rôle d'un membre, lui retirer l'accès, le lui rendre (le
   propriétaire). La base garde toujours au moins un propriétaire actif. */

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
  const f = await req.formData();
  const sb = await clientSession();
  const userId = String(f.get("user_id") ?? "");
  const { data, error: e1 } = await sb.rpc("gestion_equipe", { p_boutique_id: boutique.boutique_id });
  if (e1) return versAvecErreur(retour, messageEquipe(e1.hint, e1.message));
  const membre = ((data ?? []) as MembreBoutique[]).find((m) => m.user_id === userId);
  if (!membre) return versAvecErreur(retour, "Ce compte ne fait pas partie de l'équipe.");

  const role = String(f.get("role") ?? membre.role);
  const actif = f.has("actif") ? f.get("actif") === "1" : membre.actif;
  const { error } = await sb.rpc("gestion_modifier_membre", {
    p_boutique_id: boutique.boutique_id, p_user_id: userId, p_role: role, p_actif: actif,
  });
  if (error) return versAvecErreur(retour, messageEquipe(error.hint, error.message));

  const qui = membre.email ?? "Ce membre";
  const ok = !actif
    ? `${qui} n'a plus accès au backoffice.`
    : !membre.actif
      ? `${qui} a de nouveau accès au backoffice (${LIBELLES_ROLE[role] ?? role}).`
      : role !== membre.role
        ? `${qui} passe en « ${LIBELLES_ROLE[role] ?? role} ».`
        : "Rien n'a changé.";
  return vers(`${retour}?${new URLSearchParams({ ok })}`);
}
