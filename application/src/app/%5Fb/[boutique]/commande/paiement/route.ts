import { cookies } from "next/headers";
import { chargeCadre } from "@/lib/boutique";
import { supabase } from "@/lib/supabase";
import { memeOrigine } from "@/lib/origine";
import { COOKIE_COMMANDE } from "@/lib/commande";
import { ouvrirPourCommande } from "@/lib/paiement/commande";

/* Les deux gestes de la page de fin, quand le paiement en ligne n'a pas
   abouti : « Réessayer le paiement » (un nouveau paiement chez Konnect) ou
   « Payer à la livraison à la place » (si la boutique le prend). La commande
   se lit par « numéro.jeton », le cookie de /commande/passer. */
export const dynamic = "force-dynamic";

const vers = (chemin: string) => new Response(null, { status: 303, headers: { location: chemin, "cache-control": "no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) return new Response("Boutique introuvable", { status: 404 });
  const [numero, jeton] = ((await cookies()).get(COOKIE_COMMANDE)?.value ?? "").split(".");
  if (!numero || !jeton) return vers("/commande/merci");
  const geste = String((await req.formData()).get("geste") ?? "");

  if (geste === "livraison") {
    const { data } = await supabase.rpc("vitrine_payer_a_la_livraison", { p_boutique_id: cadre.boutique.id, p_numero: numero, p_jeton: jeton });
    return vers(data === true ? "/commande/merci?paiement=livraison" : "/commande/merci");
  }
  if (geste === "reessayer" && cadre.konnectActif) {
    const o = await ouvrirPourCommande({
      boutiqueId: cadre.boutique.id, nomBoutique: cadre.boutique.nom, numero, jeton,
      origine: req.headers.get("origin") ?? new URL(req.url).origin,
    });
    return vers(o.ok ? o.adresse : "/commande/merci?paiement=indisponible");
  }
  return vers("/commande/merci");
}
