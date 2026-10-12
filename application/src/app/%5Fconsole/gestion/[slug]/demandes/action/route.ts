import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";

/* ============================================================================
   LES GESTES SUR UNE DEMANDE DE CONTACT — formulaires ordinaires, réponse
   par une redirection vers la liste, sur la carte de la demande. La base
   revérifie le rôle et l'étape affichée (gestion_avancer_demande,
   gestion_retirer_demande), avec la session du membre.
   ========================================================================== */

export const dynamic = "force-dynamic";

const VERS: Record<string, string | null> = { prendre: "en_cours", traiter: "traitee", rouvrir: "en_cours", noter: null };
const FAIT: Record<string, string> = {
  prendre: "Vous vous en occupez : la demande passe en cours.",
  traiter: "Demande traitée.",
  rouvrir: "Demande rouverte : elle reprend en cours.",
  noter: "Note enregistrée.",
};
const ETAPES = new Set(["nouvelles", "en_cours", "traitees"]);

function messageDemande(hint: string | undefined, message: string): string {
  switch (hint) {
    case "role": return "Votre rôle ne permet pas ce geste.";
    case "etape": return message.startsWith("La demande a changé") ? message : "Cette demande a changé entre-temps : elle est à jour ci-dessous.";
    case "demande": return "Cette demande n'existe plus : rechargez la page.";
    case "note": return message;
    default: return message;
  }
}

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
  const numero = texte("numero");
  const statut = texte("statut");
  const geste = texte("geste");
  const etape = ETAPES.has(texte("etape")) ? texte("etape") : "nouvelles";
  const carte = `demande-${numero}`;
  // La liste de l'étape montrée, à la hauteur de la carte (ou en tête si elle a quitté l'étape).
  const retour = (m: string, ok: boolean, surCarte: boolean) =>
    vers(`/gestion/${slug}/demandes?${new URLSearchParams({ etape, ...(ok ? { ok: m } : { erreur: m }), ...(surCarte ? { carte, ancre: carte } : {}) })}${surCarte ? `#${carte}` : ""}`);

  const sb = await clientSession();
  if (geste === "retirer") {
    const { error } = await sb.rpc("gestion_retirer_demande", { p_boutique_id: boutique.boutique_id, p_numero: numero });
    if (error) return retour(messageDemande(error.hint, error.message), false, true);
    return retour(`Demande ${numero} effacée.`, true, false);
  }
  if (!(geste in VERS) || !numero || !statut) return retour("Geste inconnu.", false, true);
  const { error } = await sb.rpc("gestion_avancer_demande", {
    p_boutique_id: boutique.boutique_id,
    p_numero: numero,
    p_statut_affiche: statut,
    p_vers: VERS[geste] ?? statut,
    p_note: geste === "noter" ? texte("note") : null,
  });
  if (error) return retour(messageDemande(error.hint, error.message), false, true);
  // Une demande qui change d'étape quitte la liste montrée : le message vient en tête.
  return retour(`${numero} · ${FAIT[geste]}`, true, geste === "noter");
}
