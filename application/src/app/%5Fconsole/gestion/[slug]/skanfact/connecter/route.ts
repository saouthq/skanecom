import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { COOKIE_ETAT_SKANFACT, adresseRetourSkanFact, adresseSkanFact, secretPartenaire } from "@/lib/console/skanfact";
import { chiffrementPret } from "@/lib/gestion/chiffre";
import { messageRefus } from "@/lib/gestion/libelles";

/* ============================================================================
   « CONNECTER SKANFACT » (B0 du contrat de SkanFact, docs/boutique.md) — le
   départ : un ÉTAT tiré au hasard (32 octets), gardé dans la base (la
   boutique, le membre, l'heure : dix minutes) et dans un cookie de ce
   navigateur (httpOnly, SameSite=Lax, limité à la page de retour) ; puis le
   navigateur part chez SkanFact, où le commerçant choisit son entreprise et
   autorise SkanEcom. Il revient sur /skanfact/retour (src/app/%5Fconsole/
   skanfact/retour/route.ts), qui vérifie que l'état est bien le sien.
   Le propriétaire ou un administrateur ; la base revérifie le rôle et le
   module.
   ========================================================================== */

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
  const page = `/gestion/${slug}/skanfact`;
  if (!["proprietaire", "admin"].includes(boutique.role)) return versAvecErreur(page, "Seuls le propriétaire et un administrateur connectent la boutique à SkanFact.");

  const url = adresseSkanFact();
  const retour = adresseRetourSkanFact();
  if (!url || !retour || !secretPartenaire() || !(await chiffrementPret())) {
    return versAvecErreur(page, "SkanFact n'est pas encore branché sur la plateforme : SkanEcom s'en occupe, réessayez plus tard.");
  }
  const etat = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const sb = await clientSession();
  const { error } = await sb.rpc("gestion_skanfact_demarrer", { p_boutique_id: boutique.boutique_id, p_etat: etat });
  if (error) return versAvecErreur(page, messageRefus(error.hint, error.message));

  const cible = `${url}/connecter?${new URLSearchParams({ partenaire: "skanecom", retour, etat })}`;
  const securise = retour.startsWith("https://");
  return new Response(null, {
    status: 303,
    headers: {
      location: cible,
      "cache-control": "no-store",
      "set-cookie": `${COOKIE_ETAT_SKANFACT}=${etat}; Path=/skanfact/retour; Max-Age=600; HttpOnly; SameSite=Lax${securise ? "; Secure" : ""}`,
    },
  });
}
