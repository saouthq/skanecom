import Link from "next/link";
import { Icone } from "./Icone";
import { dateJournal } from "@/lib/console/libelles";

/* ============================================================================
   LE DÉPANNAGE — les gestes quand quelque chose casse, au même endroit :
   l'État technique (toute la plateforme, et n'importe quelle boutique) et la
   fiche d'une boutique (elle seule). Tout passe par /etat/remede, au journal.
   Un super-administrateur fait tout ; le support peut vider un cache.
   ========================================================================== */

export type DonneesMaintenance = {
  plateforme: { message: string | null; depuis: string; par: string | null } | null;
  boutiques: { id: string; slug: string; nom: string; message: string | null; depuis: string; par: string | null }[];
};
type BoutiqueChoix = { id: string; slug: string; nom: string; demonstration?: boolean };

const Pause = ({ depuis, par, message }: { depuis: string; par: string | null; message: string | null }) => (
  <>depuis le {dateJournal(depuis)}{par ? ` par ${par}` : ""}{message ? <> — « {message} »</> : null}</>
);

function Gestes({ valeur, retour, superAdmin }: { valeur: string; retour: "etat" | "fiche"; superAdmin: boolean }) {
  return (
    <div className="dp-gestes">
      <input type="hidden" name="retour" value={retour} />
      <button type="submit" name="geste" value="cache" className="btn btn-second btn-petit"><Icone nom="refaire" taille={14} /> Vider le cache de la vitrine</button>
      {superAdmin ? (
        <>
          <button type="submit" name="geste" value="courriels" className="btn btn-second btn-petit"><Icone nom="courriel" taille={14} /> Relancer ses e-mails coincés</button>
          <button type="submit" name="geste" value="skanfact" className="btn btn-second btn-petit"><Icone nom="billet" taille={14} /> Relancer ses envois à SkanFact</button>
        </>
      ) : null}
      <input type="hidden" name="boutique" value={valeur} />
    </div>
  );
}

