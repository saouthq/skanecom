import { cookies } from "next/headers";
import { ecriture, vers, versAvecErreur } from "@/lib/console/http";
import { COOKIE_LIEN_ADMIN } from "@/lib/console/equipe-plateforme";
import { envoyerLienParCourriel } from "@/lib/console/equipe-serveur";

/* Le lien d'invitation dans l'équipe SkanEcom, envoyé aussi par e-mail. Le
   lien est celui que la page montre (cookie HttpOnly limité à
   /equipe-plateforme) : rien ne vient du formulaire. */
export async function POST(req: Request) {
  return ecriture(req, async ({ roleAdmin }) => {
    const retour = "/equipe-plateforme";
    if (roleAdmin !== "super_admin") return versAvecErreur(retour, "Seul un super-administrateur invite dans l'équipe SkanEcom.");
    let lien: { email: string; lien: string } | null = null;
    try { lien = JSON.parse(decodeURIComponent((await cookies()).get(COOKIE_LIEN_ADMIN)?.value ?? "")); } catch { lien = null; }
    if (!lien?.email || !lien.lien) return versAvecErreur(retour, "Plus de lien à envoyer : il ne reste affiché qu'un quart d'heure. Réinvitez la personne.");
    const r = await envoyerLienParCourriel({ ...lien, type: "invite" });
    if (!r.ok) return versAvecErreur(retour, `L'e-mail n'est pas parti (${r.raison}). Copiez le lien et envoyez-le autrement.`);
    return vers(`${retour}?${new URLSearchParams({ ok: `Invitation envoyée par e-mail à ${lien.email}.` })}`);
  });
}
