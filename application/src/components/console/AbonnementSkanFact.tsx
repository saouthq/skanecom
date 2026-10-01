import {
  PERIODES, jourLisible, lienEcran, montant, objetLisible, prixHT,
  type ConfigSkanFact, type ContratSkanFact, type Lecture,
} from "@/lib/console/skanfact";
import { Icone } from "./Icone";

/* L'ABONNEMENT D'UNE BOUTIQUE (onglet Facturation, brique 130 de SkanFact) —
   le contrat de « Facturation récurrente » de son client : suivi (prix,
   période, prochaine et dernière facture, refus de SkanFact, suspendre,
   reprendre), ou à créer, ou à reprendre parmi les contrats déjà faits à
   l'écran de SkanFact. */

export type ValeursAbonnement = { objet?: string; designation?: string; prix?: string; tva?: string; periode?: string; prochaine?: string; emettre_seul?: string };

const JOUR = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis", year: "numeric", month: "2-digit", day: "2-digit" });

/** Le premier jour du mois prochain, à Tunis (la première facture proposée). */
function moisProchain(maintenant: Date): string {
  const [a, m] = JOUR.format(maintenant).split("-").map(Number);
  return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
}

function Contrat({ k, config, suivi }: { k: ContratSkanFact; config: ConfigSkanFact; suivi: boolean }) {
  const l = k.lignes[0];
  return (
    <div className="fa-contrat">
      <div className="fa-contrat-tete">
        <b className="fa-contrat-objet">{objetLisible(k.objet)}</b>
        <span className={`ui-etat ui-etat-point ${k.actif ? "ui-etat-vert" : "ui-etat-ambre"}`}>{k.actif ? "Actif" : "Suspendu"}</span>
      </div>
      <dl className="liste-def fa-fiche">
        {l ? (
          <div>
            <dt>Prix</dt>
            <dd className="tabular-nums">
              {montant(prixHT(l.prixUnitaire))} HT{k.lignes.length > 1 ? ` + ${k.lignes.length - 1} ligne${k.lignes.length > 2 ? "s" : ""}` : ""} · TVA {l.tauxTva} %
            </dd>
          </div>
        ) : null}
        <div><dt>Rythme</dt><dd>{PERIODES[k.periode] ?? k.periode}, le {k.jour}</dd></div>
        <div><dt>Prochaine facture</dt><dd className="tabular-nums">{k.actif ? jourLisible(k.prochaine) : "— (suspendu)"}</dd></div>
        <div><dt>Dernière</dt><dd className="tabular-nums">{k.derniere ? jourLisible(k.derniere) : "aucune encore"}</dd></div>
      </dl>
      <p className="aide">
        {k.emettreSeul
          ? "« Émise seule » : SkanFact émet chaque facture à sa date ; la signature et l'envoi à la TTN restent à faire dans SkanFact."
          : "Brouillon : à chaque échéance, SkanFact prépare la facture ; une personne l'émet dans SkanFact."}
      </p>
      {k.refus ? (
        <p className="fa-retard" role="alert">
          <Icone nom="alerte" taille={16} />
          <span>La facture du {jourLisible(k.refus.echeance)} n&apos;a pas pu être émise : {k.refus.motif}</span>
        </p>
      ) : null}
      {suivi && lienEcran(config, k.ecran) ? (
        <a className="btn btn-fantome fa-contrat-ecran" href={lienEcran(config, k.ecran) ?? undefined} target="_blank" rel="noopener">
          Le modifier dans SkanFact <Icone nom="externe" taille={14} />
        </a>
      ) : null}
    </div>
  );
}

