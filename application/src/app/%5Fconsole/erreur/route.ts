import { lieuDe, noterErreur, pileCourte } from "@/lib/erreurs";
import { memeOrigine } from "@/lib/origine";

/* Une page de la console ou d'un backoffice cassée au navigateur
   (components/SignalerErreur.ts) : notée pour État technique → Erreurs de
   l'application. Du même site seulement, quatre mille caractères au plus ;
   réponse vide, toujours. */

export const dynamic = "force-dynamic";

const rien = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  if (!memeOrigine(req)) return rien();
  const texte = await req.text().catch(() => "");
  if (!texte || texte.length > 4000) return rien();
  let corps: { message?: unknown; pile?: unknown; chemin?: unknown } | null = null;
  try { corps = JSON.parse(texte); } catch { return rien(); }
  const message = typeof corps?.message === "string" ? corps.message.trim() : "";
  const chemin = typeof corps?.chemin === "string" && corps.chemin.startsWith("/") ? corps.chemin.slice(0, 300) : "/";
  if (!message) return rien();
  const { surface, slug } = lieuDe(chemin);
  await noterErreur({
    surface: surface === "serveur" ? "console" : surface, genre: "navigateur", slug,
    hote: req.headers.get("host"), route: null, chemin, message, pile: pileCourte(corps?.pile), digest: null,
  });
  return rien();
}
