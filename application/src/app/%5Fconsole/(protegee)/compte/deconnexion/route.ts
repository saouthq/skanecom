import { clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { sessionCompte } from "@/lib/console/compte";

/* Se déconnecter partout : toutes les sessions de ce compte tombent, celle-ci
   comprise (un téléphone oublié dans un taxi ne reste pas ouvert). Tracé. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const moi = await sessionCompte();
  if (!moi) return vers("/connexion");
  if (moi.doitConfirmer) return vers("/double-authentification");
  const sb = await clientSession();
  await sb.rpc("compte_tracer", { p_geste: "deconnexion_partout" });
  await sb.auth.signOut({ scope: "global" });
  return vers(`/connexion?${new URLSearchParams({ email: moi.email, info: "Déconnecté de tous vos appareils. Reconnectez-vous ici." })}`);
}
