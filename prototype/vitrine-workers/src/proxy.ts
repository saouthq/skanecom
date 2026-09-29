import { NextResponse, type NextRequest } from "next/server";

/* PROTOTYPE SkanEcom — test de séparation du cache entre deux domaines
   (RAPPORT.md, phase 2). Même principe que la future vitrine multi-boutique :
   la boutique est trouvée à partir du domaine, puis l'adresse est réécrite en
   interne vers /_b/<boutique>/…, pour que chaque boutique ait ses propres
   entrées de cache. Ici, seule /test-domaine est concernée. */
const BOUTIQUES: Record<string, string> = {
  "boutique-a.exemple.tn": "boutique-a",
  "boutique-b.exemple.tn": "boutique-b",
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // L'adresse interne n'est jamais servie directement : sinon un visiteur de
  // la boutique A pourrait afficher les pages de la boutique B sur le domaine A.
  if (pathname.startsWith("/_b/")) return new NextResponse(null, { status: 404 });
  const hote = (request.headers.get("host") ?? "").split(":")[0];
  const boutique = BOUTIQUES[hote] ?? "inconnue";
  return NextResponse.rewrite(new URL(`/_b/${boutique}${pathname}`, request.url));
}

export const config = { matcher: ["/test-domaine", "/_b/:path*"] };
