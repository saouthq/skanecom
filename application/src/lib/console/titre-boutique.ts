import { cache } from "react";
import { clientService } from "@/lib/console/service";

/* Le titre de l'onglet du navigateur pour une page d'une boutique : son
   nom (« Équipe · Maison Selma »), pas son identifiant d'adresse. Par
   console_boutique, comme le reste de la console ; une lecture par requête. */
const nomDe = cache(async (slug: string): Promise<string> => {
  const { data } = await clientService().rpc("console_boutique", { p_slug: slug });
  return (data as { boutique?: { nom?: string } } | null)?.boutique?.nom ?? slug;
});

export async function titreBoutique(params: Promise<{ slug: string }>, onglet?: string): Promise<string> {
  const nom = await nomDe((await params).slug);
  return onglet ? `${onglet} · ${nom}` : nom;
}
