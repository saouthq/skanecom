import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { ComposeurAccueil } from "@/components/console/ComposeurAccueil";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { adresseVitrine } from "@/lib/console/libelles";
import { quand } from "@/lib/gestion/libelles";
import { cadreDeGestion, PEUT_ECRIRE } from "@/lib/gestion/pages";
import { DIRECTION } from "@/lib/gestion/tableau";
import type { AccueilGestion, SectionBrute } from "@/lib/gestion/accueil";
import { definitionDe, gabaritDe } from "@/lib/theme";

export const metadata: Metadata = { title: "Page d'accueil" };

/* ============================================================================
   LA PAGE D'ACCUEIL DE LA BOUTIQUE — composée par son équipe : les sections
   de haut en bas, ce qu'elles disent, et la bibliothèque où en prendre
   d'autres (avis, questions, marques…). Chaque section dit si la vitrine la
   montrera, ou pourquoi pas encore. Propriétaire et administrateur
   composent ; la direction lit.
   ========================================================================== */
export default async function Accueil({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  if (!DIRECTION.includes(boutique.role)) notFound();
  const sb = await clientSession();
  const [{ data, error }, cadre, hoteConsole] = await Promise.all([
    sb.rpc("gestion_accueil", { p_boutique_id: boutique.boutique_id }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
  ]);
  if (error) throw new Error(`Accueil illisible : ${error.message}`);
  const accueil = data as AccueilGestion;
  const code = gabaritDe(accueil.code);
  const parGabarit = accueil.sections === null;
  // Sans composition propre, l'accueil est celui du gabarit : on part de lui.
  const sections: SectionBrute[] = (accueil.sections ?? (definitionDe(code).sections as SectionBrute[])).map((s, i) => ({ ...s, cle: `s${i}` }));
  const hote = cadre?.boutique.hote_principal ?? null;
  const message = q.ok ? { ok: true, texte: q.ok } : q.erreur ? { ok: false, texte: q.erreur } : null;

  return (
    <>
      <EnTetePage
        titre="Page d'accueil"
        description={
          accueil.modifie_le && !parGabarit
            ? `Ce que la vitrine montre en premier, de haut en bas. Modifiée ${quand(accueil.modifie_le)}${accueil.modifie_par ? ` par ${accueil.modifie_par}` : ""}.`
            : "Ce que la vitrine montre en premier, de haut en bas. Pour l'instant, l'accueil du gabarit : composez le vôtre."
        }
      />
      <ComposeurAccueil
        key={accueil.version ?? 0}
        action={`/gestion/${slug}/accueil/action`}
        photoAction={`/gestion/${slug}/accueil/photo`}
        vitrine={hote ? adresseVitrine(hote, hoteConsole) : null}
        ecrit={PEUT_ECRIRE.includes(boutique.role) && accueil.theme}
        accueil={{ ...accueil, code }}
        sections={sections}
        parGabarit={parGabarit}
        message={message}
      />
    </>
  );
}