export function AbonnementSkanFact({ base, config, nom, suivi, contrats, valeurs, maintenant }: {
  base: string;
  config: ConfigSkanFact;
  nom: string;
  suivi: string | null;
  contrats: Lecture<ContratSkanFact[]>;
  valeurs: ValeursAbonnement;
  maintenant: Date;
}) {
  const liste = contrats.ok ? contrats.donnees : [];
  const contrat = suivi ? liste.find((k) => k.id === suivi) ?? null : null;
  const autres = liste.filter((k) => k.id !== suivi);
  const action = `${base}/abonnement`;
  const enErreur = valeurs.objet !== undefined;

  return (
    <section className="carte" aria-labelledby="t-fa-abonnement">
      <div className="carte-tete">
        <div>
          <h2 id="t-fa-abonnement" className="carte-titre-icone"><Icone nom="horloge" /> Abonnement</h2>
          <p>
            {suivi
              ? "Le contrat de Facturation récurrente de ce client, dans SkanFact."
              : `L'abonnement de ${nom} : un contrat de Facturation récurrente au nom de son client, dans SkanFact.`}
          </p>
        </div>
      </div>

      {!contrats.ok ? <p className="message message-erreur" role="alert">Contrats illisibles : {contrats.raison}.</p> : null}

      {suivi && contrats.ok && !contrat ? (
        <div className="pile">
          <p className="message message-erreur" role="alert">Le contrat suivi n&apos;existe plus dans SkanFact.</p>
          <form action={action} method="post">
            <button type="submit" name="geste" value="oublier" className="btn btn-second">Ne plus le suivre</button>
          </form>
        </div>
      ) : null}

      {contrat ? (
        <div className="pile">
          <Contrat k={contrat} config={config} suivi />
          <div className="fa-gestes">
            <form action={action} method="post">
              {contrat.actif ? (
                <button type="submit" name="geste" value="suspendre" className="btn btn-second">Suspendre l&apos;abonnement</button>
              ) : (
                <button type="submit" name="geste" value="reprendre" className="btn btn-primaire">Reprendre l&apos;abonnement</button>
              )}
            </form>
            <details className="fa-delier">
              <summary className="btn btn-fantome">Ne plus le suivre</summary>
              <form action={action} method="post" className="pile">
                <p className="aide">La console oublie ce contrat ; dans SkanFact, il continue tel quel (pour l&apos;arrêter, suspendez-le d&apos;abord).</p>
                <button type="submit" name="geste" value="oublier" className="btn btn-danger">Ne plus suivre ce contrat</button>
              </form>
            </details>
          </div>
        </div>
      ) : null}

      {!suivi && autres.length ? (
        <div className="pile fa-existants">
          <p className="aide">
            {autres.length > 1 ? `Ce client a déjà ${autres.length} contrats dans SkanFact.` : "Ce client a déjà un contrat dans SkanFact."}{" "}
            Si c&apos;est l&apos;abonnement de {nom}, la console le suivra.
          </p>
          {autres.map((k) => (
            <div key={k.id} className="pile">
              <Contrat k={k} config={config} suivi={false} />
              <form action={action} method="post">
                <input type="hidden" name="contrat" value={k.id} />
                <button type="submit" name="geste" value="reprendre-contrat" className="btn btn-second">C&apos;est son abonnement</button>
              </form>
            </div>
          ))}
        </div>
      ) : null}

      {!suivi && contrats.ok ? (
        <details className="fa-creer" open={autres.length === 0 || enErreur}>
          <summary className="btn btn-second">
            <Icone nom="plus" taille={16} /> {autres.length ? "Créer un autre contrat" : "Créer son abonnement"}
          </summary>
          <form action={action} method="post" className="formulaire fa-formulaire">
            <input type="hidden" name="geste" value="creer" />
            <div className="champ">
              <label htmlFor="fa-objet">Objet des factures</label>
              <input id="fa-objet" name="objet" required maxLength={300} defaultValue={valeurs.objet ?? `Abonnement de la boutique ${nom} — {mois} {annee}`} />
              <p className="aide">« {"{mois}"} » et « {"{annee}"} » deviennent le mois et l&apos;année de chaque facture.</p>
            </div>
            <div className="champ">
              <label htmlFor="fa-designation">Désignation de la ligne</label>
              <input id="fa-designation" name="designation" required maxLength={300} defaultValue={valeurs.designation ?? "Abonnement à la plateforme SkanEcom"} />
            </div>
            <div className="deux-colonnes">
              <div className="champ">
                <label htmlFor="fa-prix">Prix HT (DT)</label>
                <input id="fa-prix" name="prix" required inputMode="decimal" autoComplete="off" placeholder="75,000"
                  pattern="\d{1,9}([.,]\d{1,3})?" defaultValue={valeurs.prix ?? ""} />
              </div>
              <div className="champ">
                <label htmlFor="fa-tva">TVA</label>
                <select id="fa-tva" name="tva" className="entree" defaultValue={valeurs.tva ?? "19"}>
                  {["19", "13", "7", "0"].map((t) => <option key={t} value={t}>{t} %</option>)}
                </select>
              </div>
              <div className="champ">
                <label htmlFor="fa-periode">Période</label>
                <select id="fa-periode" name="periode" className="entree" defaultValue={valeurs.periode ?? "mois"}>
                  {(Object.keys(PERIODES) as ContratSkanFact["periode"][]).map((p) => (
                    <option key={p} value={p}>{PERIODES[p].replace(/^chaque /, "").replace(/^./, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div className="champ">
                <label htmlFor="fa-prochaine">Première facture le</label>
                <input id="fa-prochaine" name="prochaine" type="date" required defaultValue={valeurs.prochaine ?? moisProchain(maintenant)} />
              </div>
            </div>
            <label className="choix-carte">
              <input type="checkbox" name="emettre_seul" value="1" defaultChecked={valeurs.emettre_seul !== "0"} />
              <span>
                <b>Émise seule</b>
                <span className="aide">SkanFact émet chaque facture à sa date, sans attendre une personne. La signature et l&apos;envoi à la TTN restent à faire dans SkanFact.</span>
              </span>
            </label>
            <button type="submit" className="btn btn-primaire">Créer l&apos;abonnement dans SkanFact</button>
          </form>
        </details>
      ) : null}
    </section>
  );
}
