import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
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

   LA CONSOLE (NEXT_PUBLIC_CONSOLE_HOTE, app.skanecom.tn en production) a son
   propre domaine, réécrit vers /_console/… : jamais servie sous le domaine
   d'une boutique, jamais mise en cache, jamais affichée dans un cadre.
   ========================================================================== */

const HOTE_CONSOLE = (process.env.NEXT_PUBLIC_CONSOLE_HOTE ?? "").toLowerCase();

const interne = (chemin: string) =>
  chemin === "/_b" || chemin.startsWith("/_b/") || chemin === "/_console" || chemin.startsWith("/_console/");

function page(statut: number, titre: string, texte: string): NextResponse {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${titre}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:36rem;margin:15vh auto;padding:0 1.5rem;color:#1b1f24;background:#fafaf8}h1{font-size:1.5rem;font-weight:500}</style></head><body><h1>${titre}</h1><p>${texte}</p></body></html>`;
  return new NextResponse(html, {
    status: statut,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/* La console : réécriture, et rafraîchissement de la session (jetons de
   GoTrue dans les cookies) — une page serveur ne peut pas écrire de cookie,
   le proxy le fait pour elle. */
async function versConsole(request: NextRequest, pathname: string, search: string): Promise<NextResponse> {
  const cible = new URL(`/_console${pathname === "/" ? "" : pathname}${search}`, request.url);
  let reponse = NextResponse.rewrite(cible);
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (liste) => {
        for (const { name, value } of liste) request.cookies.set(name, value);
        reponse = NextResponse.rewrite(cible, { request });
        for (const { name, value, options } of liste) reponse.cookies.set(name, value, options);
      },
    },
  });
  try {
    await sb.auth.getUser();
  } catch {
    // GoTrue injoignable : la page dira « reconnectez-vous ».
  }
  reponse.headers.set("cache-control", "private, no-store");
  reponse.headers.set("x-robots-tag", "noindex, nofollow");
  reponse.headers.set("x-frame-options", "DENY");
  reponse.headers.set("content-security-policy", "frame-ancestors 'none'");
  reponse.headers.set("referrer-policy", "same-origin");
  return reponse;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (interne(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  const hote = hoteDe(request.headers.get("host"));
  if (HOTE_CONSOLE && hote === HOTE_CONSOLE) return versConsole(request, pathname, search);

  const resolution = await resoudre(hote);
  switch (resolution.etat) {
    case "boutique": {
      const reponse = NextResponse.rewrite(
        new URL(`/_b/${resolution.slug}${pathname === "/" ? "" : pathname}${search}`, request.url),
      );
      // Le tunnel de commande et le compte sont propres à chaque acheteur :
      // jamais en cache, jamais indexés, et l'adresse ne part pas chez un
      // site tiers.
      if (pathname === "/commande" || pathname.startsWith("/commande/") || pathname === "/compte") {
        reponse.headers.set("cache-control", "private, no-store");
        reponse.headers.set("x-robots-tag", "noindex, nofollow");
        reponse.headers.set("referrer-policy", "same-origin");
      }
      return reponse;
    }
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
