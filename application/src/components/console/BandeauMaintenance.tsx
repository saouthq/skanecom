import { Icone } from "./Icone";
import { dateJournal } from "@/lib/console/libelles";

/* En tête du backoffice quand la vitrine est en maintenance (posée par
   l'équipe SkanEcom : toute la plateforme, ou cette boutique) : les clients
   voient une page d'attente ; le backoffice, lui, reste ouvert. */
export function BandeauMaintenance({ plateforme, message, depuis }: { plateforme: boolean; message: string | null; depuis: string }) {
  return (
    <div className="ann-pile" role="region" aria-label="Maintenance de la vitrine">
      <div className="ann ann-conditions" data-niveau="maintenance">
        <Icone nom="outil" taille={16} />
        <p className="ann-texte">
          <b>{plateforme ? "SkanEcom est en maintenance" : "Votre vitrine est en maintenance"} depuis le {dateJournal(depuis)}.</b>{" "}
          {message ? <>« {message} » </> : null}
          Vos clients voient une page d&apos;attente le temps de l&apos;intervention ; le backoffice reste ouvert, rien n&apos;est perdu.
        </p>
      </div>
    </div>
  );
}
