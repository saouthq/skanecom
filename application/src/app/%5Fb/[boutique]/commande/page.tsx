import type { Metadata } from "next";
import { Gabarit } from "@/components/Gabarit";
import { Tunnel } from "@/components/Tunnel";
import { CommandeHorsLigne } from "@/components/CommandeHorsLigne";
import { cadre as chargeCadre } from "@/lib/boutique";
import { verificationVitrine } from "@/lib/connexion-serveur";
import { identiteLegale } from "@/lib/legal";
import { supabase } from "@/lib/supabase";
import { t } from "@/lib/i18n";
import { NUMERO_DEVIS } from "@/lib/commande";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/* ============================================================================
   LA PAGE DE COMMANDE — le cadre de la boutique (réglages : compte
   obligatoire et sa vérification, par SMS ou par e-mail, confirmation par
   appel, paiement à la livraison) et la liste
   des gouvernorats, lus en base ; le reste vit dans le navigateur (le panier)
   et se relit en base à chaque changement (components/Tunnel.tsx).
   L'achat express (réglage commande.achat_express) : `?article=…&quantite=…`,
   cet article seul, le panier n'est pas touché.

   Jamais en cache ni indexée : la façade pose `no-store` sur /commande.
   ========================================================================== */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t.commande.titre,
  robots: { index: false, follow: false },
};

export default async function Commande({
  params,
  searchParams,
}: {
  params: Promise<{ boutique: string }>;
  searchParams: Promise<{ devis?: string; article?: string; quantite?: string }>;
}) {
  const [{ boutique }, recherche] = await Promise.all([params, searchParams]);
  const cadre = await chargeCadre(boutique);
  // Un site vitrine ne prend pas de commande en ligne : comment joindre la boutique.
  if (cadre.siteVitrine) {
    return (
      <Gabarit className="enveloppe flex-1 tunnel-page">
        <CommandeHorsLigne cadre={cadre} />
      </Gabarit>
    );
  }
  // Accepter un devis (module devis) : le tunnel à ses prix.
  const devis = cadre.devis && recherche.devis && NUMERO_DEVIS.test(recherche.devis) ? recherche.devis : null;
  const quantite = Number.parseInt(recherche.quantite ?? "1", 10);
  const express =
    !devis && cadre.achatExpress && recherche.article && UUID.test(recherche.article) && quantite >= 1 && quantite <= 999
      ? { varianteId: recherche.article, quantite }
      : null;
  const { data: gouvernorats } = await supabase.from("gouvernorats").select("code, nom_fr").order("position");

  return (
    <Gabarit className="enveloppe flex-1 tunnel-page">
      <header className="tunnel-tete">
        <h1>{devis ? t.devis.tunnelTitre(devis) : t.commande.titre}</h1>
        <p className="legende">
          {devis ? t.devis.tunnelChapo : express ? t.commande.expressChapo : cadre.retrait ? t.commande.rassuranceRetrait : t.commande.rassurance}
        </p>
      </header>
      <Tunnel
        gabarit={cadre.theme.code}
        boutiqueId={cadre.boutique.id}
        boutique={cadre.boutique.slug}
        compteObligatoire={cadre.reglages["compte.obligatoire"] !== false}
        verification={await verificationVitrine(cadre)}
        rappel={cadre.livraison.rappel}
        cod={cadre.livraison.cod}
        gouvernorats={(gouvernorats ?? []).map((g) => ({ code: g.code as string, nom: g.nom_fr as string }))}
        retractationJours={identiteLegale(cadre).retractationJours}
        retrait={cadre.retrait}
        devisNumero={devis}
        express={express}
        codesPromo={cadre.promotions}
        relancePaniers={cadre.relancePaniers}
      />
    </Gabarit>
  );
}
