import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { LIBELLES_CONFIANCE, messageClients, type Confiance } from "@/lib/gestion/clients";

/* ============================================================================
   LES GESTES SUR UN CLIENT — sa confiance (normal, surveillé, bloqué, avec
   un motif) et la note de l'équipe. Formulaires HTML ordinaires, réponse par
   une redirection 303 vers la fiche. La base revérifie le rôle
   (…_gestion_clients.sql).
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug, id } = await params;
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const fiche = `/gestion/${slug}/clients/${id}`;
  const retour = (ancre: string) => (m: string, ok = false) =>
    vers(`${fiche}?${new URLSearchParams(ok ? { ok: m } : { erreur: m })}#${ancre}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) return retour("t-confiance")("Client introuvable.");

  const f = await req.formData();
  const texte = (cle: string) => String(f.get(cle) ?? "").trim();
  const sb = await clientSession();

  switch (texte("action")) {
    case "confiance": {
      const r = retour("t-confiance");
      const niveau = texte("niveau") as Confiance;
      const { error } = await sb.rpc("gestion_confiance_client", {
        p_boutique_id: boutique.boutique_id, p_client_id: id, p_niveau: niveau, p_motif: texte("motif") || null,
      });
      if (error) return r(messageClients(error.hint, error.message));
      const effet =
        niveau === "bloque" ? "Client bloqué : la boutique en ligne refuse désormais ses commandes."
        : niveau === "surveille" ? "Client surveillé : ses commandes s'afficheront signalées."
        : `Client ${LIBELLES_CONFIANCE.normal.toLowerCase()} : ses commandes suivent le chemin habituel.`;
      return r(effet, true);
    }

    case "note": {
      const r = retour("t-note");
      const { error } = await sb.rpc("gestion_note_client", { p_boutique_id: boutique.boutique_id, p_client_id: id, p_note: texte("note") });
      if (error) return r(messageClients(error.hint, error.message));
      return r("Note enregistrée.", true);
    }

    default:
      return retour("t-confiance")("Geste inconnu.");
  }
}
