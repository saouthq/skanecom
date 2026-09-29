import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { jetonAcces } from "@/lib/console/equipe-serveur";
import { cheminEquipeBoutique, deposerLien, messageEquipe } from "@/lib/gestion/equipe";

/* Un nouveau lien d'accès pour un membre (le propriétaire) : l'invitation à
   nouveau si elle n'a pas servi, sinon un lien pour rechoisir son mot de
   passe. La base vérifie d'abord que ce compte n'appartient qu'à cette
   boutique (et trace le lien) ; alors seulement GoTrue fabrique le jeton. */

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
  const userId = String(f.get("user_id") ?? "");
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_lien_membre", { p_boutique_id: boutique.boutique_id, p_user_id: userId });
  if (error) return versAvecErreur(retour, messageEquipe(error.hint, error.message));
  const { email, en_attente } = data as { email: string; en_attente: boolean };

  const type = en_attente ? "invite" : "recovery";
  const j = await jetonAcces(null, email, type);
  if (!j.ok) return versAvecErreur(retour, j.message);
  await deposerLien(req, slug, { boutique: boutique.nom, userId, email, jeton: j.jeton, type });
  const ok = type === "invite"
    ? `Nouvelle invitation pour ${email} : l'ancien lien ne marche plus.`
    : `Lien pour choisir un nouveau mot de passe, pour ${email}. Son mot de passe actuel reste valable tant que le lien n'a pas servi.`;
  return vers(`${retour}?${new URLSearchParams({ ok })}`);
}
