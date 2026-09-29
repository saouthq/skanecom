import { clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";

/* Connexion par mot de passe (GoTrue). La session est écrite dans les
   cookies par @supabase/ssr ; la suite (administrateur ? double
   authentification ?) est décidée par /double-authentification. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const f = await req.formData();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const motDePasse = String(f.get("mot_de_passe") ?? "");

  const sb = await clientSession();
  const { error } = await sb.auth.signInWithPassword({ email, password: motDePasse });
  // Un seul message pour « inconnu » et « mauvais mot de passe » : on ne dit
  // pas quelles adresses ont un compte.
  if (error) return versAvecErreur("/connexion", "Adresse ou mot de passe incorrect.", { email });
  return vers("/double-authentification");
}
