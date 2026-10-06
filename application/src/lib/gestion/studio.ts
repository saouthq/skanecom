import { urlFichier } from "@/lib/photos";
import { typeImage } from "./fichiers";

/* ============================================================================
   LE STUDIO PHOTO (module studio_photo) — une photo prise au téléphone, sur
   n'importe quel fond, devient une photo de catalogue.

   Cloudflare Images, par la liaison IMAGES du Worker (cloudflare.config.ts) :
     1. segment = foreground : l'objet est détouré (un modèle de Workers AI,
        BiRefNet) — le fond devient transparent ;
     2. il est posé, entier, au format des cartes (4:5, 1 200 × 1 500), sur le
        fond des cartes de la vitrine (le jeton surface_2 du thème) : la photo
        se fond dans la grille, quel que soit le fond d'origine ;
     3. en WebP.

   En local, la liaison est simulée par sharp (Miniflare) : le détourage n'y
   existe pas, la photo est seulement posée au format sur le fond — le geste
   entier se vérifie, pas le modèle.
   ========================================================================== */

/** Le format des photos du studio : celui des cartes (4:5). */
export const STUDIO = { largeur: 1200, hauteur: 1500 } as const;

type Transformation = Record<string, unknown>;
type Chaine = {
  transform(t: Transformation): Chaine;
  output(o: { format: string; quality?: number }): Promise<{ response(): Response }>;
};
type Images = { input(flux: ReadableStream<Uint8Array>): Chaine };

/** Une couleur #RRGGBB, ou le fond par défaut des cartes éditoriales. */
function fondSur(couleur: string | null | undefined): string {
  return couleur && /^#[0-9A-Fa-f]{6}$/.test(couleur) ? couleur : "#F2EEE8";
}

/** La photo `chemin` (déjà déposée), passée au studio : ses octets en WebP. */
export async function poserEnStudio(chemin: string, couleurFond: string | null | undefined): Promise<ArrayBuffer> {
  const { env } = await import("cloudflare:workers");
  const images = env.IMAGES as Images | undefined;
  if (!images) throw new Error("Studio photo : la liaison IMAGES manque au Worker (cloudflare.config.ts)");

  const source = await fetch(urlFichier(chemin));
  if (!source.ok || !source.body) throw new Error(`Studio photo : la photo d'origine est introuvable (${source.status})`);

  const sortie = await images
    .input(source.body)
    .transform({ segment: "foreground" })
    .transform({ width: STUDIO.largeur, height: STUDIO.hauteur, fit: "pad", background: fondSur(couleurFond) })
    .output({ format: "image/webp", quality: 88 });
  const corps = await sortie.response().arrayBuffer();
  if (typeImage(new Uint8Array(corps, 0, Math.min(16, corps.byteLength)))?.type !== "image/webp") {
    throw new Error("Studio photo : Cloudflare Images n'a pas rendu de WebP");
  }
  return corps;
}
