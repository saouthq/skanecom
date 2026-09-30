/* ============================================================================
   LA FORME D'UNE PAGE DE LA BOUTIQUE — les règles que la base impose
   (public.pages_boutique, migration 43), reprises ici pour que l'éditeur du
   backoffice les dise AVANT l'envoi, sous le champ en cause : un texte long
   ne se perd jamais sur un refus. La base reste juge (et seule à savoir si
   une autre page a déjà l'adresse).
   ========================================================================== */

export const FORME_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Les adresses que la vitrine sert déjà (contrainte pages_slug_libre). */
export const SLUGS_RESERVES = [
  "catalogue", "categorie", "produit", "recherche", "commande", "compte", "devis", "filtrer",
  "conditions-de-vente", "mentions-legales", "confidentialite", "garantie-et-sav",
  "contact", "suivi", "pages", "api", "crochets",
] as const;

export const LIMITES = { titre: { min: 2, max: 80 }, slug: { min: 2, max: 60 }, corps: 20000 } as const;

/** « À propos de nous » → « a-propos-de-nous ». */
export function slugDe(titre: string): string {
  return titre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/['’]/g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, LIMITES.slug.max).replace(/-+$/g, "");
}

export type ChampPage = "titre" | "slug" | "corps";

/** Ce qui empêcherait la base d'enregistrer la page, champ par champ. */
export function problemesPage(p: { titre: string; slug: string; corps: string }): Partial<Record<ChampPage, string>> {
  const sortie: Partial<Record<ChampPage, string>> = {};
  const titre = p.titre.trim();
  if (titre.length < LIMITES.titre.min) sortie.titre = "Un titre, de deux lettres au moins.";
  else if (titre.length > LIMITES.titre.max) sortie.titre = `${LIMITES.titre.max} caractères au plus (il en a ${titre.length}).`;
  const slug = p.slug.trim();
  if (!slug) sortie.slug = "L'adresse de la page est attendue.";
  else if (!FORME_SLUG.test(slug)) sortie.slug = "Des minuscules sans accent, des chiffres et des tirets (« a-propos »).";
  else if (slug.length < LIMITES.slug.min || slug.length > LIMITES.slug.max) sortie.slug = `De ${LIMITES.slug.min} à ${LIMITES.slug.max} caractères.`;
  else if ((SLUGS_RESERVES as readonly string[]).includes(slug)) sortie.slug = `« /${slug} » est déjà une page de la boutique : choisissez une autre adresse.`;
  if (p.corps.length > LIMITES.corps) sortie.corps = `Texte trop long : ${LIMITES.corps.toLocaleString("fr-FR")} signes au plus.`;
  return sortie;
}
