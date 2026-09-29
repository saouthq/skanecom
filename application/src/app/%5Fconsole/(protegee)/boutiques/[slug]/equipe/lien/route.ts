import { ecriture, versAvecErreur, vers } from "@/lib/console/http";
import { cheminEquipe } from "@/lib/console/equipe";
import { boutiqueDe, equipeDe, jetonAcces, remettreLien } from "@/lib/console/equipe-serveur";

/* Un nouveau lien d'accès pour un membre : l'invitation à nouveau si elle
   n'a pas servi (ou a expiré), sinon un lien pour rechoisir son mot de passe
   (oublié). L'ancien lien ne marche plus. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = cheminEquipe(slug);
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const boutique = await boutiqueDe(slug);
    if (!boutique) return new Response("Boutique introuvable", { status: 404 });
    const userId = String(formulaire.get("user_id") ?? "");
    const membre = (await equipeDe(boutique.id)).find((m) => m.user_id === userId);
    if (!membre?.email) return versAvecErreur(retour, "Ce compte ne fait pas partie de l'équipe.");
    if (!membre.actif) return versAvecErreur(retour, "Rendez d'abord l'accès à ce membre.");

    const type = membre.en_attente ? "invite" : "recovery";
    const j = await jetonAcces(ip, membre.email, type);
    if (!j.ok) return versAvecErreur(retour, j.message);
    const echec = await remettreLien(req, { acteur: user.id, ip, boutique, userId, email: membre.email, jeton: j.jeton, type });
    if (echec) return versAvecErreur(retour, echec);
    const ok = type === "invite"
      ? `Nouvelle invitation pour ${membre.email} : l'ancien lien ne marche plus.`
      : `Lien pour choisir un nouveau mot de passe, pour ${membre.email}. Son mot de passe actuel reste valable tant que le lien n'a pas servi.`;
    return vers(`${retour}?${new URLSearchParams({ ok })}`);
  });
}
