import Link from "next/link";
import { Fleche } from "./Icones";
import { t } from "@/lib/i18n";
import type { CodeTheme } from "@/lib/theme";

/* ============================================================================
   LA TUILE DE FIN — la dernière case d'une sélection de l'accueil : « tout
   voir », à la taille d'une carte. Elle ne paraît que si elle complète une
   rangée (une rangée de trois sur quatre colonnes ; jamais une rangée neuve
   pour elle seule) : c'est le CSS qui en décide, selon les colonnes de
   l'écran. Au bout d'une bande qu'on fait glisser (téléphone), toujours.
   ========================================================================== */

export function TuileFin({ href, titre, compte, gabarit }: { href: string; titre: string; compte: string | null; gabarit: CodeTheme }) {
  return (
    <Link href={href} className={gabarit === "technique" ? "tuile-fin te-tuile-fin" : "tuile-fin ed-tuile-fin"}>
      <span className="tuile-fin-titre">{titre}</span>
      {compte ? <span className="tuile-fin-compte">{compte}</span> : null}
      <span className="tuile-fin-lien">
        {t.commun.toutVoir}
        <Fleche taille={16} className="icone-fleche rtl:-scale-x-100" />
      </span>
    </Link>
  );
}
