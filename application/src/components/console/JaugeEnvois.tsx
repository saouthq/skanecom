import { niveauQuota, nombre, partJauge, projection, type ConsoCanal, type DonneesConsommation } from "@/lib/console/consommation";

/* La jauge d'un quota d'envois et sa mesure (le chiffre, la jauge, ce qu'il
   reste ou la fin du mois au rythme actuel) : la page Consommation et la
   fiche d'une boutique. */

/** Une jauge : la part du quota, sa couleur dit le niveau ; lue « 1 240 sur 5 000 ». */
export function Jauge({ envoyes, quota, libelle }: { envoyes: number; quota: number; libelle: string }) {
  return (
    <span className="cs-jauge" data-niveau={niveauQuota(envoyes, quota)} role="meter" aria-label={libelle}
      aria-valuemin={0} aria-valuemax={quota} aria-valuenow={Math.min(envoyes, quota)} aria-valuetext={`${nombre(envoyes)} sur ${nombre(quota)}`}>
      <span style={{ inlineSize: `${partJauge(envoyes, quota)}%` }} />
    </span>
  );
}

export function Mesure({ libelle, c, d }: { libelle: string; c: ConsoCanal; d: Pick<DonneesConsommation, "courant" | "jours_ecoules" | "jours_mois"> }) {
  const niveau = niveauQuota(c.envoyes, c.quota);
  const fin = projection(c.envoyes, d);
  return (
    <span className="cs-mesure" data-niveau={niveau}>
      <span className="cs-mesure-tete">
        <span className="cs-canal">{libelle}</span>
        <span className="cs-chiffre"><b>{nombre(c.envoyes)}</b>{c.quota !== null ? <> / {nombre(c.quota)}</> : null}</span>
      </span>
      {c.quota !== null ? <Jauge envoyes={c.envoyes} quota={c.quota} libelle={libelle} /> : <span className="cs-jauge cs-jauge-vide" aria-hidden="true" />}
      <span className="cs-note" data-risque={niveau !== "depasse" && c.quota !== null && fin !== null && fin > c.quota ? "" : undefined}>
        {c.quota === null ? "sans limite fixée"
          : niveau === "depasse" ? `${nombre(c.envoyes - c.quota)} au-delà`
          : fin !== null && fin > c.quota ? `≈\u00a0${nombre(fin)} à la fin du mois`
          : `${nombre(Math.max(0, c.quota - c.envoyes))} restants`}
      </span>
    </span>
  );
}

