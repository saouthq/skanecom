import { REGLES, defautImage, type Emplacement } from "./images-marque";

/* ============================================================================
   UNE PHOTO PRÉPARÉE DANS LE NAVIGATEUR — redressée (orientation de
   l'appareil), réduite dans la boîte de son emplacement, en WebP (JPEG si le
   navigateur ne sait pas l'écrire). Les mêmes règles que la console
   (images-marque) : trop petite, elle est refusée avant tout envoi ; le
   serveur les revérifie. Un SVG n'est jamais une photo.
   ========================================================================== */

export type PhotoPreparee = { blob: Blob; nom: string } | { erreur: string };

function versBlob(canvas: HTMLCanvasElement, type: string, qualite: number): Promise<Blob | null> {
  return new Promise((r) => canvas.toBlob(r, type, qualite));
}

export async function preparerPhoto(fichier: File, e: Emplacement): Promise<PhotoPreparee> {
  if (fichier.type === "image/svg+xml" || /\.svg$/i.test(fichier.name)) return { erreur: "Une photo de l'accueil est un JPEG, un PNG ou un WebP." };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  } catch {
    return { erreur: `« ${fichier.name} » n'est pas une image que le navigateur sait lire.` };
  }
  const defaut = defautImage(e, bitmap.width, bitmap.height, true);
  if (defaut) {
    bitmap.close();
    return { erreur: defaut };
  }
  const { boite } = REGLES[e];
  const echelle = Math.min(1, boite.largeur / bitmap.width, boite.hauteur / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * echelle));
  canvas.height = Math.max(1, Math.round(bitmap.height * echelle));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { erreur: "Le navigateur ne sait pas préparer cette photo." };
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let blob = await versBlob(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") blob = await versBlob(canvas, "image/jpeg", 0.88);
  if (!blob) return { erreur: "Le navigateur ne sait pas préparer cette photo." };
  return { blob, nom: `${e}.${blob.type === "image/webp" ? "webp" : "jpg"}` };
}
