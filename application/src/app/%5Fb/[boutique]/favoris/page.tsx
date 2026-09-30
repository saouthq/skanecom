import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CarteProduit } from "@/components/CarteProduit";
import { EnteteListe } from "@/components/EnteteListe";
import { Gabarit } from "@/components/Gabarit";
import { ListeFavoris } from "@/components/ListeFavoris";
import { cadre as chargeCadre } from "@/lib/boutique";
import type { Produit } from "@/lib/catalogue";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

/* ============================================================================
   MES FAVORIS — les pièces marquées d'un cœur (réglage catalogue.favoris).
   La liste vit dans le navigateur ; l'adresse la porte (/favoris?s=…), si
   bien que le serveur rend la page avec les cartes du catalogue, relues en
   base (prix, stock, photo). ListeFavoris tient l'adresse à jour.
   ========================================================================== */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: t.favoris.titre, robots: { index: false } };

const SLUG = /^[a-z0-9-]{1,120}$/;

export default async function Favoris({
  params,
  searchParams,
}: {
  params: Promise<{ boutique: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const [{ boutique }, { s }] = await Promise.all([params, searchParams]);
  const cadre = await chargeCadre(boutique);
  if (!cadre.favoris) notFound();
  const demandes = [...new Set((s ?? "").split(",").filter((x) => SLUG.test(x)))].slice(0, 60);

  let produits: Produit[] = [];
  if (demandes.length) {
    const { data, error } = await supabase.from("vitrine_produits").select("*").eq("boutique_id", cadre.boutique.id).in("slug", demandes);
    if (error) throw new Error(`Favoris illisibles : ${error.message}`);
    const parSlug = new Map(((data ?? []) as Produit[]).map((p) => [p.slug, p]));
    produits = demandes.map((x) => parSlug.get(x)).filter((p): p is Produit => Boolean(p));
  }
  const technique = cadre.theme.code === "technique";

  return (
    <Gabarit>
      <EnteteListe gabarit={cadre.theme.code} fil={[{ nom: t.favoris.titre }]} titre={t.favoris.titre} chapo={t.favoris.chapo} />
      <ListeFavoris demandes={demandes}>
        {produits.length ? (
          <div className={technique ? "te-grille" : "ed-grille"}>
            {produits.map((p, i) => (
              <CarteProduit key={p.id} produit={p} gabarit={cadre.theme.code} prixBarres={cadre.prixBarres} prioritaire={i < 4} />
            ))}
          </div>
        ) : null}
      </ListeFavoris>
    </Gabarit>
  );
}
