import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { messageCatalogue } from "@/lib/gestion/catalogue";
import { POIDS_MAX, deposerFichier, retirerFichier, typeImage } from "@/lib/gestion/fichiers";

/* ============================================================================
   LES PHOTOS D'UN PRODUIT — ajouter (formulaire multipart ; le navigateur
   les a d'ordinaire réduites, voir DepotPhotos), légender, déplacer,
   retirer. Réponse par une redirection 303 vers la fiche, à la hauteur des
   photos. Le fichier est déposé AVANT d'être inscrit en base ; si la base le
   refuse, il est retiré aussitôt.
   ========================================================================== */

export const dynamic = "force-dynamic";

const ENVOI_MAX = 40 * 1024 * 1024;

/** Un nom de fichier que personne n'a déjà : 12 caractères au hasard. */
function nomAuHasard(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug, id } = await params;
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const fiche = `/gestion/${slug}/produits/${id}`;
  const retour = (m: string, ok = false) => vers(`${fiche}?${new URLSearchParams(ok ? { ok: m } : { erreur: m })}#t-photos`);
  if (!/^[0-9a-f-]{36}$/.test(id)) return versAvecErreur(fiche, "Produit introuvable.");

  // Tout l'envoi est lu en mémoire : on refuse d'emblée un envoi démesuré
  // (le navigateur réduit d'ordinaire chaque photo à quelques centaines de Ko).
  if (Number(req.headers.get("content-length") ?? 0) > ENVOI_MAX) {
    return retour("Envoi trop lourd : 40 Mo au plus à la fois. Envoyez les photos en plusieurs fois.");
  }
  let f: FormData;
  try {
    f = await req.formData();
  } catch {
    return retour("Envoi illisible : recommencez.");
  }
  const texte = (cle: string) => String(f.get(cle) ?? "").trim();
  const b = boutique.boutique_id;
  const sb = await clientSession();

  switch (texte("action")) {
    case "ajouter": {
      const fichiers = f.getAll("photos").filter((x): x is File => typeof x !== "string" && x.size > 0);
      if (fichiers.length === 0) return retour("Choisissez au moins une photo.");
      let ajoutees = 0;
      for (const fichier of fichiers) {
        if (fichier.size > POIDS_MAX) return retour(`« ${fichier.name} » pèse plus de 10 Mo.${ajoutees ? ` ${ajoutees} photo(s) ajoutée(s) avant elle.` : ""}`);
        const corps = await fichier.arrayBuffer();
        const genre = typeImage(new Uint8Array(corps, 0, Math.min(16, corps.byteLength)));
        if (!genre) return retour(`« ${fichier.name} » n'est pas une photo JPEG, PNG ou WebP.${ajoutees ? ` ${ajoutees} photo(s) ajoutée(s) avant elle.` : ""}`);

        const chemin = `${slug}/produits/${id}/${nomAuHasard()}.${genre.extension}`;
        try {
          await deposerFichier(chemin, corps, genre.type);
        } catch (e) {
          console.error("photos : dépôt en échec", e);
          return retour("Le dépôt de la photo a échoué : recommencez dans un instant.");
        }
        const { error } = await sb.rpc("gestion_ajouter_photo", { p_boutique_id: b, p_produit_id: id, p_chemin: chemin, p_alt: null });
        if (error) {
          await retirerFichier(chemin).catch(() => {});
          const deja = ajoutees ? ` ${ajoutees} photo(s) ajoutée(s) avant.` : "";
          return retour(messageCatalogue(error.hint, error.message) + deja);
        }
        ajoutees += 1;
      }
      return retour(ajoutees > 1 ? `${ajoutees} photos ajoutées.` : "Photo ajoutée.", true);
    }

    case "modifier": {
      const { error } = await sb.rpc("gestion_modifier_photo", {
        p_boutique_id: b, p_image_id: texte("image_id"), p_alt: texte("alt"), p_variante_id: texte("variante_id") || null,
      });
      if (error) return retour(messageCatalogue(error.hint, error.message));
      return retour("Photo enregistrée.", true);
    }

    case "deplacer": {
      const { error } = await sb.rpc("gestion_deplacer_photo", { p_boutique_id: b, p_image_id: texte("image_id"), p_vers: texte("vers") });
      if (error) return retour(messageCatalogue(error.hint, error.message));
      return retour(texte("vers") === "premiere" ? "Photo mise en premier : c'est elle que montrent les listes." : "Ordre des photos enregistré.", true);
    }

    case "retirer": {
      const { data, error } = await sb.rpc("gestion_retirer_photo", { p_boutique_id: b, p_image_id: texte("image_id") });
      if (error) return retour(messageCatalogue(error.hint, error.message));
      const r = data as { chemin: string; orphelin: boolean };
      if (r.orphelin && r.chemin.startsWith(`${slug}/produits/`)) {
        await retirerFichier(r.chemin).catch((e) => console.error("photos : retrait du fichier en échec", r.chemin, e));
      }
      return retour("Photo retirée.", true);
    }

    default:
      return retour("Geste inconnu.");
  }
}
