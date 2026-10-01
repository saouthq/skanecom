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

function versBlob(canvas: HTMLCanvasElement, type: string, qualite: number): Promise<Blob | null> {
  return new Promise((r) => canvas.toBlob(r, type, qualite));
}

/** La photo réduite ; l'originale si le navigateur ne sait pas la lire
 *  (le serveur dira alors ce qui ne va pas). */
export async function reduire(fichier: File, coteMax = 2000): Promise<Blob> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  } catch {
    return fichier;
  }
  const echelle = Math.min(1, coteMax / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * echelle);
  canvas.height = Math.round(image.height * echelle);
  const ctx = canvas.getContext("2d");
  if (!ctx) return fichier;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  let blob = await versBlob(canvas, "image/webp", 0.86);
  if (!blob || blob.type !== "image/webp") blob = await versBlob(canvas, "image/jpeg", 0.88);
  if (!blob) return fichier;
  // Déjà petite et déjà compressée : on garde l'originale si elle est plus légère.
  return echelle === 1 && blob.size >= fichier.size && fichier.type !== "image/png" ? fichier : blob;
}

export function nomPour(fichier: File, blob: Blob): string {
  const base = fichier.name.replace(/\.[^.]+$/, "") || "photo";
  return blob === fichier ? fichier.name : `${base}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
}
