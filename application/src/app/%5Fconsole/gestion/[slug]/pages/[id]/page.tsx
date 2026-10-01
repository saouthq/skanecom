import { redirect } from "next/navigation";

/* L'ancienne adresse d'une page : elle s'ouvre dans l'éditeur de la vitrine. */
export default async function Page({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  redirect(`/gestion/${slug}/apparence?${new URLSearchParams({ panneau: "pages", page: id })}`);
}
