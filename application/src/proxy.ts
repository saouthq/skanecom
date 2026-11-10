import { NextResponse, type NextRequest } from "next/server";
import { EN_TETE_CHEMIN, EN_TETE_GESTE } from "@/lib/console/suite";
import { createServerClient } from "@supabase/ssr";
import { hoteDe, resoudre } from "@/lib/annuaire";
import { apercuValide, etatMaintenance, pageMaintenance } from "@/lib/maintenance";

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

/* L'APERÇU DE L'APPARENCE (écran « Apparence » du backoffice, migration 64)
   — `?apercu=<jeton>.<version>` : la boutique rend le brouillon de son
   apparence à qui présente le jeton (son cadre d'aperçu, un lien ouvert sur
   un téléphone). Le jeton suit dans un cookie de la boutique, partitionné
   (il vit aussi dans le cadre du backoffice, d'un autre site) : la
   navigation garde l'aperçu. `?apercu=fin` le quitte. Le segment interne
   devient `<boutique>~<jeton>.<version>` : une entrée de cache à part, que
   la version change à chaque brouillon enregistré ; la page n'est jamais
   gardée ni indexée. */
const COOKIE_APERCU = "skanecom_apercu";
const JETON_APERCU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9]{1,9}$/;

/* Qui peut afficher la boutique dans un cadre : elle-même, et la console
   (l'aperçu de l'écran « Apparence »). Personne d'autre (détournement de
   clic sur le tunnel de commande). */
const CADRES_PERMIS = HOTE_CONSOLE
  ? `frame-ancestors 'self' ${HOTE_CONSOLE.endsWith(".localhost") || HOTE_CONSOLE === "localhost" ? `http://${HOTE_CONSOLE}:*` : `https://${HOTE_CONSOLE}`}`
  : "frame-ancestors 'self'";

const interne = (chemin: string) =>
  chemin === "/_b" || chemin.startsWith("/_b/") || chemin === "/_console" || chemin.startsWith("/_console/");

const echappe = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** La page sobre d'une adresse qu'on ne sert pas — l'allure de la page de
 *  maintenance (lib/maintenance.ts) : centrée, l'initiale de la boutique
 *  quand on la connaît, le mode sombre suivi. */
