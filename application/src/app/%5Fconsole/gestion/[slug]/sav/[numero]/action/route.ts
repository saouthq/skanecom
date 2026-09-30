import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { erreurSav } from "@/lib/gestion/sav";

/* ============================================================================
   LES GESTES SUR UNE DEMANDE DE SAV — formulaires HTML ordinaires, réponse
   par une redirection 303 vers la fiche. La base revérifie le rôle et
   l'étape affichée (…_sav.sql, gestion_avancer_sav), avec la session du
   membre, jamais avec la clé de service.
   ========================================================================== */

export const dynamic = "force-dynamic";

const VERS: Record<string, string | null> = {
  prendre: "en_cours",
  resoudre: "resolue",
  refuser: "refusee",
  rouvrir: "en_cours",
  noter: null, // l'étape actuelle : une note, sans changer d'étape
};

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; numero: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug, numero } = await params;
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const f = await req.formData();
  const texte = (cle: string) => String(f.get(cle) ?? "").trim() || null;
  const fiche = `/gestion/${slug}/sav/${encodeURIComponent(numero)}`;
  const geste = texte("geste") ?? "";
  const statut = texte("statut");
  if (!(geste in VERS) || !statut) return versAvecErreur(fiche, "Geste inconnu.");

  const sb = await clientSession();
  const { error } = await sb.rpc("gestion_avancer_sav", {
    p_boutique_id: boutique.boutique_id,
    p_numero: numero,
    p_statut_affiche: statut,
    p_vers: VERS[geste] ?? statut,
    p_issue: texte("issue"),
    p_note: texte("note"),
  });
  if (error) return versAvecErreur(fiche, erreurSav(error.hint, error.message));
  return vers(`${fiche}?fait=${geste}`);
}
