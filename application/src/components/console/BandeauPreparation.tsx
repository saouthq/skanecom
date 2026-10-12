import Link from "next/link";
import { Icone } from "./Icone";

/* En tête du backoffice d'une boutique encore « en préparation » : sa vitrine
   n'est pas encore visible, et ce qui reste à régler avant l'ouverture est à
   un geste (Réglages le liste). Il disparaît quand SkanEcom ouvre la boutique. */
export function BandeauPreparation({ nom, reglages }: { nom: string; reglages: string | null }) {
  return (
    <div className="ann-pile" role="region" aria-label="Boutique en préparation">
      <div className="ann ann-preparation">
        <Icone nom="horloge" taille={16} />
        <p className="ann-texte">
          <b>{nom} est en préparation.</b> Les visiteurs ne voient pas encore la vitrine : SkanEcom l&apos;ouvre quand tout est prêt.
        </p>
        {reglages ? <Link className="btn btn-second btn-petit" href={reglages}>Ce qui reste à régler</Link> : null}
      </div>
    </div>
  );
}
