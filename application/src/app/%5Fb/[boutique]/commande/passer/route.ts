import { cookies } from "next/headers";
import { chargeCadre } from "@/lib/boutique";
import { clientAcheteur } from "@/lib/supabase-acheteur";
import { memeOrigine } from "@/lib/origine";
import { COOKIE_COMMANDE, NUMERO_DEVIS, SAISIE_CODE, raisonDe, type Raison, type ReponsePasser } from "@/lib/commande";
import { envoyerCourrielsCommandes } from "@/lib/courriels/commandes";
import { enFond } from "@/lib/gestion/skanfact";

/* ============================================================================
   PASSER COMMANDE — la page envoie le panier, le contact, l'adresse et le
   total qu'elle a affiché ; public.passer_commande recalcule tout et décide.

   · Même origine exigée : un site tiers ne fait pas commander à votre place.
   · La session de l'acheteur (connexion par code SMS) est lue dans ses
     cookies : la base sait alors à quel compte rattacher la commande. Sans
     session, la commande part en invité — si la boutique l'autorise.
   · Réussite : « numéro.jeton » dans un cookie HttpOnly, limité à
     /commande, pour la page de fin. Le jeton n'apparaît dans aucune adresse.
   ========================================================================== */

export const dynamic = "force-dynamic";

const STATUTS: Partial<Record<Raison, number>> = {
  boutique: 404, compte: 401, bloque: 403, en_attente: 429, stock: 409, total: 409, cle: 409,
  devis: 404, expire: 410, deja: 409, module: 404, code: 409,
};

function reponse(corps: ReponsePasser, statut = 200): Response {
  return Response.json(corps, { status: statut, headers: { "cache-control": "private, no-store" } });
}

type Corps = {
  cle?: unknown;
  lignes?: unknown;
  contact?: unknown;
  livraison?: unknown;
  total?: unknown;
  note?: unknown;
  /** Accepter un devis (module devis) : la commande aux prix du devis. */
  devis?: unknown;
  /** « express » : l'achat express d'une fiche (le panier n'est pas vidé). */
  origine?: unknown;
  /** Le code promo tapé (module promotions). */
  code?: unknown;
};

export async function POST(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  if (!memeOrigine(req)) return reponse({ ok: false, raison: "inconnue", message: "Origine refusée" }, 403);
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) return reponse({ ok: false, raison: "boutique", message: "Boutique introuvable" }, 404);

  const corps = (await req.json().catch(() => null)) as Corps | null;
  if (!corps || typeof corps.cle !== "string" || typeof corps.total !== "number") {
    return reponse({ ok: false, raison: "panier", message: "Commande illisible" }, 400);
  }

  const magasin = await cookies();
  const sb = await clientAcheteur();

  const devis = typeof corps.devis === "string" && NUMERO_DEVIS.test(corps.devis) ? corps.devis : null;
  const { data, error } = devis
    ? await sb.rpc("accepter_devis", {
        p_boutique_id: cadre.boutique.id,
        p_numero: devis,
        p_cle_idempotence: corps.cle,
        p_contact: corps.contact ?? {},
        p_livraison: corps.livraison ?? {},
      })
    : await sb.rpc("passer_commande", {
        p_boutique_id: cadre.boutique.id,
        p_cle_idempotence: corps.cle,
        p_lignes: corps.lignes ?? [],
        p_contact: corps.contact ?? {},
        p_livraison: corps.livraison ?? {},
        p_total_attendu_millimes: Math.round(corps.total),
        p_note: typeof corps.note === "string" ? corps.note : null,
        p_code: typeof corps.code === "string" && SAISIE_CODE.test(corps.code) ? corps.code : null,
      });
  if (error) {
    const raison = raisonDe(error.hint);
    // Un refus prévu porte un message écrit pour l'acheteur (la base le
    // rédige) ; une erreur imprévue reste dans le journal du serveur.
    if (raison === "inconnue") {
      console.error(`${devis ? "accepter_devis" : "passer_commande"} (${boutique}) : ${error.code} ${error.message}`);
      return reponse({ ok: false, raison, message: "Erreur du serveur" }, 500);
    }
    return reponse({ ok: false, raison, message: error.message }, STATUTS[raison] ?? 422);
  }

  const resultat = data as { numero: string; jeton: string; rejouee?: boolean };
  // Les e-mails de la commande (au client, à l'équipe), si la boutique les a réglés : en fond.
  if (!resultat.rejouee && cadre) enFond(envoyerCourrielsCommandes(cadre.boutique.id));
  const securise = (req.headers.get("origin") ?? "").startsWith("https:");
  const origine = devis ? ".devis" : corps.origine === "express" ? ".express" : "";
  magasin.set(COOKIE_COMMANDE, `${resultat.numero}.${resultat.jeton}${origine}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: securise,
    path: "/commande",
    maxAge: 60 * 60 * 24 * 30,
  });
  return reponse({ ok: true, numero: resultat.numero });
}
