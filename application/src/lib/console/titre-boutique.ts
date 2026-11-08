import { boutiqueConsole } from "@/lib/console/boutique-lue";

/* Le titre de l'onglet du navigateur pour une page d'une boutique : son
   nom (« Équipe · Maison Selma »), pas son identifiant d'adresse. Par
   console_boutique, comme le reste de la console ; une lecture par requête. */
const nomDe = async (slug: string): Promise<string> => {
  const { data } = await boutiqueConsole(slug);
  return (data as { boutique?: { nom?: string } } | null)?.boutique?.nom ?? slug;
};

export async function titreBoutique(params: Promise<{ slug: string }>, onglet?: string): Promise<string> {
  const nom = await nomDe((await params).slug);
  return onglet ? `${onglet} · ${nom}` : nom;
}
