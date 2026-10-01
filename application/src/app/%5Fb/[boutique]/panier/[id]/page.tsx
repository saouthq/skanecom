import type { Metadata } from "next";
import Link from "next/link";
import { Gabarit } from "@/components/Gabarit";
import { RepriseDuPanier, type LigneReprise } from "@/components/RepriseDuPanier";
import { CommandeHorsLigne } from "@/components/CommandeHorsLigne";
import { cadre as chargeCadre } from "@/lib/boutique";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

/* ============================================================================
   LE PANIER D'UNE RELANCE — l'adresse que porte le message WhatsApp de la
   boutique (paniers abandonnés, réglage commande.relance_paniers) : le
   panier gardé, relu en base à son prix du jour, et « Reprendre ma
   commande », qui le remet dans ce navigateur. La cliente l'ouvre sur son
   téléphone, même si elle avait rempli son panier ailleurs.
   ========================================================================== */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: t.reprise.titre, robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function Reprise({ params }: { params: Promise<{ boutique: string; id: string }> }) {
  const { boutique, id } = await params;
  const cadre = await chargeCadre(boutique);
  if (cadre.siteVitrine) {
    return (
      <Gabarit className="enveloppe flex-1 reprise-page">
        <CommandeHorsLigne cadre={cadre} />
      </Gabarit>
    );
  }
  let lignes: LigneReprise[] = [];
  if (UUID.test(id)) {
    const { data, error } = await supabase.rpc("panier_a_reprendre", { p_boutique_id: cadre.boutique.id, p_panier_id: id });
    if (error) throw new Error(`Panier illisible : ${error.message}`);
    lignes = (data as { lignes?: LigneReprise[] } | null)?.lignes ?? [];
  }
  const parties = lignes.length > 0 && lignes.every((l) => !l.disponible);

  return (
    <Gabarit className="enveloppe flex-1 reprise-page">
      <header className="suivi-tete">
        <p className="etiquette">{t.reprise.etiquette}</p>
        <h1>{parties ? t.reprise.epuiseTitre : lignes.length ? t.reprise.titre : t.reprise.perdu}</h1>
        <p className="chapo">{parties ? t.reprise.epuiseChapo : lignes.length ? t.reprise.chapo(cadre.boutique.nom) : t.reprise.perduTexte}</p>
      </header>
      {lignes.length ? (
        <RepriseDuPanier lignes={lignes} />
      ) : (
        <Link className="btn btn-primaire" href="/catalogue">{t.reprise.catalogue}</Link>
      )}
    </Gabarit>
  );
}
