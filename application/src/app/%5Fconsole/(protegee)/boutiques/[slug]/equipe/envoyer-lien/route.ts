import { cookies } from "next/headers";
import { ecriture, vers, versAvecErreur } from "@/lib/console/http";
import { COOKIE_LIEN, cheminEquipe } from "@/lib/console/equipe";
import { envoyerLienParCourriel } from "@/lib/console/equipe-serveur";
import { lienRemis } from "@/lib/gestion/equipe";

/* Le lien remis à un membre d'une boutique (invitation ou mot de passe),
   envoyé aussi par e-mail. Le lien est celui que la page montre (cookie
   HttpOnly limité à l'équipe de cette boutique). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = cheminEquipe(slug);
  return ecriture(req, async () => {
    const lien = lienRemis((await cookies()).get(COOKIE_LIEN)?.value);
    if (!lien) return versAvecErreur(retour, "Plus de lien à envoyer : il ne reste affiché qu'un quart d'heure. Remettez-en un nouveau.");
    const r = await envoyerLienParCourriel(lien, slug);
    if (!r.ok) return versAvecErreur(retour, `L'e-mail n'est pas parti (${r.raison}). Copiez le lien et envoyez-le autrement.`);
    return vers(`${retour}?${new URLSearchParams({ ok: `Lien envoyé par e-mail à ${lien.email}.` })}`);
  });
}
