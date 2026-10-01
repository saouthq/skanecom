import { chargeCadre } from "@/lib/boutique";
import { pageAvis } from "@/lib/avis";
import { FILTRES_AVIS, type FiltreAvis, type PageAvis } from "@/lib/avis-communs";

/* Les avis d'une fiche, page par page et par filtre (components/ListeAvis.tsx) :
   tous, avec photos, ou une note ; `decalage` : combien la fiche en montre
   déjà. Lus en base (public.avis_produit_page) — les avis publiés seulement,
   rien de personnel : la même réponse pour tous, d'où le cache partagé (un
   avis publié paraît « d'ici quelques minutes », comme sur la fiche). */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function reponse(corps: PageAvis | { erreur: string }, statut = 200): Response {
  return Response.json(corps, { status: statut, headers: { "cache-control": statut === 200 ? "public, max-age=300" : "no-store" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre || !cadre.avis) return reponse({ erreur: "introuvable" }, 404);
  const q = new URL(req.url).searchParams;
  const produit = q.get("produit") ?? "";
  const filtre = (q.get("filtre") ?? "tous") as FiltreAvis;
  const decalage = Number(q.get("decalage") ?? "0");
  if (!UUID.test(produit) || !FILTRES_AVIS.includes(filtre) || !Number.isInteger(decalage) || decalage < 0 || decalage > 10000) {
    return reponse({ erreur: "requete" }, 400);
  }
  const page = await pageAvis(cadre.boutique.id, produit, filtre, decalage);
  if (!page) return reponse({ erreur: "indisponible" }, 503);
  return reponse(page);
}
