import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { ROLES_EQUIPE, cheminEquipe } from "@/lib/console/equipe";
import { boutiqueDe, equipeDe, jetonAcces, remettreLien } from "@/lib/console/equipe-serveur";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";

/* Inviter une personne dans l'équipe d'une boutique : son adresse e-mail et
   son rôle. Nouveau compte (ou invitation pas encore acceptée) : un lien
   d'invitation. Compte existant, déjà confirmé : elle entre avec son mot de
   passe habituel, sans lien. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = cheminEquipe(slug);
  return ecriture(req, async ({ user, formulaire, ip, roleAdmin }) => {
    const email = String(formulaire.get("email") ?? "").trim().toLowerCase();
    const role = String(formulaire.get("role") ?? "");
    const saisie = { email, role };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return versAvecErreur(retour, "Adresse e-mail invalide.", saisie);
    if (!ROLES_EQUIPE.some((r) => r.code === role)) return versAvecErreur(retour, "Choisissez un rôle.", saisie);
    // Avant tout lien (sinon un compte naîtrait pour un refus) : le support n'ouvre pas les rôles qui engagent.
    if (roleAdmin !== "super_admin" && (role === "proprietaire" || role === "admin")) {
      return versAvecErreur(retour, "Seul un super-administrateur donne le rôle propriétaire ou administrateur.", saisie);
    }

    const boutique = await boutiqueDe(slug);
    if (!boutique) return new Response("Boutique introuvable", { status: 404 });

    const svc = clientService(ip);
    const { data: compte } = await svc.rpc("console_compte", { p_email: email });
    const existant = compte as { user_id: string; confirme: boolean } | null;
    if (existant && (await equipeDe(boutique.id)).some((m) => m.user_id === existant.user_id && m.actif)) {
      return versAvecErreur(retour, `${email} fait déjà partie de l'équipe : changez son rôle dans la liste.`, saisie);
    }

    // Un lien seulement si la personne n'a pas encore de compte confirmé.
    let userId = existant?.user_id;
    let jeton: string | null = null;
    if (!existant?.confirme) {
      const j = await jetonAcces(ip, email, "invite");
      if (!j.ok) return versAvecErreur(retour, j.message, saisie);
      userId = j.userId;
      jeton = j.jeton;
    }

    const { error } = await svc.rpc("console_ajouter_membre", {
      p_acteur: user.id, p_boutique_id: boutique.id, p_user_id: userId, p_role: role,
    });
    if (error) return versAvecErreur(retour, error.hint === "membre" ? error.message : messageBase(error), saisie);

    const libelle = LIBELLES_ROLE[role] ?? role;
    if (!jeton) {
      return vers(`${retour}?${new URLSearchParams({
        ok: `${email} a rejoint l'équipe (${libelle}). Cette personne a déjà un compte : elle se connecte avec son mot de passe habituel.`,
      })}`);
    }
    const echec = await remettreLien(req, { acteur: user.id, ip, boutique, userId: userId!, email, jeton, type: "invite" });
    if (echec) return versAvecErreur(retour, echec);
    return vers(`${retour}?${new URLSearchParams({ ok: `Invitation prête pour ${email} (${libelle}) : envoyez-lui le lien ci-dessous.` })}`);
  });
}
