"use client";

import { useId, useState } from "react";
import { formateMontant } from "@/lib/prix";
import { millimes } from "@/lib/console/import";
import { joursDepuis, type ColisARecevoir } from "@/lib/gestion/encaissements";

/* ============================================================================
   UN VERSEMENT D'UN LIVREUR — les colis qu'il couvre (tous cochés : le cas
   courant est « il a tout reversé »), le montant reçu (proposé : l'attendu),
   la date et la référence du virement. L'écart se lit pendant la saisie :
   « −5,000 TND » en rouge si le livreur a retenu des frais ou oublié un colis.

   Un formulaire HTML ordinaire (la base recalcule tout) ; sans JavaScript,
   tout est coché et le montant est à saisir.
   ========================================================================== */

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Africa/Tunis" });

export function FormVersement({
  action,
  transporteur,
  commandes,
  aujourdhui,
  maintenant,
}: {
  action: string;
  transporteur: string | null;
  commandes: ColisARecevoir[];
  /** AAAA-MM-JJ, à l'heure de Tunis : la date proposée, et la plus tardive. */
  aujourdhui: string;
  /** L'heure du rendu serveur (ms) : les « il y a N j » ne bougent pas à l'hydratation. */
  maintenant: number;
}) {
  const id = useId();
  const [coches, setCoches] = useState<Set<string>>(() => new Set(commandes.map((c) => c.numero)));
  const [saisi, setSaisi] = useState<string | null>(null);
  const attendu = commandes.filter((c) => coches.has(c.numero)).reduce((s, c) => s + c.total_millimes, 0);
  const affiche = saisi ?? (attendu > 0 ? formateMontant(attendu) : "");
  const recu = millimes(affiche);
  const lisible = recu !== null && !Number.isNaN(recu);
  const ecart = lisible ? recu - attendu : null;
  const n = coches.size;
  const tous = n === commandes.length;

  const bascule = (numero: string) =>
    setCoches((avant) => {
      const apres = new Set(avant);
      if (apres.has(numero)) apres.delete(numero);
      else apres.add(numero);
      return apres;
    });

  return (
    <form method="post" action={action} className="ec-form">
      <input type="hidden" name="transporteur" value={transporteur ?? ""} />
      <div className="ec-colis-tete">
        <label className="ec-tout">
          <input
            type="checkbox"
            checked={tous}
            ref={(el) => {
              if (el) el.indeterminate = n > 0 && !tous;
            }}
            onChange={() => setCoches(tous ? new Set() : new Set(commandes.map((c) => c.numero)))}
          />
          {n} colis sur {commandes.length}
        </label>
      </div>
      <ul className="ec-colis">
        {commandes.map((c) => {
          const j = joursDepuis(c.livree_le, maintenant);
          return (
            <li key={c.numero}>
              <label className="ec-colis-ligne" data-coche={coches.has(c.numero) ? "" : undefined}>
                <input type="checkbox" name="numeros" value={c.numero} checked={coches.has(c.numero)} onChange={() => bascule(c.numero)} />
                <span className="ec-colis-qui">
                  <b className="tabular-nums">{c.numero}</b>
                  <span>{c.client}{c.ville ? ` · ${c.ville}` : ""}</span>
                </span>
                <span className="ec-colis-quand" data-ancien={j >= 7 ? "" : undefined}>
                  {c.livree_le ? `livré le ${JOUR.format(new Date(c.livree_le))}` : "livré"}
                  {j >= 1 ? <span className="discret"> · il y a {j} j</span> : null}
                </span>
                <span className="ec-colis-montant tabular-nums">{formateMontant(c.total_millimes)} <span className="discret">TND</span></span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="ec-saisie">
        <div className="champ">
          <label htmlFor={`${id}-recu`}>Montant reçu <span className="facultatif">TND</span></label>
          <input id={`${id}-recu`} className="tabular-nums" name="recu" inputMode="decimal" autoComplete="off" required
                 value={affiche} onChange={(e) => setSaisi(e.target.value)} aria-describedby={`${id}-bilan`} />
        </div>
        <div className="champ">
          <label htmlFor={`${id}-le`}>Reçu le</label>
          <input id={`${id}-le`} type="date" name="recu_le" defaultValue={aujourdhui} max={aujourdhui} required />
        </div>
        <div className="champ ec-reference">
          <label htmlFor={`${id}-ref`}>Référence <span className="facultatif">(facultatif)</span></label>
          <input id={`${id}-ref`} name="reference" maxLength={80} placeholder="N° du virement, du bordereau…" />
        </div>
      </div>

      <div className="ec-pied">
        <p id={`${id}-bilan`} className="ec-bilan" aria-live="polite">
          <span>Attendu <b className="tabular-nums">{formateMontant(attendu)}</b></span>
          <span>Reçu <b className="tabular-nums">{lisible ? formateMontant(recu) : "—"}</b></span>
          <span className="ec-ecart" data-sens={ecart === null || ecart === 0 ? "nul" : ecart < 0 ? "moins" : "plus"}>
            {ecart === null ? "Écart —" : ecart === 0 ? "Le compte est bon" : `Écart ${ecart > 0 ? "+" : ""}${formateMontant(ecart)} TND`}
          </span>
        </p>
        <button type="submit" className="btn btn-primaire" disabled={n === 0}>
          Enregistrer le versement{n > 0 ? ` (${n} colis)` : ""}
        </button>
      </div>
    </form>
  );
}
