import type { Metadata } from "next";
import { Gabarit } from "@/components/Gabarit";
import { CommandeHorsLigne } from "@/components/CommandeHorsLigne";
import { OuvrirLePanier } from "@/components/OuvrirLePanier";
import { cadre as chargeCadre } from "@/lib/boutique";
import { t } from "@/lib/i18n";

/* ============================================================================
   /panier — le panier s'ouvre (le tiroir de l'en-tête) ; un site vitrine,
   sans panier, dit comment commander. Le panier d'une relance a sa propre
   adresse (/panier/<id>).
   ========================================================================== */

export const metadata: Metadata = { title: t.panier.titre, robots: { index: false } };

export default async function PagePanier({ params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  return (
    <Gabarit className="enveloppe flex-1 reprise-page">
      {cadre.siteVitrine ? (
        <CommandeHorsLigne cadre={cadre} />
      ) : (
        <>
          <header className="suivi-tete">
            <h1>{t.panier.titre}</h1>
            <p className="chapo">{t.panier.pageChapo}</p>
          </header>
          <OuvrirLePanier />
        </>
      )}
    </Gabarit>
  );
}
