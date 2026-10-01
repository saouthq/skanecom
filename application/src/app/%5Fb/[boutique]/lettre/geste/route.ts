import { chargeCadre } from "@/lib/boutique";
import { memeOrigine } from "@/lib/origine";
import { supabase } from "@/lib/supabase";

/* Le lien de l'e-mail de la lettre, une fois ouvert : « Confirmer mon
   inscription » ou « Me désinscrire » (components/GesteLettre.tsx), un clic
   de la personne — jamais la seule ouverture du lien, que des messageries
   visitent d'avance. La base reconnaît le jeton (public.lettre_confirmer,
   public.lettre_desinscrire) ; se désinscrire marche même si la boutique a
   depuis coupé sa lettre. */

export const dynamic = "force-dynamic";

const reponse = (corps: unknown, statut = 200) =>
  Response.json(corps, { status: statut, headers: { "cache-control": "private, no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  if (!memeOrigine(req)) return reponse({ etat: "origine" }, 403);
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) return reponse({ etat: "boutique" }, 404);

  const corps = (await req.json().catch(() => null)) as { jeton?: unknown; geste?: unknown } | null;
  const jeton = typeof corps?.jeton === "string" ? corps.jeton.slice(0, 80) : "";
  const geste = corps?.geste === "desinscrire" ? "lettre_desinscrire" : "lettre_confirmer";
  const { data, error } = await supabase.rpc(geste, { p_boutique_id: cadre.boutique.id, p_jeton: jeton });
  if (error) {
    console.error(`${geste} (${boutique}) : ${error.code} ${error.message}`);
    return reponse({ etat: "serveur" }, 500);
  }
  return reponse({ etat: (data as { etat: string }).etat });
}
