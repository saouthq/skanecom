import { NextResponse, type NextRequest } from "next/server";
import { accesEquipe, clientSession, versConnexion } from "@/lib/console/session";
import { COOKIE_SUITE, suiteSure } from "@/lib/console/suite";

/* ============================================================================
   L'ENTRÉE DANS UN BACKOFFICE — après la connexion ou le choix de la
   boutique : chacun arrive sur son travail. Un site vitrine (sans prix, il
   ne vend pas) ouvre sur ses Demandes — un artisan arrivait sur
   « Commandes : aucune commande à confirmer », ses demandes de clients sous
   un onglet. Les autres boutiques, sur leurs Commandes, comme avant ;
   l'adresse des Commandes, elle, ne change pas (le menu y mène toujours).
   ========================================================================== */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const vers = (chemin: string) => NextResponse.redirect(new URL(chemin, req.url), 303);
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers(await versConnexion());
  if (a.etat === "aal1") return vers("/double-authentification");
  if (a.etat !== "ok") return vers("/gestion");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return vers("/gestion");
  // Reconnecté après une session qui avait pris fin : retour à la page où l'on était.
  const suite = suiteSure(decodeURIComponent(req.cookies.get(COOKIE_SUITE)?.value ?? ""));
  if (suite && (suite === `/gestion/${slug}` || suite.startsWith(`/gestion/${slug}/`) || suite.startsWith(`/gestion/${slug}?`))) {
    const r = vers(suite);
    r.cookies.set(COOKIE_SUITE, "", { path: "/", maxAge: 0 });
    return r;
  }
  const sb = await clientSession();
  const { data } = await sb.rpc("gestion_demandes_etat", { p_boutique_id: boutique.boutique_id });
  const d = data as { actif: boolean; site_vitrine: boolean; total: number } | null;
  return vers(d?.site_vitrine && (d.actif || d.total) ? `/gestion/${slug}/demandes` : `/gestion/${slug}`);
}
