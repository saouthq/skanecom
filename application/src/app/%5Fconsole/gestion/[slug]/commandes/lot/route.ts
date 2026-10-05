import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { envoyerApres } from "@/lib/gestion/skanfact";

/* ============================================================================
   LES GESTES GROUPÉS DE LA LISTE — les cases cochées (`n`, un numéro chacune)
   et le geste : « expedier » (remettre au livreur, avec le transporteur
   tapé, sinon celui de chaque commande) ou « livrer » (le point du livreur :
   livrées, paiement encaissé). La base fait chaque commande comme un geste
   de sa fiche et nomme celles qu'elle laisse de côté (…_gestes_groupes.sql) ;
   puis les factures SkanFact partent, et la liste revient avec le bilan.
   ========================================================================== */

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  role: "Ce geste n'est pas dans votre rôle.",
  lot: "Cochez au moins une commande (200 au plus d'un coup).",
  motif: "Le nom du transporteur est trop long (80 caractères).",
};

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug } = await params;
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const f = await req.formData();
  const geste = String(f.get("geste") ?? "");
  const etape = geste === "livrer" ? "expediees" : "a_preparer";
  const liste = `/gestion/${slug}`;
  const numeros = f.getAll("n").map((x) => String(x).trim()).filter(Boolean);

  const sb = await clientSession();
  const { data, error } = geste === "livrer"
    ? await sb.rpc("gestion_livrer_lot", { p_boutique_id: boutique.boutique_id, p_numeros: numeros })
    : geste === "expedier"
      ? await sb.rpc("gestion_expedier_lot", {
          p_boutique_id: boutique.boutique_id, p_numeros: numeros, p_transporteur: String(f.get("transporteur") ?? "").trim() || null,
        })
      : { data: null, error: { hint: "", message: "Geste inconnu" } };
  if (error) return versAvecErreur(liste, (error.hint && MESSAGES[error.hint]) || error.message, { etape });
  const r = data as { faites: string[]; ignorees: string[] };
  if (r.faites.length) await envoyerApres(boutique.boutique_id);
  const bilan = new URLSearchParams({ etape, fait: `lot-${geste}`, n: String(r.faites.length) });
  if (r.ignorees.length) bilan.set("ignorees", r.ignorees.join(","));
  return vers(`${liste}?${bilan}`);
}
