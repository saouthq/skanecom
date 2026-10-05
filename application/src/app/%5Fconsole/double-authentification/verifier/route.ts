import { clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { retourCompte } from "@/lib/console/compte";

/* Vérifie le code TOTP : la session passe en aal2 (nouveaux jetons écrits
   dans les cookies par @supabase/ssr). */
/* Deux façons de répondre : JSON pour le formulaire avec JavaScript (le QR
   code reste à l'écran), redirection 303 pour le formulaire sans. */
/* Activée depuis « Mon compte » (retour) : on y revient, avec le conseil
   des codes de secours ; sinon, la porte décide (« / »). */
function reponse(req: Request, ok: boolean, erreur?: string, retour?: string | null): Response {
  const suite = retour
    ? `${retour}?${new URLSearchParams({ ok: "Double authentification activée. Créez maintenant vos codes de secours, pour le jour où vous perdriez votre téléphone.", carte: "secours" })}#t-secours`
    : "/";
  if (req.headers.get("accept")?.includes("application/json")) {
    return Response.json(ok ? { ok, suite } : { ok, erreur }, { headers: { "cache-control": "no-store" } });
  }
  return ok ? vers(suite) : versAvecErreur("/double-authentification", erreur ?? "", retour ? { activer: "1", retour } : {});
}

export async function POST(req: Request) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const f = await req.formData();
  const facteur = String(f.get("facteur") ?? "");
  const retour = f.get("retour") ? retourCompte(f.get("retour")) : null;
  const code = String(f.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return reponse(req, false, "Le code fait six chiffres.", retour);

  const sb = await clientSession();
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: facteur, code });
  if (error) return reponse(req, false, "Code incorrect ou expiré : réessayez avec le code suivant.", retour);
  return reponse(req, true, undefined, retour);
}
