import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { millimes } from "@/lib/console/import";
import { duMois, enTnd } from "@/lib/gestion/objectif";

/* ============================================================================
   FIXER L'OBJECTIF DU MOIS — ce mois-ci ou le suivant, en dinars (vide : pas
   d'objectif) : public.gestion_fixer_objectif, qui revérifie le rôle et
   trace le changement. Formulaire HTML ordinaire, réponse par une
   redirection 303 vers le tableau de bord, sur la carte.
   ========================================================================== */

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  role: "Seuls le propriétaire et l'administrateur fixent l'objectif.",
  mois: "Un objectif se fixe pour ce mois-ci ou le suivant.",
  montant: "Un objectif d'au moins 1 TND.",
};

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
  const mois = String(f.get("mois") ?? "");
  const retour = (champs: Record<string, string>) =>
    vers(`/gestion/${slug}/tableau?${new URLSearchParams({ ...champs, ancre: "objectif" })}#objectif`);
  if (!/^\d{4}-\d{2}-01$/.test(mois)) return retour({ erreur: MESSAGES.mois });
  const montant = millimes(String(f.get("montant") ?? ""));
  if (montant !== null && Number.isNaN(montant)) return retour({ erreur: "Montant illisible : écrivez par exemple 20000." });

  const sb = await clientSession();
  const { error } = await sb.rpc("gestion_fixer_objectif", { p_boutique_id: boutique.boutique_id, p_mois: mois, p_montant_millimes: montant });
  if (error) return retour({ erreur: (error.hint && MESSAGES[error.hint]) || error.message });
  return retour({
    ok: montant === null
      ? `Objectif ${duMois(mois)} retiré.`
      : `Objectif ${duMois(mois)} : ${enTnd(montant)}.`,
  });
}
