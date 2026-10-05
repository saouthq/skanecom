import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { millimes } from "@/lib/console/import";
import { messageLots } from "@/lib/gestion/lots";

/* ============================================================================
   LES GESTES SUR LES LOTS — composer ou changer (public.gestion_enregistrer_lot),
   couper, remettre en vente, retirer (public.gestion_geste_lot). Formulaires
   HTML ordinaires, réponse par une redirection 303 vers l'écran, sur le lot
   concerné. La base revérifie le rôle, le module, les produits et le prix.
   ========================================================================== */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const REUSSITES: Record<string, (nom: string) => string> = {
  creer: (n) => `« ${n} » est en vente : le panier l'applique déjà, les fiches le proposent d'ici cinq minutes.`,
  enregistrer: (n) => `« ${n} » enregistré.`,
  couper: (n) => `« ${n} » coupé : le panier ne l'applique plus. Les commandes passées gardent leur prix.`,
  rallumer: (n) => `« ${n} » est de nouveau en vente.`,
  retirer: (n) => `« ${n} » retiré. Les commandes passées gardent son nom.`,
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
  const texte = (cle: string) => String(f.get(cle) ?? "").trim();
  const geste = texte("geste");
  const lotId = texte("lot_id");
  // L'ancre deux fois : en fragment (le navigateur y va, sans script) et en
  // paramètre (le geste en place la lit : fetch perd le fragment).
  const retour = (m: string, ok = false, ancre = "") =>
    vers(`/gestion/${slug}/promotions/lots?${new URLSearchParams({ ...(ok ? { ok: m } : { erreur: m }), ...(ancre ? { ancre: ancre.slice(1) } : {}) })}${ancre}`);
  if (lotId && !UUID.test(lotId)) return retour("Lot inconnu.");
  const sb = await clientSession();

  if (geste === "enregistrer") {
    const produits = f.getAll("produit").map((x) => String(x).trim()).filter(Boolean);
    if (produits.some((x) => !UUID.test(x))) return retour("Un des produits choisis n'existe pas dans la boutique.", false, lotId ? `#lot-${lotId}` : "#nouveau");
    const prix = millimes(texte("prix"));
    if (prix === null || Number.isNaN(prix)) return retour("Le prix du lot est illisible (ex. 359 ou 359,500).", false, lotId ? `#lot-${lotId}` : "#nouveau");
    const { data, error } = await sb.rpc("gestion_enregistrer_lot", {
      p_boutique_id: boutique.boutique_id,
      p_lot_id: lotId || null,
      p_nom: texte("nom"),
      p_accroche: texte("accroche") || null,
      p_produits: produits,
      p_prix: prix,
    });
    if (error) return retour(messageLots(error.hint, error.message), false, lotId ? `#lot-${lotId}` : "#nouveau");
    const r = data as { id: string; nom: string };
    return retour(REUSSITES[lotId ? "enregistrer" : "creer"](r.nom), true, `#lot-${r.id}`);
  }

  if (!UUID.test(lotId) || !["couper", "rallumer", "retirer"].includes(geste)) return retour("Geste inconnu.");
  const { data, error } = await sb.rpc("gestion_geste_lot", { p_boutique_id: boutique.boutique_id, p_lot_id: lotId, p_geste: geste });
  if (error) return retour(messageLots(error.hint, error.message), false, `#lot-${lotId}`);
  const r = data as { nom: string };
  return retour(REUSSITES[geste](r.nom), true, geste === "retirer" ? "" : `#lot-${lotId}`);
}
