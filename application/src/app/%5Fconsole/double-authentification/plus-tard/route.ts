import { cookies } from "next/headers";
import { acces, accesEquipe } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { COOKIE_PLUS_TARD, DUREE_PLUS_TARD } from "@/lib/console/compte";

/* « Plus tard » : la proposition de double authentification se tait un mois
   sur cet appareil. Seulement si rien ne l'exige (sinon la porte la
   redemande aussitôt) ; la personne l'active quand elle veut, depuis
   « Mon compte ». Le cookie porte son identifiant : sur un ordinateur
   partagé, le « Plus tard » de l'un ne vaut pas pour l'autre. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const a = await acces();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aal1") return vers("/double-authentification");
  if (a.etat === "refuse") {
    const e = await accesEquipe();
    if (e.etat === "anonyme") return vers("/connexion");
    if (e.etat === "aal1") return vers("/double-authentification");
  }
  (await cookies()).set(COOKIE_PLUS_TARD, a.user.id, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: DUREE_PLUS_TARD, secure: new URL(req.url).protocol === "https:",
  });
  return vers(a.etat === "ok" ? "/" : "/gestion");
}
