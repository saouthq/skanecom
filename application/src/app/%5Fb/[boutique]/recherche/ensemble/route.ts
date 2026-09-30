import { chargeCadre } from "@/lib/boutique";
import { achetesEnsemble, etatProduit } from "@/lib/catalogue";
import { urlPhoto } from "@/lib/photos";
import { champ } from "@/lib/i18n";
import type { ProduitVu, ReponseVus } from "@/lib/suggestions";

/* « Souvent achetés avec votre panier » (components/EnsembleDuPanier.tsx) :
   les pièces que les commandes de la boutique réunissent avec celles du
   panier (public.achetes_ensemble), relues en base — publiées, en stock,
   avec leur prix « dès » et leur photo. Rien de personnel : la même réponse
   pour le même panier, d'où le cache partagé. */

export const dynamic = "force-dynamic";

function reponse(corps: ReponseVus, statut = 200): Response {
  return Response.json(corps, { status: statut, headers: { "cache-control": "public, max-age=300" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) return reponse({ produits: [] }, 404);
  if (!cadre.achetesEnsemble) return reponse({ produits: [] });
  const slugs = (new URL(req.url).searchParams.get("slugs") ?? "")
    .split(",")
    .filter((s) => /^[a-z0-9-]{1,120}$/.test(s))
    .slice(0, 20);
  if (slugs.length === 0) return reponse({ produits: [] });

  const produits = (await achetesEnsemble(cadre.boutique.id, slugs, 3)).map((p): ProduitVu => ({
    id: p.id,
    slug: p.slug,
    nom: champ(p, "nom"),
    marque: p.marque,
    photo: urlPhoto(p)?.src ?? null,
    etat: etatProduit(p),
    variantes: p.variantes.map((v) => ({ id: v.id, prix_millimes: v.prix_millimes })),
  }));
  return reponse({ produits });
}
