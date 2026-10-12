import { estControle, lieuDe, noterErreur, pileCourte } from "@/lib/erreurs";

/* Chaque erreur qu'une requête laisse échapper (une page, une route, une
   action) se note dans la base, pour la console : État technique → Erreurs
   de l'application (lib/erreurs.ts). Le Worker attend la fin de l'envoi
   (waitUntil) sans retarder la réponse. */

type Requete = { path: string; method: string; headers: Record<string, string | string[] | undefined> | Headers };
type Contexte = { routerKind?: string; routePath?: string; routeType?: string };

export async function onRequestError(erreur: unknown, requete: Requete, contexte: Contexte) {
  if (estControle(erreur)) return;
  const e = erreur as { message?: unknown; stack?: unknown; digest?: unknown } | null;
  // (un objet simple, comme Next.js le passe ; ou des Headers)
  const h = requete.headers;
  const hote = h instanceof Headers ? h.get("host") : h?.host;
  const { surface, slug } = lieuDe(requete.path ?? "/", contexte.routePath);
  await noterErreur({
    surface, genre: "serveur", slug,
    hote: typeof hote === "string" ? hote : null,
    route: contexte.routePath ?? null,
    chemin: requete.path ?? null,
    message: typeof e?.message === "string" && e.message ? e.message : String(erreur),
    pile: pileCourte(e?.stack),
    digest: typeof e?.digest === "string" ? e.digest : null,
  });
}
