import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { contenuDe, contenuRecu, versBase } from "@/lib/apparence";
import { CHEMIN_PHOTO_ACCUEIL } from "@/lib/gestion/accueil";
import { messagePage } from "@/lib/gestion/pages";
import { retirerFichier } from "@/lib/gestion/fichiers";
import { rafraichirVitrine } from "@/lib/console/vitrine-cache";
import { CLES_STYLE, JETONS_COULEUR } from "@/lib/theme";

/* ============================================================================
   L'ÉDITEUR DE LA VITRINE — trois gestes :
   · « brouillon » : l'essai en cours (`contenu`, en JSON : l'apparence et
     l'accueil), à part du thème publié ; `version_brouillon` est celle lue
     (vide s'il n'y en avait pas) ;
   · « publier » : le contenu passe dans le thème (`version` : celle du thème
     lue à l'ouverture), le brouillon s'efface ;
   · « abandonner » : le brouillon s'efface, la vitrine garde ce qui est publié.

   Et pour les pages de la boutique (migration 68) :
   · « page » : le brouillon d'une page (`id`, `version` : celle de la page
     en ligne lue, `contenu` en JSON, vide pour l'abandonner), ou une page
     neuve (`slug`, `contenu`), hors ligne jusqu'à « Publier » ;
   · « page-ordre » : l'ordre des pages (`ids`, en JSON) — aussitôt en ligne,
     comme « page-retirer » (`id`), qui retire une page de la boutique.

   Publier et abandonner rendent les photos que plus rien n'emploie
   (migration 66) : celles que le backoffice avait déposées quittent le dépôt
   (jamais une photo de la console ni du jeu de démo), et l'écran oublie les
   gestes qui y menaient.

   L'écran envoie en arrière-plan (`accept: application/json`) et garde
   l'essai à l'écran quoi qu'il arrive. Sans script, un formulaire ordinaire
   (un champ par réglage : `code`, `polices.titres`, `style.coins`,
   `couleurs.accent`… ; l'accueil n'y est pas, il reste tel quel) et une
   redirection 303. La base revérifie le rôle, les versions et chaque valeur
   (migrations 64 et 66).
   ========================================================================== */

export const dynamic = "force-dynamic";

function message(indice: string | undefined, texte: string, geste: string): string {
  switch (indice) {
    case "role":
      return "Seuls le propriétaire et l'administrateur règlent l'apparence.";
    case "version":
      return geste === "publier"
        ? "L'apparence publiée a changé entre-temps (un collègue, la console) : rechargez la page. Votre essai reste dans le brouillon."
        : "Un collègue a modifié le brouillon entre-temps : rechargez la page pour repartir du sien.";
    case "theme":
      return "La boutique n'a pas encore de thème : la console le pose à sa mise en place.";
    case "forme":
      return `Un réglage n'a pas été accepté (${texte.replace(/^themes\.\w+ : /, "")}) : rechargez la page.`;
    case "vide":
      return "L'accueil garde une section au moins.";
    default:
      return texte;
  }
}

/** Le contenu envoyé : le JSON de l'écran, ou les champs du formulaire sans
 *  script. Relu valeur par valeur (lib/apparence.ts). */
