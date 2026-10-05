import { cookies } from "next/headers";
import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { jetonAcces } from "@/lib/console/equipe-serveur";
import { lienBienvenue } from "@/lib/console/equipe";
import { COOKIE_LIEN_ADMIN, ROLES_PLATEFORME } from "@/lib/console/equipe-plateforme";

/* Ajouter quelqu'un à l'équipe SkanEcom (super-administrateur seulement,
   revérifié par la base). Sans compte confirmé : un lien d'invitation, remis
   dans un cookie HttpOnly limité à cette page. La double authentification
   lui sera demandée à la première connexion, comme à tout administrateur. */
export async function POST(req: Request) {
  const retour = "/equipe-plateforme";
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const email = String(formulaire.get("email") ?? "").trim().toLowerCase();
    const role = String(formulaire.get("role") ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return versAvecErreur(retour, "Adresse e-mail invalide.", { email, role });
    if (!ROLES_PLATEFORME.some((r) => r.code === role)) return versAvecErreur(retour, "Choisissez un rôle.", { email, role });
    const svc = clientService(ip);
    const { data: compte } = await svc.rpc("console_compte", { p_email: email });
    const existant = compte as { user_id: string; confirme: boolean } | null;
    let userId = existant?.user_id;
    let jeton: string | null = null;
    if (!existant?.confirme) {
      const j = await jetonAcces(ip, email, "invite");
      if (!j.ok) return versAvecErreur(retour, j.message, { email, role });
      userId = j.userId;
      jeton = j.jeton;
    }
    const { error } = await svc.rpc("console_nommer_administrateur", { p_acteur: user.id, p_user_id: userId, p_role: role });
    if (error) return versAvecErreur(retour, messageBase(error), { email, role });
    if (jeton) {
      const origine = req.headers.get("origin")!; // vérifiée par ecriture()
      (await cookies()).set(COOKIE_LIEN_ADMIN, encodeURIComponent(JSON.stringify({ email, lien: lienBienvenue(origine, jeton, "invite", email) })), {
        httpOnly: true, sameSite: "strict", secure: origine.startsWith("https:"), path: retour, maxAge: 15 * 60,
      });
      return vers(`${retour}?${new URLSearchParams({ ok: `Invitation prête pour ${email}. Envoyez le lien ci-dessous : à l'ouverture, le mot de passe, puis la double authentification.` })}`);
    }
    return vers(`${retour}?${new URLSearchParams({ ok: `${email} rejoint l'équipe SkanEcom : la connexion se fait avec le mot de passe habituel.` })}`);
  });
}
