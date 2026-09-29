import { champ } from "./i18n";
import type { Produit, Variante } from "./catalogue";

/* ============================================================================
   PHOTOS — d'où vient une image, et ce qu'on s'interdit d'afficher.

   ÉTAT AU 11/08 (mesuré) : la table `produit_images` est VIDE. Le protocole
   photo (docs/photos/protocole-photo.md) n'a pas encore été exécuté par le
   père de Skander, et les 4 photos reçues sont des photos WhatsApp prises en
   rue — non montrables sur un site premium (PRD §4).

   ⛔ INTERDIT, et ce n'est pas négociable ici : les trois visuels de
   `docs/photos/placeholders/` (sac, escarpins, derbies) sont GÉNÉRÉS PAR IA.
   Ils ont servi à orienter le design des maquettes ; ils ne sont JAMAIS servis
   par l'application (LISEZ-MOI du dossier, décision Skander/Luna du 11/08).
   Ils ne sont d'ailleurs pas dans `public/` : le serveur ne peut pas les
   servir même par accident.

   AUCUNE photo réelle n'est servie : la valise jaune détourée par Théo, qui
   servait de visuel d'accueil, a été retirée le 29/09 à la demande de
   Skander. L'accueil montre l'état « photo à venir » jusqu'au protocole
   photo.
   ========================================================================== */

const BUCKET_DEFAUT = "produits";

/**
 * URL publique d'un chemin de `produit_images.storage_path`.
 * Le chemin peut être écrit « bucket/dossier/fichier.webp » ou simplement
 * « dossier/fichier.webp » — dans ce second cas on complète avec le bucket par
 * défaut. ⚠️ À confirmer avec Iris/Max au premier versement de photos : c'est
 * la seule inconnue de cette chaîne, et elle se verra tout de suite (image
 * cassée), donc elle ne peut pas mentir en silence.
 */
export function urlStockage(chemin: string): string {
  if (chemin.startsWith("http://") || chemin.startsWith("https://")) return chemin;
  if (chemin.startsWith("/")) return chemin; // fichier servi par `public/`

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const complet = chemin.includes("/") ? chemin : `${BUCKET_DEFAUT}/${chemin}`;
  return `${base}/storage/v1/object/public/${complet}`;
}

type PhotoAffichable = { src: string; alt: string; detoure?: boolean } | null;

/** Photo de tête d'un produit : la première de la table, sinon rien (la niche
 *  rendra la silhouette). On ne substitue JAMAIS l'image d'un autre produit. */
export function urlPhoto(produit: Produit, variante?: Variante | null): PhotoAffichable {
  const images = produit.images ?? [];
  if (images.length === 0) return null;

  const propre = variante ? images.find((i) => i.variante_id === variante.id) : undefined;
  const image = propre ?? images.find((i) => i.variante_id === null) ?? images[0];

  return {
    src: urlStockage(image.storage_path),
    alt: champ(image, "alt") || champ(produit, "nom"),
  };
}

/** Toutes les photos d'un produit, pour la galerie de la fiche. */
export function photosProduit(produit: Produit): { src: string; alt: string }[] {
  return (produit.images ?? []).map((image) => ({
    src: urlStockage(image.storage_path),
    alt: champ(image, "alt") || champ(produit, "nom"),
  }));
}
