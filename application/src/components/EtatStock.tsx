import { Coche } from "./Icones";
import { t } from "@/lib/i18n";
import type { EtatStock as Etat } from "@/lib/catalogue";

/* ============================================================================
   ÉTAT DE STOCK — l'exception se cadre, la normalité se dit calmement.

   Règle tenue de la charte (§6) et du défaut mesuré le 05/08 : sur une grille
   de huit produits, huit badges de même poids ne signalent plus rien. Donc
   « En stock » est un texte discret ; seuls « Plus que N » et « Rupture »
   portent un cadre.
   L'état ne passe JAMAIS par la seule couleur : il y a toujours un mot.
   ========================================================================== */

export function EtatStock({
  etat,
  restant,
  discret = false,
}: {
  etat: Etat;
  restant: number;
  /** Sur une grille : l'état normal se dit en gris, sans coche. Quatre marques
   *  vertes de poids identique ne signalent plus rien (juge visuel, 11/08). */
  discret?: boolean;
}) {
  if (etat === "rupture") {
    return <span className="etat etat-rupture">{t.stock.rupture}</span>;
  }
  if (etat === "faible") {
    return <span className="etat etat-faible">{t.stock.faible(restant)}</span>;
  }
  // Grille : rien. Le silence EST le signal « tout va bien », et il rend leur
  // force aux deux états qui méritent un cadre.
  if (discret) return null;

  return (
    <span className="dispo">
      <Coche taille={14} />
      {t.stock.enStockN(restant)}
    </span>
  );
}
