import { accesEquipe, clientSession } from "@/lib/console/session";
import { vers } from "@/lib/console/http";
import { EXPORTS, versCsv } from "@/lib/gestion/export";

/* ============================================================================
   TÉLÉCHARGER UN EXPORT (B8) — /gestion/<boutique>/export/<jeu>, un fichier
   CSV. La base revérifie le rôle (propriétaire, admin) et trace l'export.
   Jamais en cache : ce sont les données des clients.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; quoi: string }> }) {
  const { slug, quoi } = await params;
  if (!EXPORTS[quoi]) return new Response("Export inconnu", { status: 404 });
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_export", { p_boutique_id: boutique.boutique_id, p_quoi: quoi });
  if (error) {
    const message = error.hint === "role" ? "Seuls le propriétaire et l'administrateur exportent les données." : error.message;
    return vers(`/gestion/${slug}/reglages?${new URLSearchParams({ erreur: message })}#t-donnees`);
  }
  const jour = new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Tunis" }).format(new Date());
  return new Response(versCsv(quoi, (data ?? []) as Record<string, unknown>[]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-${quoi}-${jour}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
