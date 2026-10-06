import Link from "next/link";
import { Icone } from "./Icone";

/** Les deux vues de la page E-mails : les modèles (ce que reçoivent l'acheteur
 *  et l'équipe), l'envoi (l'expéditeur, les réponses, les domaines, l'essai). */
export function OngletsCourriels({ actif }: { actif: "modeles" | "envoi" }) {
  return (
    <nav className="segments" aria-label="Vue des e-mails">
      <Link href="/courriels" className={actif === "modeles" ? "crl-segment crl-segment-actif" : "crl-segment"} aria-current={actif === "modeles" ? "page" : undefined}>
        <Icone nom="apercu" taille={14} /> Modèles
      </Link>
      <Link href="/courriels/envoi" className={actif === "envoi" ? "crl-segment crl-segment-actif" : "crl-segment"} aria-current={actif === "envoi" ? "page" : undefined}>
        <Icone nom="reglages" taille={14} /> Envoi
      </Link>
    </nav>
  );
}
