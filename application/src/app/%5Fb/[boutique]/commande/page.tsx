import type { Metadata } from "next";
import { Gabarit } from "@/components/Gabarit";
import { Tunnel } from "@/components/Tunnel";
import { cadre as chargeCadre } from "@/lib/boutique";
import { identiteLegale } from "@/lib/legal";
import { supabase } from "@/lib/supabase";
import { t } from "@/lib/i18n";

/* ============================================================================
   LA PAGE DE COMMANDE — le cadre de la boutique (réglages : compte
   obligatoire, confirmation par appel, paiement à la livraison) et la liste
   des gouvernorats, lus en base ; le reste vit dans le navigateur (le panier)
   et se relit en base à chaque changement (components/Tunnel.tsx).

   Jamais en cache ni indexée : la façade pose `no-store` sur /commande.
   ========================================================================== */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t.commande.titre,
  robots: { index: false, follow: false },
};

export default async function Commande({ params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  const { data: gouvernorats } = await supabase.from("gouvernorats").select("code, nom_fr").order("position");

  return (
    <Gabarit className="enveloppe flex-1 tunnel-page">
      <header className="tunnel-tete">
        <h1>{t.commande.titre}</h1>
        <p className="legende">{cadre.retrait ? t.commande.rassuranceRetrait : t.commande.rassurance}</p>
      </header>
      <Tunnel
        gabarit={cadre.theme.code}
        boutiqueId={cadre.boutique.id}
        boutique={cadre.boutique.slug}
        compteObligatoire={cadre.reglages["compte.obligatoire"] !== false}
        rappel={cadre.livraison.rappel}
        cod={cadre.livraison.cod}
        gouvernorats={(gouvernorats ?? []).map((g) => ({ code: g.code as string, nom: g.nom_fr as string }))}
        retractationJours={identiteLegale(cadre).retractationJours}
        retrait={cadre.retrait}
      />
    </Gabarit>
  );
}