function contenuEnvoye(f: FormData): Record<string, unknown> | null {
  const json = f.get("contenu");
  if (typeof json === "string" && json) {
    try {
      return contenuRecu(JSON.parse(json));
    } catch {
      return null;
    }
  }
  const champ = (nom: string) => (typeof f.get(nom) === "string" ? String(f.get(nom)) : undefined);
  return versBase(contenuDe({
    code: champ("code"),
    couleurs: Object.fromEntries(JETONS_COULEUR.map((j) => [j, champ(`couleurs.${j}`)?.toUpperCase()])),
    polices: { titres: champ("polices.titres"), texte: champ("polices.texte") },
    style: Object.fromEntries(CLES_STYLE.map((c) => [c, champ(`style.${c}`)])),
  }));
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug } = await params;
  const enJson = (req.headers.get("accept") ?? "").includes("application/json");
  const a = await accesEquipe();
  if (a.etat !== "ok") {
    if (enJson) return Response.json({ ok: false, message: "Votre session a expiré : reconnectez-vous, puis recommencez." }, { status: 401 });
    return vers(a.etat === "anonyme" ? "/connexion" : a.etat === "aal1" ? "/double-authentification" : "/refuse");
  }
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const f = await req.formData();
  const geste = String(f.get("geste") ?? "");
  const page = `/gestion/${slug}/apparence`;
  const refus = (texte: string, indice: string | null = null) =>
    enJson ? Response.json({ ok: false, message: texte, indice }, { headers: { "cache-control": "no-store" } })
      : vers(`${page}?${new URLSearchParams({ erreur: texte })}`);
  const entier = (nom: string) => {
    const v = String(f.get(nom) ?? "");
    return /^\d+$/.test(v) ? Number(v) : null;
  };

  // Les photos que plus rien n'emploie : celles du backoffice quittent le dépôt.
  const duBackoffice = CHEMIN_PHOTO_ACCUEIL(slug);
  const retirer = async (orphelins: string[] | undefined) => {
    const retirees: string[] = [];
    for (const chemin of orphelins ?? []) {
      if (!duBackoffice.test(chemin)) continue;
      await retirerFichier(chemin).then(() => retirees.push(chemin), (err) => console.error("éditeur : retrait de la photo en échec", chemin, err));
    }
    return retirees;
  };

  const sb = await clientSession();
  if (geste === "brouillon" || geste === "abandonner") {
    const contenu = geste === "brouillon" ? contenuEnvoye(f) : null;
    if (geste === "brouillon" && !contenu) return refus("L'essai envoyé est illisible : rechargez la page.");
    const { data, error } = await sb.rpc("gestion_brouillon_apparence", {
      p_boutique_id: boutique.boutique_id,
      p_contenu: contenu,
      p_version: entier("version_brouillon"),
    });
    if (error) return refus(message(error.hint, error.message, geste), error.hint ?? null);
    const { orphelins, ...rendu } = data as { version: number | null; jeton: string | null; orphelins?: string[] };
    const retirees = await retirer(orphelins);
    const texte = geste === "abandonner"
      ? "Brouillon abandonné : la vitrine garde ce qui est publié."
      : "Brouillon enregistré : les visiteurs voient toujours la version publiée.";
    if (enJson) return Response.json({ ok: true, message: texte, brouillon: rendu.version ? rendu : null, orphelins: retirees }, { headers: { "cache-control": "no-store" } });
    return vers(`${page}?${new URLSearchParams({ ok: texte })}`);
  }

  if (geste === "publier") {
    const contenu = contenuEnvoye(f);
    if (!contenu) return refus("L'apparence envoyée est illisible : rechargez la page.");
    const { data, error } = await sb.rpc("gestion_publier_apparence", {
      p_boutique_id: boutique.boutique_id,
      p_contenu: contenu,
      p_version: entier("version"),
    });
    if (error) return refus(message(error.hint, error.message, geste), error.hint ?? null);
    const rendu = data as { version: number; orphelins?: string[] };
    const retirees = await retirer(rendu.orphelins);
    rafraichirVitrine(slug);
    const texte = "Vitrine publiée : elle est en ligne.";
    if (enJson) return Response.json({ ok: true, message: texte, version: rendu.version, orphelins: retirees }, { headers: { "cache-control": "no-store" } });
    return vers(`${page}?${new URLSearchParams({ ok: texte })}`);
  }

  // Les pages de la boutique.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const champDe = (indice: string | undefined) => (indice === "titre" || indice === "slug" || indice === "corps" ? indice : null);
  const refusPage = (indice: string | undefined, texte: string) =>
    Response.json({ ok: false, message: messagePage(indice, texte), indice: indice ?? null, champ: champDe(indice) }, { headers: { "cache-control": "no-store" } });

  if (geste === "page") {
    if (!enJson) return refus("L'écriture d'une page demande JavaScript.");
    const id = String(f.get("id") ?? "");
    let contenu: unknown = null;
    try {
      const brut = String(f.get("contenu") ?? "");
      contenu = brut ? JSON.parse(brut) : null;
    } catch {
      return refus("La page envoyée est illisible : rechargez.");
    }
    const { data, error } = await sb.rpc("gestion_brouillon_page", {
      p_boutique_id: boutique.boutique_id,
      p_page: id ? { id: UUID.test(id) ? id : null, version: entier("version"), contenu } : { slug: String(f.get("slug") ?? ""), contenu },
    });
    if (error) return refusPage(error.hint, error.message);
    return Response.json({ ok: true, ...(data as Record<string, unknown>) }, { headers: { "cache-control": "no-store" } });
  }

  if (geste === "page-ordre" || geste === "page-retirer") {
    if (!enJson) return refus("Ce geste demande JavaScript.");
    let ids: unknown = null;
    try { ids = JSON.parse(String(f.get("ids") ?? "[]")); } catch { /* refusé plus bas */ }
    const id = String(f.get("id") ?? "");
    if (geste === "page-retirer" ? !UUID.test(id) : !Array.isArray(ids) || !ids.every((x) => typeof x === "string" && UUID.test(x))) {
      return refus("La liste des pages envoyée est illisible : rechargez.");
    }
    const r = geste === "page-retirer"
      ? await sb.rpc("gestion_retirer_page", { p_boutique_id: boutique.boutique_id, p_id: id })
      : await sb.rpc("gestion_ordonner_pages", { p_boutique_id: boutique.boutique_id, p_ids: ids as string[] });
    if (r.error) return refusPage(r.error.hint, r.error.message);
    // Le brouillon de la vitrine a avancé (l'aperçu suit) : sa version et son jeton.
    const b = r.data as { version: number | null; jeton: string | null } | null;
    return Response.json({
      ok: true,
      message: geste === "page-retirer" ? "Page retirée : la boutique ne la sert plus." : "Ordre des pages enregistré : il est en ligne.",
      brouillon: b?.version != null && b.jeton ? { version: b.version, jeton: b.jeton } : null,
    }, { headers: { "cache-control": "no-store" } });
  }

  return refus("Geste inconnu.");
}
