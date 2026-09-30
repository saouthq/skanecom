import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { messagePaniers } from "@/lib/gestion/paniers";

/* ============================================================================
   LES GESTES SUR UN PANIER ABANDONNÉ — « Relancé » (le message est parti :
   une fois, pas deux) ou « Ignorer » : public.gestion_geste_panier.
   Formulaires HTML ordinaires, réponse par une redirection 303 vers l'écran,
   sur le panier.
   ========================================================================== */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  const panier = String(f.get("panier") ?? "");
  // L'ancre deux fois : en fragment (sans script) et en paramètre (le geste en place).
  const retour = (champs: Record<string, string>, ancre = "") =>
    vers(`/gestion/${slug}/paniers?${new URLSearchParams({ ...champs, ...(ancre ? { ancre } : {}) })}${ancre ? `#${ancre}` : ""}`);
  if (!UUID.test(panier) || !["relance", "ignore"].includes(geste)) return retour({ erreur: "Geste inconnu." });

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_geste_panier", { p_boutique_id: boutique.boutique_id, p_panier_id: panier, p_geste: geste });
  if (error) return retour({ erreur: messagePaniers(error.hint, error.message) }, `panier-${panier}`);
  const nom = (data as { nom?: string | null } | null)?.nom;
  const ok = geste === "relance"
    ? `Relancé${nom ? ` : ${nom}` : ""}. Une commande qui suit s'affichera ici.`
    : "Panier ignoré : il ne sera pas relancé.";
  return retour({ ok }, geste === "relance" ? `panier-${panier}` : "");
}
