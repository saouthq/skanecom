import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { cheminEquipeBoutique } from "@/lib/gestion/equipe";

/* Le propriétaire règle la double authentification du propriétaire et de
   l'administrateur de sa boutique : proposée (par défaut) ou exigée. La
   base vérifie qu'il est propriétaire, et qu'il a la sienne avant de
   l'exiger (sinon il s'enfermerait dehors) ; tracé. */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug } = await params;
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  // Le message s'affiche dans la carte du réglage (carte=double-auth).
  const retour = (m: { ok: string } | { erreur: string; la_votre?: string }) =>
    vers(`${cheminEquipeBoutique(slug)}?${new URLSearchParams({ ...m, carte: "double-auth" })}#double-auth`);
  const obligatoire = (await req.formData()).get("obligatoire") === "1";
  const { error } = await (await clientSession()).rpc("gestion_exiger_double_auth", { p_boutique_id: boutique.boutique_id, p_obligatoire: obligatoire });
  if (error) {
    const message = error.hint === "la_votre" || error.code === "42501" ? error.message : "Le réglage n'a pas pu être enregistré : réessayez.";
    // Sans la sienne : la carte mène à « Mon compte », où il l'active.
    return retour(error.hint === "la_votre" ? { erreur: message, la_votre: "1" } : { erreur: message });
  }
  const ok = obligatoire
    ? "Exigée : le propriétaire et l'administrateur se connecteront avec leur code."
    : "Proposée : chacun peut la reporter, et l'activer depuis « Mon compte ».";
  return retour({ ok });
}
