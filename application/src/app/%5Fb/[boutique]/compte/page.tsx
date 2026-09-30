import type { Metadata } from "next";
import { Compte } from "@/components/Compte";
import { Gabarit } from "@/components/Gabarit";
import { cadre as chargeCadre } from "@/lib/boutique";
import { t } from "@/lib/i18n";

/* ============================================================================
   MES COMMANDES — la page du compte de l'acheteur (components/Compte.tsx).
   La page servie ne contient rien de personnel : les commandes se lisent
   dans le navigateur, avec la session de l'acheteur. Jamais indexée, jamais
   en cache (la façade pose `no-store` sur /compte).
   ========================================================================== */

export const metadata: Metadata = {
  title: t.compte.meta,
  robots: { index: false, follow: false },
};

export default async function PageCompte({ params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  return (
    <Gabarit className="enveloppe flex-1 compte-page">
      <header className="compte-tete">
        <h1>{t.compte.titre}</h1>
        <p className="legende">{t.compte.chapo}</p>
      </header>
      <Compte boutiqueId={cadre.boutique.id} sav={Boolean(cadre.sav)} pro={cadre.comptesPro} />
    </Gabarit>
  );
}
