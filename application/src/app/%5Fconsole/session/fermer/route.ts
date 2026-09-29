import { clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";

export async function POST(req: Request) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const sb = await clientSession();
  await sb.auth.signOut();
  return vers("/connexion");
}
