"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

/* L'heure qu'il est chez la maison (Tunis : toute la Tunisie a la même), à
   côté de son lieu, en haut de l'ouverture du Studio. Rendue après
   l'hydratation (le serveur n'a pas l'heure du visiteur), elle se met à jour
   chaque minute ; les deux points battent doucement. */
const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });

export function HeureLocale({ lieu }: { lieu: string }) {
  const [heure, setHeure] = useState<string | null>(null);
  useEffect(() => {
    const maj = () => setHeure(HEURE.format(new Date()));
    maj();
    const minuterie = window.setInterval(maj, 15_000);
    return () => window.clearInterval(minuterie);
  }, []);
  const [h, m] = (heure ?? "").split(":");
  return (
    <p className="st-heure" aria-label={heure ? t.studio.heureAria(lieu, heure) : undefined}>
      <span className="st-heure-point" aria-hidden="true" />
      <span aria-hidden="true">{lieu}</span>
      {heure ? <span className="st-heure-valeur" aria-hidden="true">{h}<span className="st-heure-deux">:</span>{m}</span> : null}
    </p>
  );
}
