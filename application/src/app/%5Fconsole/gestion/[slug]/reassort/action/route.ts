import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { messageReassort } from "@/lib/gestion/reassort";

/* ============================================================================
   LES GESTES DU RÉASSORT — « Prévenue » (une personne, ou toutes celles d'une
   pièce) et « Ne reviendra pas » (les demandes d'une pièce closes) :
   public.gestion_clore_alertes, qui efface les contacts. Formulaires HTML
   ordinaires, réponse par une redirection 303 vers l'écran, sur la pièce.
   ========================================================================== */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug } = await params;
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const f = await req.formData();
  const texte = (cle: string) => String(f.get(cle) ?? "").trim();
  const geste = texte("geste");
  const piece = texte("piece");
  // L'ancre deux fois : en fragment (sans script) et en paramètre (le geste en place).
  const retour = (champs: Record<string, string>, ancre = "") =>
    vers(`/gestion/${slug}/reassort?${new URLSearchParams({ ...champs, ...(ancre ? { ancre } : {}) })}${ancre ? `#${ancre}` : ""}`);
  if (!UUID.test(piece)) return retour({ erreur: "Pièce inconnue." });
  const sb = await clientSession();

  let ids: string[];
  if (geste === "prevenue") {
    ids = texte("ids").split(",").map((x) => x.trim()).filter((x) => UUID.test(x));
  } else if (geste === "annulee") {
    const { data } = await sb.from("alertes_retour").select("id")
      .eq("boutique_id", boutique.boutique_id).eq("variante_id", piece).in("statut", ["attend", "a_prevenir"]);
    ids = (data ?? []).map((x: { id: string }) => x.id);
  } else {
    return retour({ erreur: "Geste inconnu." });
  }
  if (ids.length === 0) return retour({ erreur: "Ces demandes ont déjà été traitées par un collègue." }, `piece-${piece}`);

  const { data, error } = await sb.rpc("gestion_clore_alertes", { p_boutique_id: boutique.boutique_id, p_ids: ids, p_issue: geste });
  if (error) return retour({ erreur: messageReassort(error.hint, error.message) }, `piece-${piece}`);
  const n = data as number;
  const ok = geste === "prevenue"
    ? n > 1 ? `${n} personnes prévenues : leurs contacts sont effacés.` : "Prévenue : son contact est effacé."
    : `Demandes closes : ${n > 1 ? `${n} contacts effacés` : "un contact effacé"}.`;
  return retour({ ok }, `piece-${piece}`);
}
