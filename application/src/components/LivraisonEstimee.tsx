"use client";

import { useSyncExternalStore } from "react";
import { Camion } from "./Icones";
import { fenetreLivraison, texteFenetre } from "@/lib/livraison";
import { t } from "@/lib/i18n";

/* « Commandé aujourd'hui, livré entre le jeu. 2 et le mar. 7 oct. » — sous le
   bloc d'achat de la fiche, quand la pièce est en stock. Calculé dans le
   navigateur (la page servie peut dater de quelques minutes, et d'hier
   après minuit) : rien côté serveur, rien à hydrater de travers. */

const rien = () => () => {};

export function LivraisonEstimee({ min, max }: { min: number; max: number }) {
  const client = useSyncExternalStore(rien, () => true, () => false);
  if (!client) return null;
  return (
    <p className="fiche-livraison" title={t.livraison.estimeeAide}>
      <Camion taille={18} />
      <span>{t.livraison.estimee(texteFenetre(fenetreLivraison(min, max)))}</span>
    </p>
  );
}
