import { chargeCadre } from "@/lib/boutique";
import { urlFichier } from "@/lib/photos";

/* Les navigateurs demandent /favicon.ico d'office, même quand la page
   déclare son icône : on renvoie vers celle du thème de la boutique, ou
   « pas de contenu » si elle n'en a pas. */
export const revalidate = 3600;

export async function GET(_: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  const favicon = cadre?.theme.favicon;
  if (!favicon) return new Response(null, { status: 204, headers: { "cache-control": "public, max-age=86400" } });
  return new Response(null, {
    status: 302,
    headers: { location: urlFichier(favicon), "cache-control": "public, max-age=3600" },
  });
}
