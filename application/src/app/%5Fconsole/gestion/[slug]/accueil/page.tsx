import { redirect } from "next/navigation";

/* ============================================================================
   L'ANCIENNE ADRESSE DE LA PAGE D'ACCUEIL — l'accueil se compose désormais
   dans l'éditeur de la vitrine, à côté de la vraie vitrine (écran
   « Éditeur de la vitrine », panneau Accueil). Les liens gardés mènent là.
   ========================================================================== */
export default async function Accueil({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/gestion/${slug}/apparence?panneau=accueil`);
}
