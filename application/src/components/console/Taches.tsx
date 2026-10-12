import { Icone } from "./Icone";
import { dateJournal } from "@/lib/console/libelles";
import { ilYa } from "@/lib/console/pilotage";

/* ============================================================================
   LES TÂCHES DE FOND (État technique) — ce qui tourne seul : le passage de
   l'heure (la surveillance), puis les files d'envoi de toutes les boutiques.
   Pour chacune : son rythme, son dernier tour (quand, ce qui est parti, ce
   qui a échoué), sa journée, ce qui attend. Un super-administrateur lance un
   tour à la main.
   ========================================================================== */

type Tour = { debut: string; fin: string; ok: boolean; faits: number; echecs: number; restants: number; detail: string | null; declencheur: "heure" | "console" };
type TacheLue = { tache: "courriels" | "skanfact"; dernier: Tour | null; derniere_heure: string | null; tours_24h: number; faits_24h: number; echecs_24h: number; en_file: number; dus: number };
export type DonneesTaches = {
  taches: TacheLue[];
  surveillance: { debut: string; fin: string | null; declencheur: string; verifies: number; defauts: number } | null;
};
type Niveau = "ok" | "attention" | "panne" | "neutre";

const NOMS: Record<TacheLue["tache"], { nom: string; rythme: string; unite: [string, string] }> = {
  courriels: { nom: "E-mails de commande", rythme: "chaque heure, et à chaque commande", unite: ["e-mail", "e-mails"] },
  skanfact: { nom: "Envois à SkanFact", rythme: "chaque heure, et à chaque geste du backoffice", unite: ["envoi", "envois"] },
};
const PASTILLE: Record<Niveau, string> = {
  ok: "ui-etat ui-etat-point ui-etat-vert", attention: "ui-etat ui-etat-point ui-etat-ambre",
  panne: "ui-etat ui-etat-point ui-etat-rouge", neutre: "ui-etat ui-etat-point",
};
const n = (x: number, [un, plusieurs]: [string, string]) => `${x.toLocaleString("fr-FR")} ${x > 1 ? plusieurs : un}`;
const DEUX_HEURES = 2 * 3600_000;

/** Ce qu'il faut regarder dans les tâches de fond (pour le verdict en tête de l'État). */
export function pointsTaches(d: DonneesTaches, maintenant: number): { niveau: "attention" | "panne"; texte: string }[] {
  const out: { niveau: "attention" | "panne"; texte: string }[] = [];
  for (const t of d.taches) {
    const nom = NOMS[t.tache].nom;
    if (t.dernier && !t.dernier.ok) out.push({ niveau: "attention", texte: `${nom} : le dernier tour a cassé (« ${t.dernier.detail ?? "sans détail"} »).` });
    if (t.dus && t.derniere_heure && maintenant - new Date(t.derniere_heure).getTime() > DEUX_HEURES) {
      out.push({ niveau: "attention", texte: `${nom} : ${n(t.dus, NOMS[t.tache].unite)} ${t.dus > 1 ? "dus" : "dû"}, et le tour de l'heure ne passe plus.` });
    }
    if (t.echecs_24h) out.push({ niveau: "attention", texte: `${nom} : ${n(t.echecs_24h, ["échec", "échecs"])} ces 24 heures.` });
  }
  return out;
}

function etatDe(t: TacheLue, maintenant: number): { niveau: Niveau; mot: string } {
  if (!t.dernier) return { niveau: "neutre", mot: "Pas encore de tour" };
  if (!t.dernier.ok) return { niveau: "panne", mot: "Le dernier tour a cassé" };
  if (t.dus && t.derniere_heure && maintenant - new Date(t.derniere_heure).getTime() > DEUX_HEURES) return { niveau: "attention", mot: "Muette" };
  if (t.echecs_24h) return { niveau: "attention", mot: "Des échecs" };
  return { niveau: "ok", mot: "En marche" };
}

