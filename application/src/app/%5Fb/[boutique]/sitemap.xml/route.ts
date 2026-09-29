import { chargeCadre } from "@/lib/boutique";
import { tousLesSlugs } from "@/lib/catalogue";

/* Plan du site de CHAQUE boutique : accueil, catalogue, rayons, fiches. */
export const revalidate = 3600;

const echappe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export async function GET(_: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre?.boutique.hote_principal) return new Response("", { status: 404 });

  const racine = `https://${cadre.boutique.hote_principal}`;
  const produits = await tousLesSlugs(cadre.boutique.id);
  const adresses = [
    { loc: `${racine}/` },
    { loc: `${racine}/catalogue` },
    ...cadre.categories.map((c) => ({ loc: `${racine}/categorie/${c.slug}` })),
    ...produits.map((p) => ({ loc: `${racine}/produit/${p.slug}`, lastmod: p.created_at.slice(0, 10) })),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    adresses.map((a) => `  <url><loc>${echappe(a.loc)}</loc>${"lastmod" in a && a.lastmod ? `<lastmod>${a.lastmod}</lastmod>` : ""}</url>`).join("\n") +
    `\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
}
