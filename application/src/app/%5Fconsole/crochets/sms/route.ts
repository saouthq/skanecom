import { signatureValide } from "@/lib/courriels/crochet";
import { MARQUE_PLATEFORME } from "@/lib/courriels/messages";
import { clientService } from "@/lib/console/service";
import { envoyerSms } from "@/lib/sms/envoi";

/* ============================================================================
   LE CROCHET « SEND SMS » DE SUPABASE AUTH — Supabase confie le code et le
   numéro ; nous retrouvons la boutique qui l'a demandé (la vitrine annonce
   le numéro juste avant, /code-sms : public.console_boutique_du_sms), puis
   le SMS part à son nom (lib/sms/envoi.ts), compté à son mois. Signé par
   Supabase avec le même secret que le crochet des e-mails
   (COURRIELS_CROCHET_SECRET) : sans signature valide, rien ne part.
   ========================================================================== */

export const dynamic = "force-dynamic";

const erreur = (http_code: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code, message } }), {
    status: http_code,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function POST(req: Request) {
  const secret = process.env.COURRIELS_CROCHET_SECRET ?? "";
  if (!secret) return erreur(503, "Le crochet des SMS n'est pas configuré");
  const corps = await req.text();
  if (!(await signatureValide(secret, req.headers, corps))) return erreur(401, "Signature refusée");

  let evenement: { user?: { phone?: string }; sms?: { otp?: string } };
  try {
    evenement = JSON.parse(corps);
  } catch {
    return erreur(400, "Événement illisible");
  }
  const chiffres = (evenement.user?.phone ?? "").replace(/\D/g, "");
  const code = evenement.sms?.otp ?? "";
  if (!chiffres || !/^\d{4,10}$/.test(code)) return erreur(400, "numéro ou code absents");

  let boutique: { id: string; nom: string } | null = null;
  try {
    const { data } = await clientService().rpc("console_boutique_du_sms", { p_telephone: chiffres });
    boutique = (data as { id: string; nom: string } | null) ?? null;
  } catch { /* sans boutique retrouvée, SkanEcom signe le SMS */ }

  const r = await envoyerSms({ a: `+${chiffres}`, code, nom: boutique?.nom ?? MARQUE_PLATEFORME.nom, boutique: boutique?.id ?? null });
  if (!r.ok) {
    console.error(`Crochet des SMS : ${r.raison}`);
    return erreur(502, "Le SMS n'a pas pu partir");
  }
  return new Response("{}", { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
