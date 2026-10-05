import type { Metadata } from "next";
import { EcranReglages, type MessagesReglages } from "./Ecran";
import { AncienneAncre } from "./AncienneAncre";

export const metadata: Metadata = { title: "Réglages" };

/* L'accueil des réglages : une tuile par thème (Ecran.tsx). */
export default async function Reglages({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<MessagesReglages>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  return (
    <>
      {/* Un ancien lien « réglages#t-zones » mène à la page de son thème. */}
      <AncienneAncre slug={slug} />
      <EcranReglages slug={slug} groupe={null} messages={messages} />
    </>
  );
}