export function CarteTaches({ d, maintenant, superAdmin, message }: { d: DonneesTaches; maintenant: number; superAdmin: boolean; message: React.ReactNode }) {
  const etats = d.taches.map((t) => etatDe(t, maintenant));
  const niveau: Niveau = etats.some((e) => e.niveau === "panne") ? "panne" : etats.some((e) => e.niveau === "attention") ? "attention"
    : etats.every((e) => e.niveau === "neutre") ? "neutre" : "ok";
  const sv = d.surveillance;
  return (
    <section className="carte et-carte et-large" aria-labelledby="t-taches" data-niveau={niveau}>
      <header className="et-tete">
        <h2 id="t-taches" className="carte-titre-icone"><Icone nom="refaire" /> Tâches de fond</h2>
        <span className={PASTILLE[niveau]}>{niveau === "panne" ? "Une tâche casse" : niveau === "attention" ? "À regarder" : niveau === "neutre" ? "Pas encore tournées" : "En marche"}</span>
      </header>
      {message}
      <p className="aide et-alertes-regle">
        Ce qui tourne seul, chaque heure : la surveillance des vitrines, puis les files d&apos;envoi de toutes les boutiques — ce qui
        n&apos;est pas parti à la commande part ici, dans un temps borné ; le reste, au tour suivant. Gardé 14 jours.
      </p>
      <ul className="tf-liste" role="list">
        <li>
          <div className="tf-nom">
            <b>Surveillance des vitrines</b>
            <span className="aide">chaque heure (le déclencheur planifié du Worker)</span>
          </div>
          <div className="tf-tour">
            {sv ? <span className="tf-ligne">{ilYa(sv.debut, maintenant)} · {sv.verifies.toLocaleString("fr-FR")} points vérifiés{sv.defauts ? <>, <b className="et-manque">{n(sv.defauts, ["défaut", "défauts"])}</b></> : ", aucun défaut"}
              <span className="aide"> · {sv.declencheur === "heure" ? "celui de l'heure" : "demandé depuis la console"}</span></span> : <span className="discret">aucun passage</span>}
          </div>
          <div className="tf-etat"><a href="#t-surveillance" className="btn-lien aide">Le détail</a></div>
        </li>
        {d.taches.map((t, i) => {
          const nom = NOMS[t.tache];
          const e = etats[i];
          return (
            <li key={t.tache} data-tache={t.tache}>
              <div className="tf-nom">
                <b>{nom.nom}</b>
                <span className="aide">{nom.rythme}</span>
              </div>
              <div className="tf-tour">
                {t.dernier ? (
                  <>
                    <span className="tf-ligne">
                      <span title={`du ${dateJournal(t.dernier.debut)} au ${dateJournal(t.dernier.fin)}`}>{ilYa(t.dernier.debut, maintenant)}</span>
                      {" · "}{t.dernier.faits || t.dernier.echecs ? <>{n(t.dernier.faits, ["parti", "partis"])}{t.dernier.echecs ? <>, <b className="et-manque">{t.dernier.echecs} en échec</b></> : null}</> : "rien de dû"}
                      <span className="aide"> · {t.dernier.declencheur === "heure" ? "celui de l'heure" : "lancé depuis la console"}</span>
                    </span>
                    {t.dernier.detail ? <span className="tf-detail aide">« {t.dernier.detail} »</span> : null}
                  </>
                ) : <span className="discret">aucun tour encore</span>}
                <span className="tf-jour aide">
                  Ces 24 heures : {n(t.tours_24h, ["tour", "tours"])}, {n(t.faits_24h, ["parti", "partis"])}{t.echecs_24h ? `, ${t.echecs_24h} en échec` : ""}
                  {" · "}en file : {t.en_file ? <b>{n(t.en_file, nom.unite)}{t.dus ? ` (${t.dus} ${t.dus > 1 ? "dus" : "dû"} maintenant)` : ""}</b> : "rien"}
                </span>
              </div>
              <div className="tf-etat"><span className={PASTILLE[e.niveau]}>{e.mot}</span></div>
            </li>
          );
        })}
      </ul>
      {superAdmin ? (
        <div className="et-pied">
          <form action="/etat/taches" method="post">
            <button type="submit" className="btn btn-second btn-petit"><Icone nom="refaire" taille={14} /> Faire partir les files maintenant</button>
          </form>
          <p className="aide">Un tour tout de suite, pour toutes les boutiques : ce qui est dû part, le reste attend son heure.</p>
        </div>
      ) : null}
    </section>
  );
}
