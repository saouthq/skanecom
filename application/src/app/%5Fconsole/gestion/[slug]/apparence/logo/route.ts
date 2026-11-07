import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine } from "@/lib/console/http";
import { REGLES, defautImage } from "@/lib/console/images-marque";
import { POIDS_MAX, deposerFichier, dimensionsImage, retirerFichier, typeImage } from "@/lib/gestion/fichiers";
import { PEUT_ECRIRE } from "@/lib/gestion/pages";
import { rafraichirVitrine } from "@/lib/console/vitrine-cache";

/* ============================================================================
   LE LOGO, DEPUIS L'ÉDITEUR DE LA VITRINE — le propriétaire et
   l'administrateur posent, changent ou retirent le logo de leur boutique, son
   monogramme et son icône d'onglet (migration …_logo_commercant). Un geste à
   la fois (`geste` = « deposer:logo », « retirer:favicon », « mode:logo »),
   réponse en JSON : les images à jour et la nouvelle version du thème, que
   l'éditeur garde pour publier ensuite.

   Le navigateur a préparé le fichier (un SVG converti en PNG, les marges
   vides ôtées : ImagesMarque) ; il est revérifié ici — son type d'après ses
   premiers octets, ses dimensions, les règles de l'emplacement —, déposé
   sous `<boutique>/marque/`, puis inscrit au thème ; refusé par la base, il
   est retiré aussitôt. Ce que le thème n'emploie plus quitte le dépôt.
   ========================================================================== */

export const dynamic = "force-dynamic";

const ENVOI_MAX = 12 * 1024 * 1024;
const PERMIS = ["logo", "monogramme", "favicon"] as const;
type Permis = (typeof PERMIS)[number];

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug } = await params;
  const reponse = (ok: boolean, message: string, extra: Record<string, unknown> = {}, status = 200) =>
    Response.json({ ok, message, ...extra }, { status, headers: { "cache-control": "no-store" } });
  if (Number(req.headers.get("content-length") ?? 0) > ENVOI_MAX) return reponse(false, "Envoi trop lourd : 10 Mo au plus par image.");

  const a = await accesEquipe();
  if (a.etat !== "ok") return reponse(false, "Votre session a expiré : reconnectez-vous, puis recommencez.", {}, 401);
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });
  if (!PEUT_ECRIRE.includes(boutique.role)) return reponse(false, "Seuls le propriétaire et l'administrateur posent le logo.", {}, 403);

  const formulaire = await req.formData();
  const [geste, e] = String(formulaire.get("geste") ?? "").split(":") as [string, Permis];
  if (!PERMIS.includes(e)) return reponse(false, "Emplacement d'image inconnu.");
  const regle = REGLES[e];

  let image: Record<string, unknown>;
  let depose: string | null = null;
  let fait: string;
  switch (geste) {
    case "deposer": {
      const fichier = formulaire.get(`fichier.${e}`);
      if (!fichier || typeof fichier === "string" || fichier.size === 0) return reponse(false, "Choisissez une image.");
      if (fichier.size > POIDS_MAX) return reponse(false, `« ${fichier.name} » pèse plus de 10 Mo.`);
      const corps = await fichier.arrayBuffer();
      const octets = new Uint8Array(corps);
      const genre = typeImage(octets);
      if (!genre) return reponse(false, `« ${fichier.name} » n'est pas une image PNG, JPEG ou WebP.`);
      if (e === "monogramme" && genre.type === "image/jpeg") {
        return reponse(false, "Le monogramme sert de filigrane : il lui faut un fond transparent (PNG ou SVG), ce qu'un JPEG n'a jamais.");
      }
      const dimensions = dimensionsImage(octets);
      if (!dimensions) return reponse(false, `« ${fichier.name} » est illisible.`);
      const defaut = defautImage(e, dimensions.largeur, dimensions.hauteur);
      if (defaut) return reponse(false, defaut);
      depose = `${slug}/marque/${e}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}.${genre.extension}`;
      try {
        await deposerFichier(depose, corps, genre.type);
      } catch (err) {
        console.error("logo : dépôt en échec", err);
        return reponse(false, "Le dépôt de l'image a échoué : recommencez dans un instant.");
      }
      image = { chemin: depose };
      if (e === "logo") {
        image.ratio = Math.round((dimensions.largeur / dimensions.hauteur) * 1000) / 1000;
        const mode = formulaire.get("logo_mode");
        if (mode === "masque" || mode === "image") image.mode = mode;
      }
      fait = regle.fait;
      break;
    }
    case "retirer":
      image = { chemin: null };
      fait = `${regle.titre} retiré${e === "favicon" ? "e" : ""}`;
      break;
    case "mode": {
      const mode = formulaire.get("logo_mode");
      if (e !== "logo" || (mode !== "masque" && mode !== "image")) return reponse(false, "Mode d'affichage inconnu.");
      image = { mode };
      fait = mode === "image" ? "Logo affiché avec ses couleurs" : "Logo affiché en monochrome";
      break;
    }
    default:
      return reponse(false, "Geste inconnu.");
  }

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_image_marque", {
    p_boutique_id: boutique.boutique_id,
    p_version: Number(formulaire.get("version") ?? 0),
    p_emplacement: e,
    p_image: image,
  });
  if (error) {
    if (depose) await retirerFichier(depose).catch(() => {});
    const texte = error.hint === "version"
      ? "L'apparence a changé entre-temps (un collègue, la console) : rechargez la page, puis recommencez."
      : error.hint === "role" ? "Seuls le propriétaire et l'administrateur posent le logo." : error.message;
    return reponse(false, texte);
  }
  const rendu = data as { version: number; logo: { chemin: string; ratio: number; mode: string } | null; monogramme: string | null; favicon: string | null; orphelins: string[] };
  for (const chemin of rendu.orphelins ?? []) {
    if (chemin.startsWith(`${slug}/marque/`)) await retirerFichier(chemin).catch((err) => console.error("logo : retrait du fichier en échec", chemin, err));
  }
  rafraichirVitrine(slug);
  return reponse(true, `${fait}.`, {
    images: {
      version: rendu.version,
      logo: rendu.logo ? { chemin: rendu.logo.chemin, ratio: Number(rendu.logo.ratio) || 5, mode: rendu.logo.mode === "image" ? "image" : "masque" } : null,
      monogramme: rendu.monogramme,
      favicon: rendu.favicon,
      ouverture: null,
      recit: null,
    },
  });
}
