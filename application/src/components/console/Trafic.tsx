import { Icone } from "./Icone";
import { dateJournal } from "@/lib/console/libelles";
import { ilYa } from "@/lib/console/pilotage";

/* ============================================================================
   LE TRAFIC (État technique) — ce que Cloudflare a servi : les requêtes de
   l'application heure par heure sur 24 heures (une barre par heure, le
   détail au survol et dans le tableau), les erreurs et leur taux, le temps
   de calcul, les 7 derniers jours ; sur l'aperçu, chaque adresse (son
   routeur). Lu chaque heure chez Cloudflare, avec une clé en lecture seule.
   ========================================================================== */

type Heure = { heure: string; requetes: number; erreurs: number; cpu_p50: number | null; cpu_p99: number | null };
export type DonneesTrafic = {
  lecture: { mode: "reel" | "local" | "aucun"; ok: boolean | null; detail: string | null; le: string; dernier_ok_le: string | null } | null;
  heures: Heure[];
  jour: { requetes: number; erreurs: number; cpu_p50: number | null; cpu_p99: number | null };
  semaine: { requetes: number; erreurs: number };
  scripts: { script: string; principal: boolean; requetes: number; erreurs: number }[];
};
type Niveau = "ok" | "attention" | "panne" | "neutre";

const NOMBRE = new Intl.NumberFormat("fr-FR");
const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", timeZone: "Africa/Tunis" });
// « 14 h » : le format français porte déjà le « h ».
const heureDe = (iso: string) => HEURE.format(new Date(iso));
const taux = (erreurs: number, requetes: number) => (requetes > 0 ? (erreurs / requetes) * 100 : 0);
const pourcent = (x: number) => `${x.toLocaleString("fr-FR", { maximumFractionDigits: x < 1 ? 2 : 1 })} %`;
const msDe = (x: number | null) => (x === null ? "—" : `${x.toLocaleString("fr-FR", { maximumFractionDigits: x < 10 ? 1 : 0 })} ms`);
// Un taux d'erreur au-delà : à regarder, puis en panne (sur assez de requêtes pour qu'il dise quelque chose).
const SEUIL_ATTENTION = 1;
const SEUIL_PANNE = 5;
const MINIMUM = 100;
// Une lecture en ligne plus vieille que trois heures : le relevé ne tourne plus.
const MUETTE_MS = 3 * 3600_000;

/** « skanecom-apercu-maymar » → « apercu-maymar » ; l'application garde son nom. */
const nomScript = (s: string) => s.replace(/^skanecom-/, "");

function niveauDe(d: DonneesTrafic, maintenant: number): Niveau {
  const l = d.lecture;
  if (!l || l.mode === "aucun") return "neutre";
  if (l.ok === false || (l.mode === "reel" && maintenant - new Date(l.le).getTime() > MUETTE_MS)) return "attention";
  const t = taux(d.jour.erreurs, d.jour.requetes);
  if (d.jour.requetes >= MINIMUM && t >= SEUIL_PANNE) return "panne";
  if (d.jour.requetes >= MINIMUM && t >= SEUIL_ATTENTION) return "attention";
  return "ok";
}

/** Ce qu'il faut regarder (le verdict en tête de l'État). */
export function pointsTrafic(d: DonneesTrafic, maintenant: number): { niveau: "attention" | "panne"; texte: string }[] {
  const l = d.lecture;
  if (!l || l.mode === "aucun") return [];
  const points: { niveau: "attention" | "panne"; texte: string }[] = [];
  if (l.ok === false) points.push({ niveau: "attention", texte: `Le trafic ne se lit plus chez Cloudflare : ${l.detail ?? "sans réponse"}${l.dernier_ok_le ? ` (dernière lecture réussie le ${dateJournal(l.dernier_ok_le)})` : ""}.` });
  else if (l.mode === "reel" && maintenant - new Date(l.le).getTime() > MUETTE_MS) points.push({ niveau: "attention", texte: `Le relevé du trafic ne tourne plus (dernière lecture ${ilYa(l.le, maintenant)}).` });
  const t = taux(d.jour.erreurs, d.jour.requetes);
  if (d.jour.requetes >= MINIMUM && t >= SEUIL_ATTENTION) {
    points.push({ niveau: t >= SEUIL_PANNE ? "panne" : "attention", texte: `${pourcent(t)} des requêtes finissent en erreur sur 24 heures (${NOMBRE.format(d.jour.erreurs)} sur ${NOMBRE.format(d.jour.requetes)}).` });
  }
  return points;
}

