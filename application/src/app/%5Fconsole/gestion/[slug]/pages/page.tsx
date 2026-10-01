import { redirect } from "next/navigation";

/* ============================================================================
   L'ANCIENNE ADRESSE DES PAGES DE LA BOUTIQUE — elles s'écrivent désormais
   dans l'éditeur de la vitrine, à côté de la vraie vitrine (panneau Pages),
   et partent en ligne avec le reste à « Publier ». Les liens gardés mènent là.
   ========================================================================== */
export default async function Pages({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/gestion/${slug}/apparence?panneau=pages`);
}
