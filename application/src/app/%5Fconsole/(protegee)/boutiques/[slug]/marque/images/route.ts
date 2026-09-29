import { clientService } from "@/lib/console/service";
import { ecriture, memeOrigine, messageBase, vers } from "@/lib/console/http";
import { EMPLACEMENTS, REGLES, defautImage, imagesDuTheme, type Emplacement } from "@/lib/console/images-marque";
import { POIDS_MAX, deposerFichier, dimensionsImage, retirerFichier, typeImage } from "@/lib/gestion/fichiers";
import { definitionDe, gabaritDe } from "@/lib/theme";

/* ============================================================================
   LE LOGO ET LES IMAGES DE LA MARQUE — déposer, retirer, décrire, et le mode
   d'affichage du logo. Un geste à la fois (`geste` = « deposer:logo »…).

   Depuis l'éditeur de marque (fetch, `accept: application/json`) : réponse
   JSON avec les images à jour et la nouvelle version du thème, que l'écran
   garde pour la suite. Sans script (boutons du formulaire de marque) :
   redirection 303 vers la page, avec son message.

   Le fichier est vérifié ici (type d'après ses premiers octets, dimensions
   lues dans son en-tête, règles de l'emplacement), déposé sous
   `<boutique>/marque/`, puis inscrit en base (public.console_image_marque) ;
   refusé par la base, il est retiré aussitôt. Ce que le thème n'emploie
   plus quitte le dépôt.
   ========================================================================== */

export const dynamic = "force-dynamic";

const ENVOI_MAX = 12 * 1024 * 1024;

function nomAuHasard(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const enJson = (req.headers.get("accept") ?? "").includes("application/json");
  const page = `/boutiques/${slug}/marque`;
  const reponse = (ok: boolean, message: string, extra: Record<string, unknown> = {}) =>
    enJson
      ? Response.json({ ok, message, ...extra }, { headers: { "cache-control": "no-store" } })
      : vers(`${page}?${new URLSearchParams(ok ? { ok: message } : { erreur: message })}#t-images`);

  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > ENVOI_MAX) {
    return reponse(false, "Envoi trop lourd : 10 Mo au plus par image.");
  }

  return ecriture(req, async ({ user, formulaire, ip }) => {
    const service = clientService(ip);
    const { data: fiche, error: lecture } = await service.rpc("console_boutique", { p_slug: slug });
    if (lecture || !fiche?.theme) return reponse(false, messageBase(lecture));

    const [geste, e] = String(formulaire.get("geste") ?? "").split(":") as [string, Emplacement];
    if (!EMPLACEMENTS.includes(e)) return reponse(false, "Emplacement d'image inconnu.");
    const regle = REGLES[e];
    const sectionsGabarit = e === "logo" || e === "monogramme" || e === "favicon" ? null : definitionDe(gabaritDe(fiche.theme.code)).sections;

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
        if (!genre) {
          return reponse(false, `« ${fichier.name} » n'est pas une image PNG, JPEG ou WebP.${regle.genre === "trace" ? " Un SVG se convertit dans le navigateur : rechargez la page." : ""}`);
        }
        if (e === "monogramme" && genre.type === "image/jpeg") {
          return reponse(false, "Le monogramme sert de filigrane : il lui faut un fond transparent (PNG ou SVG), ce qu'un JPEG n'a jamais.");
        }
        const dimensions = dimensionsImage(octets);
        if (!dimensions) return reponse(false, `« ${fichier.name} » est illisible.`);
        const defaut = defautImage(e, dimensions.largeur, dimensions.hauteur);
        if (defaut) return reponse(false, defaut);

        depose = `${slug}/marque/${e.replace("_", "-")}-${nomAuHasard()}.${genre.extension}`;
        try {
          await deposerFichier(depose, corps, genre.type);
        } catch (err) {
          console.error("marque : dépôt en échec", err);
          return reponse(false, "Le dépôt de l'image a échoué : recommencez dans un instant.");
        }
        image = { chemin: depose };
        if (e === "logo") {
          image.ratio = Math.round((dimensions.largeur / dimensions.hauteur) * 1000) / 1000;
          // Un logo sans transparence (le navigateur l'a vu) : en monochrome, ce
          // serait un rectangle plein ; il s'affiche avec ses couleurs.
          const mode = formulaire.get("logo_mode");
          if (mode === "masque" || mode === "image") image.mode = mode;
        }
        fait = regle.fait;
        break;
      }
      case "retirer":
        image = { chemin: null };
        fait = `${regle.titre} retiré${e === "ouverture" || e === "recit" || e === "favicon" ? "e" : ""}`;
        break;
      case "mode": {
        const mode = formulaire.get("logo_mode");
        if (e !== "logo" || (mode !== "masque" && mode !== "image")) return reponse(false, "Mode d'affichage inconnu.");
        image = { mode };
        fait = mode === "image" ? "Logo affiché avec ses couleurs" : "Logo affiché en monochrome";
        break;
      }
      case "legender":
        image = { alt: String(formulaire.get(`alt.${e}`) ?? "").trim() };
        fait = "Description enregistrée";
        break;
      default:
        return reponse(false, "Geste inconnu.");
    }

    const { data, error } = await service.rpc("console_image_marque", {
      p_acteur: user.id,
      p_boutique_id: fiche.boutique.id,
      p_version: Number(formulaire.get("version") ?? 0),
      p_emplacement: e,
      p_image: image,
      p_sections_gabarit: sectionsGabarit,
    });
    if (error) {
      if (depose) await retirerFichier(depose).catch(() => {});
      return reponse(false, error.hint && error.hint !== "version" ? (error.message ?? messageBase(error)) : messageBase(error));
    }
    const { orphelins } = data as { version: number; orphelins: string[] };
    for (const chemin of orphelins) {
      if (chemin.startsWith(`${slug}/marque/`)) {
        await retirerFichier(chemin).catch((err) => console.error("marque : retrait du fichier en échec", chemin, err));
      }
    }

    if (!enJson) return reponse(true, `${fait}.`);
    const { data: apres } = await service.rpc("console_boutique", { p_slug: slug });
    return reponse(true, `${fait}.`, { images: apres?.theme ? imagesDuTheme(apres.theme) : null });
  });
}
