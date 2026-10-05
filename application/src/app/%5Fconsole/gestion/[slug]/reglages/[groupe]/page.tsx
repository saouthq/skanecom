import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GROUPES, type Groupe } from "@/lib/gestion/reglages-ecrans";
import { EcranReglages, type MessagesReglages } from "../Ecran";

type Params = { params: Promise<{ slug: string; groupe: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { groupe } = await params;
  const g = GROUPES.find((x) => x.cle === groupe);
  return { title: g ? `${g.titre} · Réglages` : "Réglages" };
}

/* La page d'un thème des réglages (Ecran.tsx). */
export default async function ReglagesDuTheme({ params, searchParams }: Params & { searchParams: Promise<MessagesReglages> }) {
  const [{ slug, groupe }, messages] = await Promise.all([params, searchParams]);
  if (!GROUPES.some((x) => x.cle === groupe)) notFound();
  return <EcranReglages slug={slug} groupe={groupe as Groupe} messages={messages} />;
}
