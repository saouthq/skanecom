import { clientService } from "@/lib/console/service";
import { configSkanFact, relire } from "@/lib/console/skanfact";
import { avisSigne, clientDeLAvis } from "@/lib/console/avis-skanfact";

/* ============================================================================
   LES AVIS DE SKANFACT (cadrage 06) — SkanFact prévient la console qu'une
   facture est émise, qu'un règlement est enregistré, qu'une facture est
   réglée (par un règlement ou un avoir). L'avis ne fait foi de rien : la
   console relit la situation du client dans SkanFact et la garde. Signé
   avec le secret de l'abonnement (SKANFACT_AVIS_SECRET) : sans signature
   valide, rien n'est relu.

   L'abonnement se fait une fois, par une personne dans SkanFact :
   POST /v1/entreprises/:e/avis-abonnements, adresse
   https://<console>/crochets/skanfact.
   Réponses : 2xx, l'avis est reçu ; 5xx, SkanFact le renverra plus tard.
   ========================================================================== */

export const dynamic = "force-dynamic";

const reponse = (statut: number, corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(req: Request) {
  const secret = (process.env.SKANFACT_AVIS_SECRET ?? "").trim();
  const config = configSkanFact();
  if (!secret || !config) return reponse(503, { erreur: "Les avis de SkanFact ne sont pas configurés" });
  const corps = await req.text();
  if (!(await avisSigne(secret, req.headers.get("skanfact-signature"), corps))) return reponse(401, { erreur: "Signature refusée" });

  let avis: { id?: unknown; evenement?: unknown; entreprise?: unknown; donnees?: unknown };
  try {
    avis = JSON.parse(corps);
  } catch {
    return reponse(400, { erreur: "Avis illisible" });
  }
  const id = typeof avis.id === "string" ? avis.id : req.headers.get("skanfact-avis");
  const evenement = typeof avis.evenement === "string" ? avis.evenement : req.headers.get("skanfact-evenement");
  if (!id || !evenement) return reponse(400, { erreur: "Avis incomplet" });
  // Une autre entreprise de SkanFact ne regarde pas la console : reçu, sans suite.
  if (avis.entreprise !== config.entreprise) return reponse(200, { recu: true, relu: 0 });

  // Les boutiques du client dont parle l'avis ; s'il n'en dit rien, toutes celles qui sont reliées.
  const client = clientDeLAvis(avis.donnees);
  const { data, error } = await clientService().rpc("console_boutiques_du_client", { p_client: client });
  if (error) return reponse(503, { erreur: "Base injoignable" });
  const boutiques = (data ?? []) as { boutique_id: string; client: string }[];
  const lectures = await Promise.all(boutiques.map((b) => relire(config, b.boutique_id, b.client)));
  const ratee = lectures.find((l) => !l.ok);
  if (ratee && !ratee.ok) {
    console.error(`Avis SkanFact ${id} (${evenement}) : ${ratee.raison}`);
    return reponse(502, { erreur: "SkanFact n'a pas pu être relu" });
  }
  // Noté une fois relu : un avis rejoué relit encore (sans mal), l'heure du premier reste.
  await clientService().rpc("console_avis_skanfact", { p_id: id.slice(0, 100), p_evenement: evenement.slice(0, 60) });
  return reponse(200, { recu: true, relu: boutiques.length });
}
