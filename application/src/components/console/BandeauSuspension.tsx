import { Icone } from "./Icone";
import { MOTIFS_SUSPENSION } from "@/lib/console/libelles";

/* En tête du backoffice d'une boutique suspendue par SkanEcom : pourquoi, et
   le message laissé à son équipe. Il reste tant que dure la suspension (on
   ne le ferme pas : c'est l'état de la boutique, pas une annonce). */
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Africa/Tunis" });

export function BandeauSuspension({ s }: { s: { motif: string | null; message: string | null; le: string | null } }) {
  return (
    <div className="ann-pile" role="region" aria-label="Boutique suspendue">
      <div className="ann ann-suspension" data-niveau="maintenance" role="alert">
        <Icone nom="alimentation" taille={16} />
        <p className="ann-texte">
          <b>Votre vitrine est suspendue par SkanEcom{s.le ? ` depuis le ${JOUR.format(new Date(s.le))}` : ""}{s.motif ? ` · ${MOTIFS_SUSPENSION[s.motif] ?? s.motif}` : ""}.</b>{" "}
          {s.message ? <>« {s.message} » </> : null}
          Les visiteurs ne la voient plus ; vos commandes en cours restent à traiter ici.
        </p>
      </div>
    </div>
  );
}
