import { chargeCadre } from "@/lib/boutique";
import { etatProduit, type Produit } from "@/lib/catalogue";
import { supabase } from "@/lib/supabase";
import { urlPhoto } from "@/lib/photos";
import { champ } from "@/lib/i18n";
import type { ProduitVu, ReponseVus } from "@/lib/suggestions";

/* « Vus récemment » (components/VusRecemment.tsx) : les produits dont le
   navigateur a gardé les slugs, relus en base — publiés seulement, dans
   l'ordre demandé, avec leur prix « dès », leur photo et leur état de stock.
   Rien n'est gardé ici : la liste vit dans le navigateur. */

export const dynamic = "force-dynamic";

function reponse(corps: ReponseVus, statut = 200): Response {
  return Response.json(corps, { status: statut, headers: { "cache-control": "private, max-age=60" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre) return reponse({ produits: [] }, 404);
  const slugs = (new URL(req.url).searchParams.get("slugs") ?? "")
    .split(",")
    .filter((s) => /^[a-z0-9-]{1,120}$/.test(s))
    .slice(0, 12);
  if (slugs.length === 0) return reponse({ produits: [] });

  const { data, error } = await supabase
    .from("vitrine_produits")
    .select("*")
    .eq("boutique_id", cadre.boutique.id)
    .in("slug", slugs);
  if (error) return reponse({ produits: [] }, 500);
  const parSlug = new Map(((data ?? []) as Produit[]).map((p) => [p.slug, p]));
  const produits = slugs
    .map((s) => parSlug.get(s))
    .filter((p): p is Produit => Boolean(p))
    .map((p): ProduitVu => ({
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
