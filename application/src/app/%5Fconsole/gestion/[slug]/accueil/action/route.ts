import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { CHEMIN_PHOTO_ACCUEIL, messageAccueil, versBase, MAX_SECTIONS, type SectionBrute } from "@/lib/gestion/accueil";
import { retirerFichier } from "@/lib/gestion/fichiers";

/* ============================================================================
   ENREGISTRER L'ACCUEIL — les sections composées à l'écran, dans leur ordre
   (`sections`, en JSON), et la version du thème lue à l'ouverture ; ou
   « revenir à l'accueil du gabarit » (sections NULL).

   Le composeur envoie en arrière-plan (`accept: application/json`) : la
   réponse dit ce qui a été gardé, ou pourquoi c'est refusé — la composition
   reste à l'écran. Sans script, un formulaire ordinaire et une redirection
   303. La base revérifie le rôle, la version et la forme (migration 59), et
   rend les photos que l'accueil n'emploie plus (migration 61).
   ========================================================================== */

export const dynamic = "force-dynamic";

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
  const version = Number(f.get("version"));
  const page = `/gestion/${slug}/accueil`;
  const refus = (message: string, indice: string | null = null) =>
    enJson ? Response.json({ ok: false, message, indice }) : vers(`${page}?${new URLSearchParams({ erreur: message })}`);

  let sections: Record<string, unknown>[] | null = null;
  if (geste === "enregistrer") {
    let lues: unknown;
    try {
      lues = JSON.parse(String(f.get("sections") ?? ""));
    } catch {
      return refus("La composition envoyée est illisible : rechargez la page.");
    }
    if (!Array.isArray(lues) || lues.length === 0) return refus("L'accueil garde une section au moins.", "vide");
    if (lues.length > MAX_SECTIONS) return refus(`${MAX_SECTIONS} sections au plus.`);
    sections = versBase(lues as SectionBrute[]);
    if (!sections) return refus("Une section est illisible : rechargez la page.");
  } else if (geste !== "gabarit") {
    return refus("Geste inconnu.");
  }

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_enregistrer_accueil", {
    p_boutique_id: boutique.boutique_id,
    p_sections: sections,
    p_version: Number.isInteger(version) ? version : null,
  });
  if (error) return refus(messageAccueil(error.hint, error.message), error.hint ?? null);
  // Les photos que l'accueil n'emploie plus : celles du backoffice quittent le dépôt.
  const { version: nouvelle, orphelins = [] } = data as { version: number; orphelins?: string[] };
  const duBackoffice = CHEMIN_PHOTO_ACCUEIL(slug);
  for (const chemin of orphelins) {
    if (duBackoffice.test(chemin)) await retirerFichier(chemin).catch((err) => console.error("accueil : retrait de la photo en échec", chemin, err));
  }

  const message = geste === "gabarit"
    ? "L'accueil reprend les sections du gabarit : la boutique le montre d'ici cinq minutes."
    : "Accueil enregistré : la boutique le montre d'ici cinq minutes.";
  if (enJson) return Response.json({ ok: true, message, version: nouvelle }, { headers: { "cache-control": "no-store" } });
  return vers(`${page}?${new URLSearchParams({ ok: message })}`);
}
