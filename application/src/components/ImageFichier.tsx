import Image, { type ImageProps } from "next/image";
import { preload } from "react-dom";
import { jeuDePhoto } from "@/lib/photos";

/* ============================================================================
   UNE IMAGE DE NOS FICHIERS, à la taille de l'écran.

   Les photos vivent sur R2 : `next/image` (vinext) les sert telles quelles,
   sans `srcset` — un téléphone chargeait la photo de 1 200 px d'une vignette
   de 180. Quand le nom d'une photo dit sa largeur, sa sœur à la moitié existe
   (lib/photos.ts, jeuDePhoto) : on donne les deux au navigateur, qui choisit.

   Une photo prioritaire est annoncée avec son jeu (sinon le navigateur
   téléchargerait d'avance la grande, puis la petite). Sans jeu, rien ne
   change : c'est l'image d'avant.
   ========================================================================== */

export default function ImageFichier(props: ImageProps) {
  const jeu = typeof props.src === "string" ? jeuDePhoto(props.src) : undefined;
  // eslint-disable-next-line jsx-a11y/alt-text -- alt arrive avec les props (obligatoire dans ImageProps)
  if (!jeu) return <Image {...props} />;
  const { priority, sizes, fill, ...reste } = props;
  const tailles = sizes ?? (fill ? "100vw" : undefined);
  if (priority) preload(props.src as string, { as: "image", imageSrcSet: jeu, imageSizes: tailles, fetchPriority: "high" });
  // `srcSet` et `fetchPriority` passent jusqu'à l'<img> (le reste des propriétés y est recopié).
  const enPlus = { srcSet: jeu, ...(priority ? { fetchPriority: "high" } : {}) } as object;
  return (
    // eslint-disable-next-line jsx-a11y/alt-text -- alt arrive avec les props (obligatoire dans ImageProps)
    <Image {...reste} fill={fill} sizes={tailles} loading={priority ? "eager" : props.loading}
      unoptimized={!fill} {...enPlus} />
  );
}
