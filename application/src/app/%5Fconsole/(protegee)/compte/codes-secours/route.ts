import { cookies } from "next/headers";
import { clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { COOKIE_CODES, DUREE_COOKIE_CODES, nouveauxCodes, retourCompte, sessionCompte } from "@/lib/console/compte";

/* Créer (ou remplacer) ses dix codes de secours, puis « c'est noté ». Les
   codes partent dans un cookie HttpOnly de dix minutes pour être montrés une
   seule fois ; la base n'en garde que l'empreinte. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const f = await req.formData();
  const retour = retourCompte(f.get("retour"));
  const moi = await sessionCompte();
  if (!moi) return vers("/connexion");
  if (!moi.aal2) return vers("/double-authentification");
  const jar = await cookies();
  const securise = (req.headers.get("origin") ?? "").startsWith("https:");

  if (f.get("geste") === "noter") {
    jar.set(COOKIE_CODES, "", { httpOnly: true, sameSite: "strict", secure: securise, path: "/", maxAge: 0 });
    return vers(`${retour}?${new URLSearchParams({ ok: "Codes notés. Rangez-les loin du téléphone qui porte votre application.", carte: "secours" })}#t-secours`);
  }
  const codes = nouveauxCodes();
  const sb = await clientSession();
  const { error } = await sb.rpc("compte_remplacer_codes_secours", { p_codes: codes });
  if (error) return vers(`${retour}?${new URLSearchParams({ erreur: error.message, carte: "secours" })}#t-secours`);
  jar.set(COOKIE_CODES, encodeURIComponent(JSON.stringify({ pour: moi.id, codes })), {
    httpOnly: true, sameSite: "strict", secure: securise, path: "/", maxAge: DUREE_COOKIE_CODES,
  });
  return vers(`${retour}?${new URLSearchParams({ carte: "secours" })}#t-secours`);
}
