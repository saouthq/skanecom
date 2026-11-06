import { chargeCadre } from "@/lib/boutique";
import { memeOrigine } from "@/lib/origine";
import { clientService } from "@/lib/console/service";
import { ipDuVisiteur, turnstileActif, verifierTurnstile } from "@/lib/turnstile";

/* Avant de demander un code par SMS (components/Connexion.tsx), la vitrine
   annonce le numéro : le crochet des SMS (/crochets/sms) saura pour quelle
   boutique le code part — à son nom, compté à son mois. La base n'en garde
   qu'une empreinte, un quart d'heure (public.vitrine_annoncer_sms). La
   réponse est la même dans tous les cas : elle n'apprend rien à personne.
   Avec les clés Turnstile de la plateforme, le visiteur est vérifié ici :
   refusé, il le sait (403) ; l'annonce garde qu'il l'a été, et le crochet
   des SMS n'envoie rien pour une annonce non vérifiée (migration …_turnstile). */

export const dynamic = "force-dynamic";

const reponse = () => new Response(null, { status: 204, headers: { "cache-control": "private, no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  if (!memeOrigine(req)) return new Response(null, { status: 403 });
  const { boutique } = await params;
  const corps = (await req.json().catch(() => null)) as { telephone?: unknown; turnstile?: unknown } | null;
  const telephone = typeof corps?.telephone === "string" ? corps.telephone.slice(0, 30) : "";
  if (!telephone) return reponse();
  const actif = turnstileActif();
  if (actif && !(await verifierTurnstile(corps?.turnstile, ipDuVisiteur(req)))) {
    return Response.json({ raison: "robot" }, { status: 403, headers: { "cache-control": "private, no-store" } });
  }
  try {
    const cadre = await chargeCadre(boutique);
    if (cadre) await clientService().rpc("vitrine_annoncer_sms", { p_boutique_id: cadre.boutique.id, p_telephone: telephone, p_verifiee: actif });
  } catch { /* sans annonce, le SMS part quand même, au nom de SkanEcom (sauf l'anti-robots actif) */ }
  return reponse();
}
