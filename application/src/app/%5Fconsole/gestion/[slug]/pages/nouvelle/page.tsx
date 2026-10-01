import { redirect } from "next/navigation";

/* L'ancienne adresse d'une page neuve : elle s'écrit dans l'éditeur de la vitrine. */
export default async function NouvellePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/gestion/${slug}/apparence?panneau=pages&page=nouvelle`);
}
