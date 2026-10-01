import type { AvisPublie } from "./avis";

/* ============================================================================
   CE QUE LES AVIS PARTAGENT ENTRE LE SERVEUR ET LE NAVIGATEUR — sans client
   de base : la note lisible, les filtres de la liste et la taille d'une page
   (components/ListeAvis.tsx les emploie dans le navigateur).
   ========================================================================== */

/** Les filtres de la liste (public.avis_produit_page) : tous, avec photos, ou une note. */
export type FiltreAvis = "tous" | "photos" | "1" | "2" | "3" | "4" | "5";
export const FILTRES_AVIS: readonly FiltreAvis[] = ["tous", "photos", "5", "4", "3", "2", "1"];

/** Une page d'avis pour un filtre ; `total` compte les avis du filtre. */
export type PageAvis = { filtre: FiltreAvis; total: number; avis: AvisPublie[] };

/** Les avis lus d'abord avec la fiche, puis par pages de la même taille (« Voir plus »). */
export const PAGE_AVIS = 10;
/** En deçà, une liste se lit d'un coup d'œil : ni filtre ni note à toucher. */
export const AVIS_FILTRABLES_DES = 4;

/** 4.6 → « 4,6 » ; 4 → « 4,0 ». */
export function noteLisible(note: number): string {
  return note.toFixed(1).replace(".", ",");
}
