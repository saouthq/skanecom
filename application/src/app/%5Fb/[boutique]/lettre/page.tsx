import type { Metadata } from "next";
import { Gabarit } from "@/components/Gabarit";
import { GesteLettre } from "@/components/GesteLettre";
import { cadre as chargeCadre } from "@/lib/boutique";
import { t } from "@/lib/i18n";

/* ============================================================================
   LA LETTRE — la page du lien de l'e-mail : confirmer son inscription, ou
   s'en aller (?a=desinscrire). Le jeton est dans l'adresse : la page n'est
   ni indexée ni citée ailleurs (aucun référent), et rien ne se passe avant
   le clic de la personne.
   ========================================================================== */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: t.lettre.titre, robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Lettre({ params, searchParams }: {
  params: Promise<{ boutique: string }>;
  searchParams: Promise<{ j?: string; a?: string }>;
}) {
  const { boutique } = await params;
  const { j, a } = await searchParams;
  const cadre = await chargeCadre(boutique);
  const jeton = typeof j === "string" && /^[0-9a-f]{64}$/.test(j) ? j : null;

  return (
    <Gabarit className="enveloppe flex-1 lettre-page">
      {/* La clé : passer de « confirmer » à « se désinscrire » repart de zéro. */}
      <GesteLettre key={a === "desinscrire" ? "desinscrire" : "confirmer"} jeton={jeton} geste={a === "desinscrire" ? "desinscrire" : "confirmer"} boutique={cadre.boutique.nom} />
    </Gabarit>
  );
}
