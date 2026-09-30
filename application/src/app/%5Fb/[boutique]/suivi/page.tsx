import type { Metadata } from "next";
import Link from "next/link";
import { Gabarit } from "@/components/Gabarit";
import { SuiviCommande } from "@/components/SuiviCommande";
import { cadre as chargeCadre } from "@/lib/boutique";
import { t } from "@/lib/i18n";

/* ============================================================================
   SUIVRE MA COMMANDE — sans compte : le numéro de la commande et le
   téléphone qui l'a passée. La page servie est la même pour tous (en
   cache) ; la commande se lit dans le navigateur, à la demande
   (/suivi/chercher).
   ========================================================================== */

export const revalidate = 300;

export const metadata: Metadata = { title: t.suivi.titre, robots: { index: false } };

export default async function Suivi({ params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  const prefixe = String(cadre.reglages["commande.prefixe_numero"] ?? "").trim().toUpperCase();
  const exemple = `${prefixe || "CMD"}-${new Date().getFullYear()}-00012`;
  const avecComptes = cadre.reglages["compte.obligatoire"] !== false;

  return (
    <Gabarit className="enveloppe flex-1 suivi-page">
      <header className="suivi-tete">
        <p className="etiquette">{t.suivi.etiquette}</p>
        <h1>{t.suivi.titre}</h1>
        <p className="chapo">{t.suivi.chapo}</p>
      </header>
      <SuiviCommande exemple={exemple} />
      {avecComptes ? (
        <p className="legende suivi-compte">
          <Link className="lien-souligne" href="/compte">{t.suivi.compte}</Link>
        </p>
      ) : null}
    </Gabarit>
  );
}
