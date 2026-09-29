import { chargeCadre } from "@/lib/boutique";

/* robots.txt de CHAQUE boutique, sur son propre domaine. */
export const revalidate = 3600;

export async function GET(_: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  const hote = cadre?.boutique.hote_principal;
  const lignes = ["User-agent: *", "Allow: /", "Disallow: /recherche", "Disallow: /filtrer"];
  if (hote) lignes.push("", `Sitemap: https://${hote}/sitemap.xml`);
  return new Response(lignes.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
}
