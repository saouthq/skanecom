import { chargeCadre } from "@/lib/boutique";
import { listeProduits } from "@/lib/catalogue";
import { urlPhoto } from "@/lib/photos";
import { champ } from "@/lib/i18n";
import type { ReponseSuggestions, Suggestion } from "@/lib/suggestions";

/* Les suggestions de la recherche, pendant la frappe (components/
   ChampRecherche.tsx) : les six pièces les plus pertinentes, avec ce qu'il
   faut pour les reconnaître d'un coup d'œil (photo, marque, prix, et la
   référence d'une pièce unique), et le nombre total — « Voir les 12
   résultats ». La même recherche que la page (public.liste_produits). */

export const dynamic = "force-dynamic";


function reponse(corps: ReponseSuggestions, statut = 200): Response {
  return Response.json(corps, { status: statut, headers: { "cache-control": "private, max-age=30" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) return reponse({ total: 0, produits: [] }, 404);
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 2) return reponse({ total: 0, produits: [] });

  const liste = await listeProduits(cadre.boutique.id, { q }, "pertinence", 1, 6);
  const produits = liste.produits.map((p): Suggestion => {
    const prix = p.variantes.map((v) => v.prix_millimes);
    return {
      slug: p.slug,
      nom: champ(p, "nom"),
      marque: p.marque,
      reference: p.variantes.length === 1 ? p.variantes[0].sku : null,
      prix: prix.length ? Math.min(...prix) : 0,
      plusieursPrix: new Set(prix).size > 1,
      photo: urlPhoto(p)?.src ?? null,
    };
  });
  return reponse({ total: liste.total, produits });
}
