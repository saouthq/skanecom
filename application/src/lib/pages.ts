import { cache } from "react";
import { supabase } from "./supabase";
import { FORME_SLUG } from "./pages-forme";

/* ============================================================================
   LES PAGES D'UNE BOUTIQUE — « À propos », questions fréquentes… écrites au
   backoffice (migration 43), lues par la vitrine à leur adresse (/a-propos).
   Une adresse qui n'a pas la forme d'une page ne coûte pas de requête.
   ========================================================================== */

export type Page = {
  slug: string;
  genre: "texte" | "questions";
  titre_fr: string;
  titre_ar: string | null;
  corps_fr: string;
  corps_ar: string | null;
  modifiee_le: string;
};

/** `cache()` : les métadonnées et la page la lisent une seule fois par requête. */
export const chargePage = cache(async (boutiqueId: string, slug: string): Promise<Page | null> => {
  if (!FORME_SLUG.test(slug) || slug.length > 60) return null;
  const { data, error } = await supabase.rpc("page_publique", { p_boutique_id: boutiqueId, p_slug: slug });
  if (error) throw new Error(`Page illisible : ${error.message}`);
  return (data as Page | null) ?? null;
});

/** Le premier paragraphe, sans ses marques : la description de la page (SEO). */
export function resumePage(corps: string): string {
  const premier = corps.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).find((b) => b && !/^#{2,3}\s/.test(b)) ?? "";
  return premier.replace(/\*\*?|\[([^\]]+)\]\([^)]*\)/g, (m, lien) => lien ?? "").replace(/\s+/g, " ").slice(0, 180);
}
