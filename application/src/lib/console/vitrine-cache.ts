import { revalidateTag } from "next/cache";
import { etiquetteBoutique } from "@/lib/cache-boutique";

/* ============================================================================
   LA VITRINE D'UNE BOUTIQUE, RENDUE DE NOUVEAU APRÈS UN GESTE DE L'ÉQUIPE.

   Les pages de la vitrine se gardent cinq minutes en cache (revalidate =
   300) : sans ce geste, « Publier » n'aurait paru qu'au bout de ce temps, et
   la première visite d'après aurait encore servi l'ancienne page. Toutes les
   pages d'une boutique portent son étiquette (src/lib/cache-boutique.ts) :
   l'expirer les fait rendre de nouveau dès la prochaine visite — l'accueil,
   le catalogue, les fiches, les pages — et ne touche pas aux autres boutiques.

   Un échec n'empêche jamais le geste lui-même (déjà enregistré en base) : la
   vitrine suivra au plus tard dans cinq minutes, comme avant.
   ========================================================================== */

export function rafraichirVitrine(slug: string): void {
  try {
    // `expire: 0` : expirée tout de suite (pas servie une dernière fois, périmée).
    revalidateTag(etiquetteBoutique(slug), { expire: 0 });
  } catch (err) {
    console.error("vitrine : le cache n'a pas pu être renouvelé", slug, err);
  }
}
