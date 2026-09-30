import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { messagePage, type PageGestion } from "@/lib/gestion/pages";

/* ============================================================================
   LES GESTES SUR LES PAGES — enregistrer (créer ou modifier), retirer,
   monter ou descendre dans l'ordre.

   L'éditeur envoie en arrière-plan (`accept: application/json`) : la réponse
   dit ce qui a été gardé, ou le champ refusé — le texte reste à l'écran. Sans
   script, un formulaire ordinaire et une redirection 303. La base revérifie
   le rôle, la forme et la version (migration 43).
   ========================================================================== */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHAMPS: Record<string, string> = { slug: "slug", titre: "titre", corps: "corps", genre: "genre" };

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug } = await params;
  const enJson = (req.headers.get("accept") ?? "").includes("application/json");
  const a = await accesEquipe();
  if (a.etat !== "ok") {
    if (enJson) return Response.json({ ok: false, message: "Votre session a expiré : reconnectez-vous (copiez d'abord votre texte)." }, { status: 401 });
    return vers(a.etat === "anonyme" ? "/connexion" : a.etat === "aal1" ? "/double-authentification" : "/refuse");
  }
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const f = await req.formData();
  const texte = (cle: string) => String(f.get(cle) ?? "").trim();
  const geste = texte("geste");
  const id = texte("id");
  const liste = `/gestion/${slug}/pages`;
  const retour = (chemin: string, m: string, ok: boolean) => vers(`${chemin}?${new URLSearchParams(ok ? { ok: m } : { erreur: m })}`);
  const sb = await clientSession();

  if (geste === "enregistrer") {
    const publie = f.get("publie") === "1";
    const { data, error } = await sb.rpc("gestion_enregistrer_page", {
      p_boutique_id: boutique.boutique_id,
      p_page: {
        ...(UUID.test(id) ? { id, version: Number(texte("version")) || 0 } : {}),
        slug: texte("slug"),
        titre_fr: texte("titre"),
        genre: texte("genre") === "questions" ? "questions" : "texte",
        // Le texte tel qu'écrit : ses lignes vides séparent les paragraphes.
        corps_fr: String(f.get("corps") ?? "").replace(/\r\n?/g, "\n").replace(/\s+$/, ""),
        publie,
        dans_pied: f.get("dans_pied") === "1",
      },
    });
    if (error) {
      const message = messagePage(error.hint, error.message);
      if (enJson) return Response.json({ ok: false, message, champ: CHAMPS[error.hint ?? ""] ?? null, indice: error.hint ?? null });
      return retour(UUID.test(id) ? `${liste}/${id}` : `${liste}/nouvelle`, message, false);
    }
    const page = data as { id: string; version: number; slug: string };
    const message = publie
      ? `Page enregistrée et publiée : elle paraît sur la boutique à /${page.slug} d'ici cinq minutes.`
      : "Brouillon enregistré : la boutique ne le montre pas tant qu'il n'est pas publié.";
    if (enJson) return Response.json({ ok: true, message, ...page }, { headers: { "cache-control": "no-store" } });
    return retour(`${liste}/${page.id}`, message, true);
  }

  if (!UUID.test(id)) return retour(liste, "Page inconnue.", false);

  if (geste === "retirer") {
    const { error } = await sb.rpc("gestion_retirer_page", { p_boutique_id: boutique.boutique_id, p_id: id });
    if (error) return retour(`${liste}/${id}`, messagePage(error.hint, error.message), false);
    return retour(liste, "Page retirée : la boutique ne la sert plus (d'ici cinq minutes), et son lien quitte le pied de page.", true);
  }

  if (geste === "monter" || geste === "descendre") {
    const { data, error } = await sb.rpc("gestion_pages", { p_boutique_id: boutique.boutique_id });
    if (error) return retour(liste, messagePage(error.hint, error.message), false);
    const ids = (data as PageGestion[]).map((p) => p.id);
    const i = ids.indexOf(id);
    const j = geste === "monter" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return vers(liste);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const r = await sb.rpc("gestion_ordonner_pages", { p_boutique_id: boutique.boutique_id, p_ids: ids });
    if (r.error) return retour(liste, messagePage(r.error.hint, r.error.message), false);
    return vers(`${liste}#page-${id}`);
  }

  return retour(liste, "Geste inconnu.", false);
}
