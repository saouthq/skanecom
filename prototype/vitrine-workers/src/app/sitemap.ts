import type { MetadataRoute } from "next";
import { chargeCatalogue, chargeCategories } from "@/lib/catalogue";

/* Le plan du site est CONSTRUIT depuis la base : chaque produit publié et
   chaque rayon actif y entre, avec sa date de dernière modification réelle.
   Un plan écrit à la main serait périmé au premier produit ajouté par le père
   — et un site de démonstration doit se trouver sur Google (PRD §5).
   La page de recherche n'y figure pas : elle n'est pas du contenu. */

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maymar.tn";
  const [produits, categories] = await Promise.all([chargeCatalogue(), chargeCategories()]);

  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/catalogue`, changeFrequency: "daily", priority: 0.9 },
    ...categories.map((c) => ({
      url: `${base}/categorie/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...produits.map((p) => ({
      url: `${base}/produit/${p.slug}`,
      lastModified: new Date(p.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