/** La carte de l'État technique : la plateforme, les boutiques en pause, et une boutique au choix. */
export function DepannagePlateforme({ m, boutiques, choisie, superAdmin, message }: {
  m: DonneesMaintenance; boutiques: BoutiqueChoix[]; choisie: string | null; superAdmin: boolean; message: React.ReactNode;
}) {
  const p = m.plateforme;
  return (
    <section className="carte et-carte et-large" aria-labelledby="t-depannage" data-niveau={p ? "panne" : m.boutiques.length ? "attention" : "ok"}>
      <header className="et-tete">
        <h2 id="t-depannage" className="carte-titre-icone"><Icone nom="outil" /> Dépannage</h2>
        <span className={`ui-etat ui-etat-point ${p ? "ui-etat-rouge" : m.boutiques.length ? "ui-etat-ambre" : "ui-etat-vert"}`}>
          {p ? "Plateforme en maintenance" : m.boutiques.length ? `${m.boutiques.length} en maintenance` : "Tout est ouvert"}
        </span>
      </header>
      {message}
      <p className="aide et-alertes-regle">
        Quand quelque chose casse : mettre une vitrine (ou toutes) en pause derrière une page d&apos;attente le temps d&apos;intervenir,
        vider son cache, relancer ses envois coincés. Chaque geste passe au journal.
      </p>

      {m.boutiques.length ? (
        <>
          <h3 className="et-sous-titre">Boutiques en maintenance</h3>
          <ul className="dp-liste" role="list">
            {m.boutiques.map((b) => (
              <li key={b.id}>
                <p><Link href={`/boutiques/${b.slug}#t-depannage`}><b>{b.nom}</b></Link> <span className="aide"><Pause {...b} /></span></p>
                {superAdmin ? (
                  <form action="/etat/remede" method="post">
                    <input type="hidden" name="boutique" value={`${b.id}:${b.slug}`} />
                    <button type="submit" name="geste" value="rouvrir" className="btn btn-second btn-petit">Rouvrir</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3 className="et-sous-titre">Une boutique</h3>
      <form action="/etat/remede" method="post" className="formulaire dp-boutique">
        <div className="champ">
          <label htmlFor="dp-boutique">La boutique</label>
          <select id="dp-boutique" name="boutique" defaultValue={boutiques.find((b) => b.slug === choisie) ? `${boutiques.find((b) => b.slug === choisie)!.id}:${choisie}` : ""} required>
            <option value="" disabled>Choisir…</option>
            {boutiques.map((b) => <option key={b.id} value={`${b.id}:${b.slug}`}>{b.nom}{b.demonstration ? " (démonstration)" : ""}</option>)}
          </select>
        </div>
        <div className="dp-gestes">
          <input type="hidden" name="retour" value="etat" />
          <button type="submit" name="geste" value="cache" className="btn btn-second btn-petit"><Icone nom="refaire" taille={14} /> Vider le cache de la vitrine</button>
          {superAdmin ? (
            <>
              <button type="submit" name="geste" value="courriels" className="btn btn-second btn-petit"><Icone nom="courriel" taille={14} /> Relancer ses e-mails coincés</button>
              <button type="submit" name="geste" value="skanfact" className="btn btn-second btn-petit"><Icone nom="billet" taille={14} /> Relancer ses envois à SkanFact</button>
              <button type="submit" name="geste" value="maintenance" className="btn btn-second btn-petit"><Icone nom="outil" taille={14} /> Mettre sa vitrine en maintenance</button>
            </>
          ) : null}
        </div>
      </form>

      <h3 className="et-sous-titre">Toute la plateforme</h3>
      {p ? (
        <form action="/etat/remede" method="post" className="dp-ligne" data-pause="">
          <p><b>En maintenance</b> <Pause {...p} />. Chaque vitrine montre la page d&apos;attente ; les backoffices et la console restent ouverts.</p>
          {superAdmin ? <button type="submit" name="geste" value="rouvrir" className="btn btn-primaire btn-petit">Rouvrir la plateforme</button> : null}
        </form>
      ) : superAdmin ? (
        // Toutes les vitrines d'un coup : un second geste le confirme.
        <details className="bt-confirmer dp-confirmer" data-reste-ouvert>
          <summary className="btn btn-second btn-petit">Mettre toute la plateforme en maintenance…</summary>
          <form action="/etat/remede" method="post" className="bt-confirmer-panneau formulaire dp-pause" role="group" aria-label="Confirmer la maintenance de toute la plateforme">
            <p>Toutes les vitrines répondent une page d&apos;attente (HTTP 503), le tunnel de commande compris. L&apos;aperçu de l&apos;équipe passe toujours ;
              les backoffices et la console restent ouverts ; la surveillance ne compte pas ces pages comme des pannes.</p>
            <div className="champ">
              <label htmlFor="dp-message-plateforme">Le mot de la page d&apos;attente <span className="facultatif">(facultatif)</span></label>
              <input id="dp-message-plateforme" name="message" maxLength={300} placeholder="Une mise à jour : de retour vers 14 h." />
            </div>
            <button type="submit" name="geste" value="maintenance" className="btn btn-danger btn-petit">Confirmer : toutes les vitrines en pause</button>
          </form>
        </details>
      ) : <p className="discret">Ouverte. Un super-administrateur peut la mettre en maintenance.</p>}
    </section>
  );
}

/** Le dépannage d'une boutique, sur sa fiche. */
export function DepannageBoutique({ b, pause, superAdmin, message }: {
  b: { id: string; slug: string }; pause: DonneesMaintenance["boutiques"][number] | null; superAdmin: boolean; message: React.ReactNode;
}) {
  const valeur = `${b.id}:${b.slug}`;
  return (
    <section className="carte" aria-labelledby="t-depannage" id="depannage">
      <div className="carte-tete">
        <div>
          <h2 id="t-depannage" className="carte-titre-icone"><Icone nom="outil" /> Dépannage</h2>
          <p>Quand sa vitrine casse : la mettre en pause derrière une page d&apos;attente, vider son cache, relancer ses envois coincés.</p>
        </div>
        {pause ? <span className="ui-etat ui-etat-point ui-etat-ambre">En maintenance</span> : null}
      </div>
      {message}
      {pause ? (
        <form action="/etat/remede" method="post" className="dp-ligne" data-pause="">
          <input type="hidden" name="boutique" value={valeur} />
          <input type="hidden" name="retour" value="fiche" />
          <p><b>Sa vitrine est en maintenance</b> <Pause {...pause} />. Ses clients voient la page d&apos;attente.</p>
          {superAdmin ? <button type="submit" name="geste" value="rouvrir" className="btn btn-primaire btn-petit">Rouvrir sa vitrine</button> : null}
        </form>
      ) : superAdmin ? (
        <form action="/etat/remede" method="post" className="formulaire dp-pause">
          <input type="hidden" name="boutique" value={valeur} />
          <input type="hidden" name="retour" value="fiche" />
          <div className="champ">
            <label htmlFor="dp-message">Le mot de la page d&apos;attente <span className="facultatif">(facultatif)</span></label>
            <input id="dp-message" name="message" maxLength={300} placeholder="Inventaire en cours : de retour à 14 h." />
          </div>
          <div className="dp-pause-pied">
            <button type="submit" name="geste" value="maintenance" className="btn btn-danger btn-petit">Mettre sa vitrine en maintenance</button>
            <p className="aide">Le backoffice reste ouvert ; l&apos;aperçu de l&apos;équipe passe toujours.</p>
          </div>
        </form>
      ) : null}
      <form action="/etat/remede" method="post">
        <Gestes valeur={valeur} retour="fiche" superAdmin={superAdmin} />
      </form>
    </section>
  );
}