const PASTILLE: Record<Niveau, string> = {
  ok: "ui-etat ui-etat-point ui-etat-vert", attention: "ui-etat ui-etat-point ui-etat-ambre",
  panne: "ui-etat ui-etat-point ui-etat-rouge", neutre: "ui-etat ui-etat-point",
};
const MODE = { reel: "lu chez Cloudflare", local: "simulé en local", aucun: "non branché" } as const;

/** La graduation de l'axe : un nombre rond au-dessus du maximum. */
function plafond(max: number): number {
  if (max <= 10) return 10;
  const pas = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / pas) * pas;
}

export function CarteTrafic({ d, branche, maintenant, message, peutRelire }: {
  d: DonneesTrafic;
  /** La clé est-elle posée (CLOUDFLARE_TRAFIC) ? Lue par la page, pas par la base. */
  branche: boolean;
  maintenant: number;
  message: React.ReactNode;
  peutRelire: boolean;
}) {
  const l = branche ? d.lecture : null;
  const niveau = branche ? niveauDe(d, maintenant) : "neutre";
  const haut = plafond(Math.max(0, ...d.heures.map((h) => h.requetes)));
  const tJour = taux(d.jour.erreurs, d.jour.requetes);
  const vide = d.heures.every((h) => h.requetes === 0);
  return (
    <section className="carte et-carte et-large" aria-labelledby="t-trafic" data-niveau={niveau}>
      <header className="et-tete">
        <h2 id="t-trafic" className="carte-titre-icone"><Icone nom="graphique" /> Trafic</h2>
        <span className={PASTILLE[niveau]}>
          {niveau === "panne" ? "Trop d'erreurs" : niveau === "attention" ? "À regarder" : niveau === "ok" ? "Normal" : branche ? "Pas encore lu" : "Non branché"}
        </span>
      </header>
      {message}
      <p className="aide et-alertes-regle">
        Ce que Cloudflare a servi : les requêtes de l&apos;application, ses erreurs, son temps de calcul. Lu chaque heure, avec une clé en lecture seule.
        {l && l.mode !== "aucun" ? <> Dernière lecture {ilYa(l.le, maintenant)} ({MODE[l.mode]}).</> : null}
      </p>

      {!branche ? (
        <p className="tr-vide">
          Non branché : il faut une clé Cloudflare « Account Analytics: Read » (secret <code>CLOUDFLARE_TRAFIC</code> = <code>compte:&lt;id du compte&gt;:&lt;jeton&gt;</code>).
        </p>
      ) : !l ? (
        <p className="tr-vide">Pas encore lu : le passage de l&apos;heure le fera, ou « Relire maintenant ».</p>
      ) : (
        <>
          {l.ok === false ? (
            <p className="message message-erreur" role="status">
              {l.detail ?? "Cloudflare ne répond pas."}{l.dernier_ok_le ? ` Dernière lecture réussie le ${dateJournal(l.dernier_ok_le)} : les chiffres ci-dessous datent de là.` : ""}
            </p>
          ) : null}
          <dl className="tr-chiffres">
            <div><dt>Requêtes, 24 heures</dt><dd>{NOMBRE.format(d.jour.requetes)}</dd></div>
            <div data-niveau={d.jour.requetes >= MINIMUM && tJour >= SEUIL_ATTENTION ? (tJour >= SEUIL_PANNE ? "panne" : "attention") : undefined}>
              <dt>Erreurs, 24 heures</dt>
              <dd>{NOMBRE.format(d.jour.erreurs)} <span className="tr-taux">{d.jour.requetes ? pourcent(tJour) : "—"}</span></dd>
            </div>
            <div><dt>Calcul, médiane</dt><dd>{msDe(d.jour.cpu_p50)}</dd></div>
            <div><dt>Calcul, 99 % des requêtes</dt><dd>{msDe(d.jour.cpu_p99)}</dd></div>
            <div><dt>Requêtes, 7 jours</dt><dd>{NOMBRE.format(d.semaine.requetes)}</dd></div>
          </dl>

          <figure className="tr-graphique">
            <figcaption className="tr-legende">Requêtes par heure, sur les 24 dernières heures</figcaption>
            {vide ? (
              <p className="tr-vide">Aucune requête lue sur 24 heures.</p>
            ) : (
              <div className="tr-trace" aria-hidden="true">
                <div className="tr-axe">
                  <span>{NOMBRE.format(haut)}</span>
                  <span>{NOMBRE.format(haut / 2)}</span>
                  <span>0</span>
                </div>
                <ol className="tr-barres">
                  {d.heures.map((h, i) => (
                    <li key={h.heure} data-erreurs={h.erreurs > 0 ? "" : undefined}>
                      <span className="tr-barre" style={{ blockSize: `${(h.requetes / haut) * 100}%` }} />
                      <span className="tr-bulle">
                        <b>{heureDe(h.heure)}</b> {NOMBRE.format(h.requetes)} requête{h.requetes > 1 ? "s" : ""}
                        {h.erreurs ? <> · {NOMBRE.format(h.erreurs)} erreur{h.erreurs > 1 ? "s" : ""}</> : null}
                        {h.cpu_p50 !== null ? <> · calcul {msDe(h.cpu_p50)}</> : null}
                      </span>
                      {i % 6 === 0 ? <span className="tr-heure">{heureDe(h.heure)}</span> : null}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </figure>

          <details className="tr-tableau">
            <summary>Heure par heure</summary>
            <div className="defile">
              <table className="tableau">
                <thead><tr><th scope="col">Heure</th><th scope="col">Requêtes</th><th scope="col">Erreurs</th><th scope="col">Calcul (médiane)</th><th scope="col">Calcul (99 %)</th></tr></thead>
                <tbody>
                  {[...d.heures].reverse().map((h) => (
                    <tr key={h.heure}>
                      <td>{heureDe(h.heure)}</td><td>{NOMBRE.format(h.requetes)}</td><td>{NOMBRE.format(h.erreurs)}</td><td>{msDe(h.cpu_p50)}</td><td>{msDe(h.cpu_p99)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {d.scripts.length > 1 ? (
            <div className="tr-scripts">
              <p className="tr-legende">Par Worker, sur 24 heures — l&apos;application, et devant elle un routeur par adresse de l&apos;aperçu</p>
              <ul role="list">
                {d.scripts.map((s) => (
                  <li key={s.script}>
                    <span className="tr-script">{nomScript(s.script)}{s.principal ? <span className="aide"> · l&apos;application</span> : null}</span>
                    <span>{NOMBRE.format(s.requetes)} requête{s.requetes > 1 ? "s" : ""}</span>
                    <span className={s.erreurs ? "et-manque" : "aide"}>{NOMBRE.format(s.erreurs)} erreur{s.erreurs > 1 ? "s" : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <div className="et-pied">
        {peutRelire && branche ? (
          <form action="/etat/trafic" method="post">
            <button type="submit" className="btn btn-second btn-petit"><Icone nom="refaire" taille={14} /> Relire maintenant</button>
          </form>
        ) : null}
        <p className="aide">Une heure qui se remplit encore est relue au tour suivant. Trente jours sont gardés.</p>
      </div>
    </section>
  );
}
