import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { FILTRES_AVIS, messageAvis } from "@/lib/gestion/avis";
import { retirerFichier } from "@/lib/gestion/fichiers";

/* ============================================================================
   LES GESTES SUR UN AVIS — publier, écarter (avec un motif), répondre,
   retirer une photo jointe (l'avis reste ; le fichier quitte le dépôt).
   Formulaires HTML ordinaires, réponse par une redirection 303 vers la
   liste, sur le même onglet. La base revérifie le rôle et l'état
   (…_avis.sql).
   ========================================================================== */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const REUSSITES: Record<string, string> = {
  publier: "Avis publié : il paraît sur la fiche du produit d'ici cinq minutes.",
  ecarter: "Avis écarté : la vitrine ne le montre plus d'ici cinq minutes ; le motif reste ici.",
  repondre: "Réponse enregistrée : elle paraît sous l'avis, sur la fiche du produit, d'ici cinq minutes.",
  retirer_photo: "Photo retirée : l'avis reste, sans elle ; la fiche suit d'ici cinq minutes.",
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
  const filtre = FILTRES_AVIS.find((x) => x.cle === texte("filtre"))?.cle ?? "a_moderer";
  const avis = texte("avis");
  const geste = texte("geste");
  const retour = (m: string, ok = false, ancre = "") =>
    vers(`/gestion/${slug}/avis?${new URLSearchParams({ filtre, ...(ok ? { ok: m } : { erreur: m }) })}${ancre}`);
  if (!UUID.test(avis) || !(geste in REUSSITES)) return retour("Geste inconnu.");

  const sb = await clientSession();
  if (geste === "retirer_photo") {
    const photo = texte("photo");
    if (!UUID.test(photo)) return retour("Photo introuvable.", false, `#avis-${avis}`);
    const { data, error } = await sb.rpc("gestion_retirer_photo_avis", { p_boutique_id: boutique.boutique_id, p_photo_id: photo });
    if (error) return retour(messageAvis(error.hint, error.message), false, `#avis-${avis}`);
    // Seuls les fichiers déposés par un client (<boutique>/avis/<avis>/…) : jamais une photo du jeu de démo ni du catalogue.
    const chemin = (data as { chemin: string }).chemin;
    if (new RegExp(`^${slug}/avis/[0-9a-f-]{36}/[a-z0-9]+\\.(jpg|png|webp)$`).test(chemin)) {
      await retirerFichier(chemin).catch((e) => console.error("avis : retrait du fichier en échec", chemin, e));
    }
    return retour(REUSSITES.retirer_photo, true, `#avis-${avis}`);
  }
  const { error } = await sb.rpc("gestion_moderer_avis", {
    p_boutique_id: boutique.boutique_id, p_avis_id: avis, p_geste: geste, p_texte: texte("texte") || null,
  });
  if (error) return retour(messageAvis(error.hint, error.message), false, `#avis-${avis}`);
  // Répondre laisse l'avis dans son onglet : on y revient, sur lui.
  return retour(REUSSITES[geste], true, geste === "repondre" ? `#avis-${avis}` : "");
}
