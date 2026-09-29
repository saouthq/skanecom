import { NextResponse, type NextRequest } from "next/server";
import { hoteDe, resoudre } from "@/lib/annuaire";

/* ============================================================================
   LA FAÇADE — une application, toutes les boutiques.

   À chaque requête : le domaine donne la boutique (lib/annuaire.ts), puis
   l'adresse est réécrite EN INTERNE vers /_b/<boutique>/… . Toutes les pages
   vivent sous src/app/%5Fb/[boutique]/ (le dossier s'appelle %5Fb : Next.js
   ne route pas un dossier qui commence par « _ »).

   Pourquoi réécrire : le cache de Cloudflare ne tient pas compte du domaine
   (vérifié le 28/09 et dans le code du cache de réponses le 29/09). Avec la
   boutique dans l'adresse interne, deux boutiques n'ont jamais la même entrée
   de cache — testé chez Cloudflare le 29/09 (prototype/vitrine-workers).

   L'adresse interne n'est JAMAIS servie directement : sinon un visiteur de la
   boutique A pourrait afficher les pages de la boutique B sous le domaine A.
   ========================================================================== */

function page(statut: number, titre: string, texte: string): NextResponse {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${titre}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:36rem;margin:15vh auto;padding:0 1.5rem;color:#1b1f24;background:#fafaf8}h1{font-size:1.5rem;font-weight:500}</style></head><body><h1>${titre}</h1><p>${texte}</p></body></html>`;
  return new NextResponse(html, {
    status: statut,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/_b" || pathname.startsWith("/_b/")) {
    return new NextResponse(null, { status: 404 });
  }

  const resolution = await resoudre(hoteDe(request.headers.get("host")));
  switch (resolution.etat) {
    case "boutique":
      return NextResponse.rewrite(
        new URL(`/_b/${resolution.slug}${pathname === "/" ? "" : pathname}${search}`, request.url),
      );
    case "fermee":
      return page(404, "Boutique fermée", "Cette boutique n'est pas ouverte en ce moment.");
    case "injoignable":
      return page(503, "Boutique momentanément indisponible", "Revenez dans quelques minutes.");
    default:
      return page(404, "Adresse inconnue", "Aucune boutique n'est reliée à cette adresse.");
  }
}

export const config = {
  matcher: ["/((?!_next/).*)"],
};
