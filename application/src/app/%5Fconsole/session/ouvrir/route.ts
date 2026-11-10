import { clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { COOKIE_SUITE, suiteSure } from "@/lib/console/suite";

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
  const suite = suiteSure(String(f.get("suite") ?? ""));
  if (error) return versAvecErreur("/connexion", "Adresse ou mot de passe incorrect.", { email, ...(suite ? { suite } : {}) });
  const reponse = vers("/double-authentification");
  // La page d'où la session avait pris fin : l'entrée du backoffice y ramène (quart d'heure).
  if (suite) {
    const sur = new URL(req.url).protocol === "https:" ? "; Secure" : "";
    reponse.headers.append("set-cookie", `${COOKIE_SUITE}=${encodeURIComponent(suite)}; Path=/; Max-Age=900; HttpOnly; SameSite=Lax${sur}`);
  }
  return reponse;
}
