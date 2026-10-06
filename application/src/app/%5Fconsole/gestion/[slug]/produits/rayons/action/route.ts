import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { slug as versSlug } from "@/lib/console/import";
import { rafraichirVitrine } from "@/lib/console/vitrine-cache";
import { messageCatalogue } from "@/lib/gestion/catalogue";
import { POIDS_MAX, deposerFichier, retirerFichier, sansMetadonnees, typeImage } from "@/lib/gestion/fichiers";

/* ============================================================================
   LES RAYONS — créer, enregistrer la fiche (nom, adresse, description,
   parent, visible), ranger, poser ou retirer l'image, retirer le rayon.
   Formulaires ordinaires (l'image en multipart), réponse par une
   redirection vers la page, à la hauteur du rayon. La base revérifie le rôle
   et chaque valeur (…_rayons.sql) ; la vitrine suit aussitôt.
   ========================================================================== */

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  rayon: "Ce rayon n'existe plus : rechargez la page.",
  change: "Ce rayon a été modifié entre-temps par un collègue : il est à jour ci-dessous, vérifiez avant de recommencer.",
};

/** Un nom de fichier que personne n'a déjà : 12 caractères au hasard. */
function nomAuHasard(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
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
  const page = `/gestion/${slug}/produits/rayons`;
  // Le message s'affiche là où l'on a fait le geste (la ligne du rayon, la
  // carte « Nouveau rayon », la liste après un retrait), et la page y revient.
  const retour = (m: string, ok: boolean, carte: string) =>
    vers(`${page}?${new URLSearchParams({ ...(ok ? { ok: m } : { erreur: m }), carte, ancre: carte })}#${carte}`);
  const refus = (hint: string | undefined, message: string, carte: string) => retour(MESSAGES[hint ?? ""] ?? messageCatalogue(hint, message), false, carte);
  const b = boutique.boutique_id;
  const sb = await clientSession();
  const id = texte("id") || null;
  const ligne = id ? `rayon-${id}` : "rayons";

  switch (texte("action")) {
    case "creer": {
      const nom = texte("nom");
      const { data, error } = await sb.rpc("gestion_creer_rayon", {
        p_boutique_id: b, p_nom: nom, p_slug: versSlug(texte("slug") || nom, 80) || "rayon", p_parent_id: texte("parent_id") || null,
      });
      if (error) return refus(error.hint, error.message, "nouveau-rayon");
      rafraichirVitrine(slug);
      const cree = data as { id: string; slug: string };
      return retour(`Rayon « ${nom} » créé : rangez-y vos produits depuis leur fiche, ou donnez-lui une image.`, true, `rayon-${cree.id}`);
    }
    case "enregistrer": {
      const nom = texte("nom");
      const { error } = await sb.rpc("gestion_modifier_rayon", {
        p_boutique_id: b, p_rayon_id: id, p_version: texte("version") || null,
        p_champs: {
          nom, slug: versSlug(texte("slug") || nom, 80), description: texte("description"),
          parent_id: texte("parent_id"), actif: f.get("actif") === "1",
        },
      });
      if (error) return refus(error.hint, error.message, ligne);
      rafraichirVitrine(slug);
      return retour(`« ${nom} » enregistré : la vitrine suit aussitôt.`, true, ligne);
    }
    case "deplacer": {
      const { error } = await sb.rpc("gestion_deplacer_rayon", { p_boutique_id: b, p_rayon_id: id, p_sens: texte("sens") });
      if (error) return refus(error.hint, error.message, ligne);
      rafraichirVitrine(slug);
      return retour("Ordre enregistré : c'est celui du menu et de l'accueil.", true, ligne);
    }
    case "image": {
      const fichier = f.get("image");
      if (!(fichier instanceof File) || fichier.size === 0) return retour("Choisissez une image.", false, ligne);
      if (fichier.size > POIDS_MAX) return retour("Image trop lourde : 10 Mo au plus.", false, ligne);
      const octets = new Uint8Array(await fichier.arrayBuffer());
      const genre = typeImage(octets);
      if (!genre) return retour("Ce fichier n'est pas une image JPEG, PNG ou WebP.", false, ligne);
      const propre = sansMetadonnees(octets);
      const chemin = `${slug}/rayons/${id}/${nomAuHasard()}.${genre.extension}`;
      await deposerFichier(chemin, propre.buffer.slice(propre.byteOffset, propre.byteOffset + propre.byteLength) as ArrayBuffer, genre.type);
      const { data: ancien, error } = await sb.rpc("gestion_image_rayon", { p_boutique_id: b, p_rayon_id: id, p_chemin: chemin });
      if (error) {
        await retirerFichier(chemin).catch(() => {});
        return refus(error.hint, error.message, ligne);
      }
      if (typeof ancien === "string" && ancien) await retirerFichier(ancien).catch(() => {});
      rafraichirVitrine(slug);
      return retour("Image posée : elle habille le rayon dans le menu et à l'accueil.", true, ligne);
    }
    case "retirer_image": {
      const { data: ancien, error } = await sb.rpc("gestion_image_rayon", { p_boutique_id: b, p_rayon_id: id, p_chemin: null });
      if (error) return refus(error.hint, error.message, ligne);
      if (typeof ancien === "string" && ancien) await retirerFichier(ancien).catch(() => {});
      rafraichirVitrine(slug);
      return retour("Image retirée.", true, ligne);
    }
    case "retirer": {
      const { data, error } = await sb.rpc("gestion_retirer_rayon", { p_boutique_id: b, p_rayon_id: id, p_vers: texte("vers") || null });
      if (error) return refus(error.hint, error.message, ligne);
      const r = data as { produits: number; sous_rayons: number; image: string | null };
      if (r.image) await retirerFichier(r.image).catch(() => {});
      rafraichirVitrine(slug);
      const morceaux = [
        r.produits ? `${r.produits} produit${r.produits > 1 ? "s" : ""} déplacé${r.produits > 1 ? "s" : ""}` : null,
        r.sous_rayons ? `${r.sous_rayons} sous-rayon${r.sous_rayons > 1 ? "s" : ""} remonté${r.sous_rayons > 1 ? "s" : ""} d'un niveau` : null,
      ].filter(Boolean);
      const nom = texte("nom");
      return retour(`${nom ? `« ${nom} » retiré` : "Rayon retiré"}${morceaux.length ? ` : ${morceaux.join(", ")}` : ""}.`, true, "rayons");
    }
    default:
      return retour("Geste inconnu.", false, "rayons");
  }
}
