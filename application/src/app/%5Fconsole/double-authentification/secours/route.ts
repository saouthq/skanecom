import { clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";

/* Un code de secours à la place de celui de l'application perdue : bon, il
   ne servira plus et le facteur perdu est retiré (la page propose aussitôt
   d'enregistrer la nouvelle application) ; faux, on le redit. La base
   compte les essais manqués (cinq par quart d'heure). */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const code = String((await req.formData()).get("code_secours") ?? "").slice(0, 40);
  const sb = await clientSession();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return vers("/connexion");
  const { data, error } = await sb.rpc("compte_utiliser_code_secours", { p_code: code });
  if (error) return vers(`/double-authentification?${new URLSearchParams({ secours: "1", erreur: error.hint === "essais" ? error.message : "Ce code n'a pas pu être vérifié : réessayez." })}`);
  if (data !== true) return vers(`/double-authentification?${new URLSearchParams({ secours: "1", erreur: "Code de secours inconnu, ou déjà utilisé." })}`);
  return vers("/double-authentification?remplace=1");
}