function page(statut: number, titre: string, texte: string, entetes: Record<string, string> = {}, nom: string | null = null): NextResponse {
  const initiale = nom ? `<span class="initiale" aria-hidden="true">${echappe(nom.trim().charAt(0).toUpperCase())}</span>` : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${echappe(titre)}</title><style>
:root{color-scheme:light dark;--fond:#f7f6f3;--encre:#1b1f24;--doux:#5d6470;--trait:#e4e1da}
@media (prefers-color-scheme:dark){:root{--fond:#121416;--encre:#f1efe9;--doux:#a5abb4;--trait:#2a2e33}}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;display:grid;place-items:center;padding:2rem 1.25rem;background:var(--fond);color:var(--encre);font:17px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:30rem;text-align:center}
.initiale{display:inline-grid;place-items:center;width:3.25rem;height:3.25rem;border-radius:999px;border:1px solid var(--trait);font-weight:600;font-size:1.25rem;margin-bottom:1.5rem}
h1{margin:0;font-size:clamp(1.5rem,5vw,2rem);font-weight:600;letter-spacing:-.02em;line-height:1.2;text-wrap:balance}
p{margin:.875rem 0 0;color:var(--doux);text-wrap:pretty}
</style></head><body><main>${initiale}<h1>${echappe(titre)}</h1><p>${echappe(texte)}</p></main></body></html>`;
  return new NextResponse(html, {
    status: statut,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...entetes },
  });
}

/* Une boutique qu'on ne sert pas, selon pourquoi. Suspendue (un abonnement à
   régler, un contenu à corriger), c'est momentané : un 503 que les moteurs de
   recherche attendent, là où un 404 de quelques jours retirait ses pages de
   leur index ; et son nom, pour que le client sache où il est. */
function pageNonServie(statut: string | undefined, nom: string | null | undefined): NextResponse {
  const qui = nom?.trim() || null;
  if (statut === "suspendue") {
    return page(503, qui ? `${qui} est momentanément fermée` : "Boutique momentanément fermée",
      "Elle rouvre bientôt : revenez un peu plus tard.", { "retry-after": "3600" }, qui);
  }
  if (statut === "en_preparation") {
    return page(404, qui ? `${qui} ouvre bientôt` : "Boutique bientôt ouverte", "Elle se prépare : revenez dans quelques jours.", {}, qui);
  }
  return page(404, "Boutique fermée", "Cette boutique n'est pas ouverte en ce moment.");
}

/* La console : réécriture, et rafraîchissement de la session (jetons de
   GoTrue dans les cookies) — une page serveur ne peut pas écrire de cookie,
   le proxy le fait pour elle. */
async function versConsole(request: NextRequest, pathname: string, search: string): Promise<NextResponse> {
  const cible = new URL(`/_console${pathname === "/" ? "" : pathname}${search}`, request.url);
  // Où l'on était, pour y revenir après une reconnexion (lib/console/session.ts,
  // versConnexion) : la page demandée ; pour un geste envoyé, la page d'où il part.
  request.headers.delete(EN_TETE_CHEMIN);
  request.headers.delete(EN_TETE_GESTE);
  if (request.method === "GET") request.headers.set(EN_TETE_CHEMIN, `${pathname}${search}`);
  else {
    const depuis = request.headers.get("referer");
    const u = depuis ? new URL(depuis) : null;
    if (u && u.host === request.nextUrl.host) {
      request.headers.set(EN_TETE_CHEMIN, `${u.pathname}${u.search}`);
      request.headers.set(EN_TETE_GESTE, "1");
    }
  }
  let reponse = NextResponse.rewrite(cible, { request });
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
  // Un geste envoyé sans rechargement (components/console/Retours.tsx) : le
  // navigateur suit la redirection 303 jusqu'à la page de retour, dont il ne
  // veut que l'adresse. Rien n'est rendu ici — le routeur la redemandera, en
  // RSC. Les cookies de session rafraîchis, eux, partent.
  if (request.method === "GET" && request.headers.get("x-skanecom-geste") === "1") {
    const vide = new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
    for (const cookie of reponse.cookies.getAll()) vide.cookies.set(cookie);
    return vide;
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
      const demande = request.nextUrl.searchParams.get("apercu");
      const garde = request.cookies.get(COOKIE_APERCU)?.value ?? null;
      const jeton = demande !== null ? (JETON_APERCU.test(demande) ? demande : null) : garde && JETON_APERCU.test(garde) ? garde : null;
      // En maintenance (toute la plateforme, ou cette boutique) : la page d'attente — sauf pour l'aperçu de
      // l'équipe (le vrai jeton de son brouillon) et l'appel de Konnect (/paiement/…), qui confirme un
      // paiement même pendant la pause.
      if (!pathname.startsWith("/paiement/")) {
        const m = await etatMaintenance();
        const b = m.boutiques[resolution.slug];
        if ((b || m.plateforme) && !(jeton && (await apercuValide(resolution.slug, jeton)))) {
          return pageMaintenance(b?.nom ?? m.noms?.[resolution.slug] ?? null, b?.message ?? m.plateforme?.message ?? null);
        }
      }
      const segment = jeton ? `${resolution.slug}~${jeton}` : resolution.slug;
      const reponse = NextResponse.rewrite(
        new URL(`/_b/${segment}${pathname === "/" ? "" : pathname}${search}`, request.url),
      );
      reponse.headers.set("content-security-policy", CADRES_PERMIS);
      if (demande !== null) {
        if (jeton) {
          reponse.cookies.set(COOKIE_APERCU, jeton, { path: "/", httpOnly: true, secure: true, sameSite: "none", partitioned: true, maxAge: 2 * 3600 });
        } else {
          reponse.cookies.set(COOKIE_APERCU, "", { path: "/", httpOnly: true, secure: true, sameSite: "none", partitioned: true, maxAge: 0 });
        }
      }
      if (jeton) {
        reponse.headers.set("cache-control", "private, no-store");
        reponse.headers.set("x-robots-tag", "noindex, nofollow");
        return reponse;
      }
      // Le tunnel de commande et le compte sont propres à chaque acheteur :
      // jamais en cache, jamais indexés, et l'adresse ne part pas chez un
      // site tiers.
      if (pathname === "/commande" || pathname.startsWith("/commande/") || pathname === "/compte" || pathname.startsWith("/panier/")) {
        reponse.headers.set("cache-control", "private, no-store");
        reponse.headers.set("x-robots-tag", "noindex, nofollow");
        reponse.headers.set("referrer-policy", "same-origin");
      }
      return reponse;
    }
    case "fermee":
      return pageNonServie(resolution.statut, resolution.nom);
    case "injoignable":
      return page(503, "Boutique momentanément indisponible", "Revenez dans quelques minutes.");
    default:
      return page(404, "Adresse inconnue", "Aucune boutique n'est reliée à cette adresse.");
  }
}

export const config = {
  matcher: ["/((?!_next/).*)"],
};
