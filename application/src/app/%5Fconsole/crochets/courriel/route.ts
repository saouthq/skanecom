import { composer, type EvenementCourriel } from "@/lib/courriels/composer";
import { signatureValide } from "@/lib/courriels/crochet";
import { envoyer } from "@/lib/courriels/envoi";

/* ============================================================================
   LE CROCHET « SEND EMAIL » DE SUPABASE AUTH — Supabase ne rédige plus nos
   e-mails : il nous confie l'événement (le code, le lien, l'adresse), nous
   rédigeons aux couleurs de la boutique (lib/courriels) et nous envoyons
   (lib/courriels/envoi.ts). Signé par Supabase (secret
   COURRIELS_CROCHET_SECRET) : sans signature valide, rien ne part.
   Réponses au format attendu par Supabase Auth ({ error: { http_code, message } }).
   ========================================================================== */

export const dynamic = "force-dynamic";

const erreur = (http_code: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code, message } }), {
    status: http_code,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function POST(req: Request) {
  const secret = process.env.COURRIELS_CROCHET_SECRET ?? "";
  if (!secret) return erreur(503, "Le crochet des e-mails n'est pas configuré");
  const corps = await req.text();
  if (!(await signatureValide(secret, req.headers, corps))) return erreur(401, "Signature refusée");

  let evenement: EvenementCourriel;
  try {
    evenement = JSON.parse(corps) as EvenementCourriel;
  } catch {
    return erreur(400, "Événement illisible");
  }
  const pret = await composer(evenement);
  if ("erreur" in pret) return erreur(400, pret.erreur);

  const r = await envoyer({ a: pret.a, nom: pret.nom, ...pret.courriel, code: pret.code });
  if (!r.ok) {
    console.error(`Crochet des e-mails : ${r.raison}`);
    return erreur(502, "L'e-mail n'a pas pu partir");
  }
  return new Response("{}", { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
