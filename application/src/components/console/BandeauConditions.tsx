import Link from "next/link";
import { Icone } from "./Icone";

/* En tête du backoffice tant que les conditions de service en vigueur ne
   sont pas acceptées (migration …_conditions_service) : au propriétaire,
   le lien pour les lire et les accepter ; aux autres, qui doit le faire.
   Jamais un blocage : la boutique continue de vendre. */
export function BandeauConditions({ slug, version, peutAccepter, proprietaire }: {
  slug: string; version: number; peutAccepter: boolean; proprietaire: string | null;
}) {
  return (
    <div className="ann-pile" role="region" aria-label="Conditions de service de SkanEcom">
      <div className="ann ann-conditions">
        <Icone nom="fichier" taille={16} />
        <p className="ann-texte">
          <b>Les conditions de service de SkanEcom{version > 1 ? ` (version ${version})` : ""} attendent votre accord.</b>{" "}
          {peutAccepter
            ? "Elles disent ce que fait SkanEcom, ce que fait la boutique, et ce que deviennent les données de vos clients."
            : `Le propriétaire${proprietaire ? ` (${proprietaire})` : ""} les accepte au nom de l'entreprise.`}
        </p>
        <Link className="btn btn-second btn-petit" href={`/gestion/${slug}/conditions`}>{peutAccepter ? "Les lire et les accepter" : "Les lire"}</Link>
      </div>
    </div>
  );
}
