import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemandeDevis } from "@/components/DemandeDevis";
import { Gabarit } from "@/components/Gabarit";
import { cadre as chargeCadre } from "@/lib/boutique";
import { t } from "@/lib/i18n";

/* ============================================================================
   LA DEMANDE DE DEVIS (module devis) — le panier envoyé à la boutique
   (components/DemandeDevis.tsx). La page servie ne contient rien de
   personnel : le panier vit dans le navigateur. Jamais indexée.
   ========================================================================== */

export const metadata: Metadata = {
  title: t.devis.meta,
  robots: { index: false, follow: false },
};

export default async function PageDevis({ params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre.devis) notFound();
  return (
    <Gabarit className="enveloppe flex-1 compte-page devis-page">
      <header className="compte-tete">
        <h1>{t.devis.titre}</h1>
        <p className="legende">{t.devis.chapo}</p>
      </header>
      <DemandeDevis boutiqueId={cadre.boutique.id} />
    </Gabarit>
  );
}
