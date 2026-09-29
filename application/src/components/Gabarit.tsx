import { Entete } from "./Entete";
import { Pied } from "./Pied";
import { t } from "@/lib/i18n";
import type { Cadre } from "@/lib/boutique";

/** Le squelette de toute page de boutique : lien d'évitement, en-tête,
 *  contenu, pied. */
export function Gabarit({
  cadre,
  actif,
  className = "enveloppe flex-1",
  children,
}: {
  cadre: Cadre;
  actif?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <a className="saut-contenu" href="#principal">
        {t.commun.sauterAuContenu}
      </a>
      <Entete cadre={cadre} actif={actif} />
      <main id="principal" className={className}>
        {children}
      </main>
      <Pied cadre={cadre} />
    </>
  );
}
