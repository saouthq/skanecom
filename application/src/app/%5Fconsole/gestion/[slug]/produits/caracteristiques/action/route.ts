import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { slug as versSlug } from "@/lib/console/import";
import { messageCatalogue } from "@/lib/gestion/catalogue";

/* ============================================================================
   LES CARACTÉRISTIQUES (B9) — créer, modifier, ranger, retirer. Formulaires
   ordinaires, réponse par une redirection vers la page ; la base revérifie
   le rôle et chaque valeur (…_catalogue_attributs.sql).
   ========================================================================== */

export const dynamic = "force-dynamic";

// Les autres refus de la base sont déjà dits pour l'utilisateur.
const MESSAGES: Record<string, string> = {
  attribut: "Cette caractéristique n'existe plus : rechargez la page.",
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
  const texte = (cle: string) => String(f.get(cle) ?? "").trim();
  const page = `/gestion/${slug}/produits/caracteristiques`;
  const retour = (m: string, ok = false, ancre = "") => vers(`${page}?${new URLSearchParams(ok ? { ok: m } : { erreur: m })}${ancre}`);
  const b = boutique.boutique_id;
  const sb = await clientSession();
  const id = texte("id") || null;

  switch (texte("action")) {
    case "enregistrer": {
      const label = texte("label");
      // La clé du filtre dans l'adresse : [a-z0-9_], fixée à la création.
      const cle = versSlug(label, 40).replace(/-/g, "_");
      const { error } = await sb.rpc("gestion_enregistrer_attribut", {
        p_boutique_id: b, p_id: id, p_cle: id ? null : cle, p_label: label, p_unite: texte("unite") || null,
        p_type: texte("type") || "texte", p_filtrable: f.get("filtrable") === "1", p_en_carte: f.get("en_carte") === "1",
        p_rayons: f.getAll("rayons").map(String).filter(Boolean),
      });
      if (error) return retour(MESSAGES[error.hint ?? ""] ?? messageCatalogue(error.hint, error.message));
      return retour(id ? `« ${label} » enregistrée.` : `« ${label} » ajoutée : saisissez sa valeur sur la fiche des produits de ses rayons.`, true, `#attr-${cle}`);
    }
    case "deplacer": {
      const { error } = await sb.rpc("gestion_deplacer_attribut", { p_boutique_id: b, p_id: id, p_sens: Number(texte("sens")) || 0 });
      if (error) return retour(MESSAGES[error.hint ?? ""] ?? messageCatalogue(error.hint, error.message));
      return retour("Ordre enregistré.", true);
    }
    case "retirer": {
      const { data, error } = await sb.rpc("gestion_retirer_attribut", { p_boutique_id: b, p_id: id });
      if (error) return retour(MESSAGES[error.hint ?? ""] ?? messageCatalogue(error.hint, error.message));
      const n = Number(data ?? 0);
      return retour(n ? `Caractéristique retirée, et sa valeur de ${n} produit${n > 1 ? "s" : ""}.` : "Caractéristique retirée.", true);
    }
    default:
      return retour("Geste inconnu.");
  }
}
