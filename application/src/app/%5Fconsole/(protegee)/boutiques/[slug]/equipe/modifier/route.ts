import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { cheminEquipe } from "@/lib/console/equipe";
import { boutiqueDe, equipeDe } from "@/lib/console/equipe-serveur";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";

/* Changer le rôle d'un membre, lui retirer l'accès, le lui rendre. La base
   garde toujours au moins un propriétaire actif. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = cheminEquipe(slug);
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const boutique = await boutiqueDe(slug);
    if (!boutique) return new Response("Boutique introuvable", { status: 404 });
    const userId = String(formulaire.get("user_id") ?? "");
    const membre = (await equipeDe(boutique.id)).find((m) => m.user_id === userId);
    if (!membre) return versAvecErreur(retour, "Ce compte ne fait pas partie de l'équipe.");

    const role = String(formulaire.get("role") ?? membre.role);
    const actif = formulaire.has("actif") ? formulaire.get("actif") === "1" : membre.actif;
    const { error } = await clientService(ip).rpc("console_modifier_membre", {
      p_acteur: user.id, p_boutique_id: boutique.id, p_user_id: userId, p_role: role, p_actif: actif,
    });
    if (error) return versAvecErreur(retour, error.hint === "proprietaire" ? error.message : messageBase(error));

    const qui = membre.email ?? "Ce membre";
    const ok = !actif
      ? `${qui} n'a plus accès au backoffice.`
      : !membre.actif
        ? `${qui} a de nouveau accès au backoffice (${LIBELLES_ROLE[role] ?? role}).`
        : role !== membre.role
          ? `${qui} passe en « ${LIBELLES_ROLE[role] ?? role} ».`
          : "Rien n'a changé.";
    return vers(`${retour}?${new URLSearchParams({ ok })}`);
  });
}
