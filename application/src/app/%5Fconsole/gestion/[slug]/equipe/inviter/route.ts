import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { ROLES_EQUIPE } from "@/lib/console/equipe";
import { jetonAcces } from "@/lib/console/equipe-serveur";
import { cheminEquipeBoutique, deposerLien, messageEquipe } from "@/lib/gestion/equipe";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";

/* ============================================================================
   INVITER UNE PERSONNE DANS L'ÉQUIPE (le propriétaire, B7). Compte confirmé
   déjà existant : elle entre avec son mot de passe habituel, sans lien.
   Sinon : un lien d'invitation, à transmettre par WhatsApp.

   L'ordre compte : la base vérifie le propriétaire AVANT que GoTrue ne crée
   le moindre compte (gestion_compte), puis inscrit le membre, puis trace le
   lien.
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

  const retour = cheminEquipeBoutique(slug);
  const f = await req.formData();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const role = String(f.get("role") ?? "");
  const saisie = { email, role };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return versAvecErreur(retour, "Adresse e-mail invalide.", saisie);
  if (!ROLES_EQUIPE.some((r) => r.code === role)) return versAvecErreur(retour, "Choisissez un rôle.", saisie);

  const sb = await clientSession();
  const b = boutique.boutique_id;
  const { data: compte, error: e1 } = await sb.rpc("gestion_compte", { p_boutique_id: b, p_email: email });
  if (e1) return versAvecErreur(retour, messageEquipe(e1.hint, e1.message), saisie);
  const existant = compte as { user_id: string; confirme: boolean; lien_possible: boolean } | null;
  const libelle = LIBELLES_ROLE[role] ?? role;

  // Un compte déjà confirmé : il entre avec son mot de passe, sans lien.
  if (existant?.confirme) {
    const { error } = await sb.rpc("gestion_ajouter_membre", { p_boutique_id: b, p_user_id: existant.user_id, p_role: role });
    if (error) return versAvecErreur(retour, messageEquipe(error.hint, error.message), saisie);
    return vers(`${retour}?${new URLSearchParams({
      ok: `${email} a rejoint l'équipe (${libelle}). Cette personne a déjà un compte : elle se connecte avec son mot de passe habituel.`,
    })}`);
  }
  // Une invitation en attente ailleurs : son lien fixerait son mot de passe.
  if (existant && !existant.lien_possible) {
    return versAvecErreur(retour, "Cette adresse a déjà une invitation en attente dans une autre boutique : demandez à SkanEcom.", saisie);
  }

  const j = await jetonAcces(null, email, "invite");
  if (!j.ok) return versAvecErreur(retour, j.message, saisie);
  const { error: e2 } = await sb.rpc("gestion_ajouter_membre", { p_boutique_id: b, p_user_id: j.userId, p_role: role });
  if (e2) return versAvecErreur(retour, messageEquipe(e2.hint, e2.message), saisie);
  const { error: e3 } = await sb.rpc("gestion_lien_membre", { p_boutique_id: b, p_user_id: j.userId });
  if (e3) return versAvecErreur(retour, messageEquipe(e3.hint, e3.message));

  await deposerLien(req, slug, { boutique: boutique.nom, userId: j.userId, email, jeton: j.jeton, type: "invite" });
  return vers(`${retour}?${new URLSearchParams({ ok: `Invitation prête pour ${email} (${libelle}) : envoyez-lui le lien ci-dessous.` })}`);
}
