import { chargeCadre } from "@/lib/boutique";
import { achetesEnsemble, etatProduit } from "@/lib/catalogue";
import { urlPhoto } from "@/lib/photos";
import { champ } from "@/lib/i18n";
import type { ProduitVu, ReponseVus } from "@/lib/suggestions";

/* « Souvent achetés avec votre panier » (components/EnsembleDuPanier.tsx) :
   les pièces que les commandes de la boutique réunissent avec celles du
   panier (public.achetes_ensemble), relues en base — publiées, en stock,
   avec leur prix « dès » et leur photo, et leur déclinaison quand il n'y en
   a qu'une (l'ajout en un geste). Rien de personnel : la même réponse pour
   le même panier, d'où le cache partagé. */

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

  const produits = (await achetesEnsemble(cadre.boutique.id, slugs, 3)).map((p): ProduitVu => {
    // Une seule déclinaison, assez de stock pour son minimum : l'ajout en un geste.
    const v = p.variantes.length === 1 ? p.variantes[0] : null;
    const minimum = Math.max(1, v?.quantite_min ?? 1);
    const nom = champ(p, "nom");
    // Le libellé du panier, comme la fiche l'écrit : « Sac de voyage en cuir · Cognac ».
    const declinaison = v ? p.options.map((o) => (v.options as Record<string, string>)[o.cle]).filter(Boolean).join(", ") : "";
    return {
      id: p.id,
      slug: p.slug,
      nom,
      marque: p.marque,
      photo: urlPhoto(p)?.src ?? null,
      etat: etatProduit(p),
      variantes: p.variantes.map((x) => ({ id: x.id, prix_millimes: x.prix_millimes })),
      ...(v && v.stock >= minimum
        ? { unique: { id: v.id, sku: v.sku, stock: v.stock, prix_millimes: v.prix_millimes, quantite_min: minimum, image: v.image_chemin ?? p.images[0]?.chemin ?? null, libelle: declinaison ? `${nom} · ${declinaison}` : nom } }
        : {}),
    };
  });
  return reponse({ produits });
}
