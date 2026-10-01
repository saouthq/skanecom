import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { contenuDe, versBase } from "@/lib/apparence";
import { CLES_STYLE, JETONS_COULEUR } from "@/lib/theme";

/* ============================================================================
   L'APPARENCE — trois gestes :
   · « brouillon » : l'essai en cours (`contenu`, en JSON), à part du thème
     publié ; `version_brouillon` est celle lue (vide s'il n'y en avait pas) ;
   · « publier » : le contenu passe dans le thème (`version` : celle du thème
     lue à l'ouverture), le brouillon s'efface ;
   · « abandonner » : le brouillon s'efface, la vitrine garde ce qui est publié.

   L'écran envoie en arrière-plan (`accept: application/json`) et garde
   l'essai à l'écran quoi qu'il arrive. Sans script, un formulaire ordinaire
   (un champ par réglage : `code`, `polices.titres`, `style.coins`,
   `couleurs.accent`…) et une redirection 303. La base revérifie le rôle, les
   versions et chaque valeur (migration 64).
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
      return versBase(contenuDe(JSON.parse(json)));
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
    const rendu = data as { version: number | null; jeton: string | null };
    const texte = geste === "abandonner"
      ? "Brouillon abandonné : la vitrine garde l'apparence publiée."
      : "Brouillon enregistré : les visiteurs voient toujours la version publiée.";
    if (enJson) return Response.json({ ok: true, message: texte, brouillon: rendu.version ? rendu : null }, { headers: { "cache-control": "no-store" } });
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
    const texte = "Apparence publiée : la boutique la montre d'ici cinq minutes.";
    if (enJson) return Response.json({ ok: true, message: texte, version: (data as { version: number }).version }, { headers: { "cache-control": "no-store" } });
    return vers(`${page}?${new URLSearchParams({ ok: texte })}`);
  }

  return refus("Geste inconnu.");
}
