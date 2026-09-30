import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { millimes } from "@/lib/console/import";
import { formateMontant } from "@/lib/prix";
import { messageDevis } from "@/lib/gestion/devis";

/* ============================================================================
   LES GESTES SUR UN DEVIS — chiffrer (brouillon ou envoi) et annuler.
   Formulaires HTML ordinaires, réponse par une redirection 303 vers la
   fiche. La base revérifie le rôle, l'étape et la version
   (…_devis.sql).
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; numero: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug, numero } = await params;
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });
  if (!/^DEV-\d{5,}$/.test(numero)) return new Response("Devis introuvable", { status: 404 });

  const fiche = `/gestion/${slug}/devis/${numero}`;
  const retour = (m: string, ok = false) => vers(`${fiche}?${new URLSearchParams(ok ? { ok: m } : { erreur: m })}#chiffrage`);
  const f = await req.formData();
  const texte = (cle: string) => String(f.get(cle) ?? "").trim();
  const sb = await clientSession();

  switch (texte("action")) {
    case "chiffrer": {
      const prix: Record<string, number> = {};
      for (const [cle, valeur] of f.entries()) {
        if (!cle.startsWith("prix:")) continue;
        const m = millimes(String(valeur));
        if (m === null || Number.isNaN(m)) return retour("Un prix est illisible : écrivez par exemple 170,000.");
        prix[cle.slice(5)] = m;
      }
      const mode = texte("frais_mode");
      let frais: number | null = null;
      if (mode === "offerte") frais = 0;
      else if (mode === "montant") {
        const m = millimes(texte("frais"));
        if (m === null || Number.isNaN(m)) return retour("Frais de livraison illisibles : écrivez par exemple 15,000, ou choisissez « Offerte ».");
        frais = m;
      }
      const envoyer = texte("envoyer") === "1";
      const { error } = await sb.rpc("gestion_chiffrer_devis", {
        p_boutique_id: boutique.boutique_id, p_numero: numero, p_prix: prix, p_frais: frais,
        p_validite_jours: Number.parseInt(texte("validite"), 10) || 15, p_note: texte("note") || null,
        p_envoyer: envoyer, p_version: texte("version") || null,
      });
      if (error) return retour(messageDevis(error.hint, error.message));
      return retour(
        envoyer
          ? "Devis envoyé : le client le voit dans « Mes commandes ». Prévenez-le par WhatsApp, le message est prêt."
          : `Brouillon enregistré : le client ne voit rien tant que le devis n'est pas envoyé${frais ? ` (livraison ${formateMontant(frais)} TND)` : ""}.`,
        true,
      );
    }

    case "annuler": {
      const { error } = await sb.rpc("gestion_annuler_devis", { p_boutique_id: boutique.boutique_id, p_numero: numero, p_motif: texte("motif") });
      if (error) return retour(messageDevis(error.hint, error.message));
      return retour("Devis annulé : le client lira votre motif dans son compte.", true);
    }

    default:
      return retour("Geste inconnu.");
  }
}
