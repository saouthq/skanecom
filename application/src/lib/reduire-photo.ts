/* ============================================================================
   RÉDUIRE UNE PHOTO DANS LE NAVIGATEUR, avant de l'envoyer — le dépôt des
   photos du backoffice (components/console/DepotPhotos.tsx) et les photos
   des avis (components/DonnerAvis.tsx).

   Le plus grand côté ramené à `coteMax`, en WebP (JPEG si le navigateur ne
   sait pas écrire le WebP) : une photo de téléphone de 5 Mo devient un
   fichier de quelques centaines de Ko, qui passe même sur un réseau mobile
   moyen, et les informations cachées de la photo (lieu de la prise de vue)
   disparaissent.
   ========================================================================== */

import { LARGEUR_MIN_DOUBLEE } from "./photos";

function versBlob(canvas: HTMLCanvasElement, type: string, qualite: number): Promise<Blob | null> {
  return new Promise((r) => canvas.toBlob(r, type, qualite));
}

/** La photo réduite ; l'originale si le navigateur ne sait pas la lire
 *  (le serveur dira alors ce qui ne va pas). */
export async function reduire(fichier: File, coteMax = 2000): Promise<Blob> {
  return (await reduireEnDeux(fichier, coteMax, false)).photo;
}

/** La photo réduite, et sa sœur à mi-largeur, du même type (la vitrine sert
 *  la petite aux téléphones : lib/photos.ts). `demi` est nul si la photo est
 *  trop petite pour valoir une sœur, ou si le navigateur n'a pas su la faire. */
export async function reduireEnDeux(fichier: File, coteMax = 2000, avecDemi = true): Promise<{ photo: Blob; demi: Blob | null }> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  } catch {
    return { photo: fichier, demi: null };
  }
  const echelle = Math.min(1, coteMax / Math.max(image.width, image.height));
  const dessin = (largeur: number, hauteur: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, largeur, hauteur);
    return canvas;
  };
  const largeur = Math.round(image.width * echelle);
  const hauteur = Math.round(image.height * echelle);
  const canvas = dessin(largeur, hauteur);
  if (!canvas) { image.close(); return { photo: fichier, demi: null }; }
  let blob = await versBlob(canvas, "image/webp", 0.86);
  if (!blob || blob.type !== "image/webp") blob = await versBlob(canvas, "image/jpeg", 0.88);
  // Déjà petite et déjà compressée : on garde l'originale si elle est plus légère.
  const photo = !blob ? fichier : echelle === 1 && blob.size >= fichier.size && fichier.type !== "image/png" ? fichier : blob;
  let demi: Blob | null = null;
  if (avecDemi && largeur >= LARGEUR_MIN_DOUBLEE && ["image/webp", "image/jpeg"].includes(photo.type)) {
    const petit = dessin(Math.floor(largeur / 2), Math.max(1, Math.round(hauteur / 2)));
    const b = petit ? await versBlob(petit, photo.type, photo.type === "image/webp" ? 0.84 : 0.86) : null;
    demi = b && b.type === photo.type ? b : null;
  }
  image.close();
  return { photo, demi };
}

export function nomPour(fichier: File, blob: Blob): string {
  const base = fichier.name.replace(/\.[^.]+$/, "") || "photo";
  return blob === fichier ? fichier.name : `${base}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
}
