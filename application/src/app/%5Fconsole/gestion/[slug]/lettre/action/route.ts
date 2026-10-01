import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { messageLettre } from "@/lib/gestion/lettre";

/* ============================================================================
   RETIRER UNE ADRESSE DE LA LETTRE — à la demande de la personne (au
   téléphone, en boutique) : public.gestion_lettre_retirer l'efface, comme
   une désinscription. Formulaire HTML ordinaire, réponse par une
   redirection 303 vers l'écran.
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
  const id = String(f.get("id") ?? "").trim();
  const q = String(f.get("q") ?? "").trim().slice(0, 80);
  const retour = (champs: Record<string, string>) =>
    vers(`/gestion/${slug}/lettre?${new URLSearchParams({ ...(q ? { q } : {}), ...champs })}`);
  if (!UUID.test(id)) return retour({ erreur: "Adresse inconnue." });

  const sb = await clientSession();
  const { error } = await sb.rpc("gestion_lettre_retirer", { p_boutique_id: boutique.boutique_id, p_id: id });
  if (error) return retour({ erreur: messageLettre(error.hint, error.message) });
  return retour({ ok: "Adresse retirée et effacée : elle ne recevra plus la lettre." });
}
