import Link from "next/link";
import { Icone, type NomIcone } from "./Icone";
import { dateJournal } from "@/lib/console/libelles";
import { detailJournal, libelleAction } from "@/lib/console/journal";
import { VERSION } from "@/lib/version";

/* ============================================================================
   LA CHRONOLOGIE — « qu'est-ce qui a changé juste avant que ça casse ? »
   (public.console_chronologie). La version en ligne et si la base la suit ;
   puis, d'un seul fil, jour par jour : les mises en ligne, les changements
   de configuration, les pannes et leurs retours, les erreurs apparues. Pour
   une boutique : les siens, et ce qui touche toute la plateforme.
   ========================================================================== */

type BoutiqueFil = { slug: string; nom: string; demonstration: boolean } | null;
export type Evenement =
  | { genre: "version"; quand: string; version: string; titre: string | null; construite_le: string | null; migration: string | null; retour: boolean }
  | { genre: "changement"; quand: string; action: string; cible: string | null; qui: string | null; boutique: BoutiqueFil }
  | { genre: "panne"; quand: string; type: string; cible: string; detail: string | null; clos_le: string | null; boutique: BoutiqueFil }
  | { genre: "retabli"; quand: string; type: string; cible: string; ouvert_le: string; boutique: BoutiqueFil }
  | { genre: "erreur"; quand: string; id: number; surface: string; type: string; message: string; route: string | null; nombre: number; reglee: boolean; boutique: BoutiqueFil };
export type MiseEnLigne = { version: string; titre: string | null; construite_le: string | null; migration: string | null; vue_le: string; derniere_vue: string };
export type DonneesChronologie = { jours: number; fil: Evenement[]; total: number; migration_base: string | null; versions: MiseEnLigne[] };
type BoutiqueChoix = { slug: string; nom: string; demonstration?: boolean };

const GENRES: Record<Evenement["genre"], { libelle: string; icone: NomIcone }> = {
  version: { libelle: "Mise en ligne", icone: "importer" },
  changement: { libelle: "Changement", icone: "reglages" },
  panne: { libelle: "Panne", icone: "alerte" },
  retabli: { libelle: "Rétabli", icone: "succes" },
  erreur: { libelle: "Erreur", icone: "croix" },
};
const PANNES: Record<string, string> = {
  page: "Vitrine sans réponse", courriels: "E-mails de commande en attente", skanfact: "Envois à SkanFact en attente",
  domaine_envoi: "Domaine d'envoi non vérifié", erreurs: "Erreurs de l'application en série",
};
const SURFACES: Record<string, string> = { vitrine: "vitrine", backoffice: "backoffice", console: "console", serveur: "serveur" };
const PERIODES = [{ jours: 1, libelle: "24 heures" }, { jours: 7, libelle: "7 jours" }, { jours: 30, libelle: "30 jours" }];

const tunis = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...o, timeZone: "Africa/Tunis" }).format(new Date(iso));
const jourDe = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date(iso));

/** « Aujourd'hui », « Hier », sinon « lundi 12 octobre ». */
function titreJour(jour: string, maintenant: number): string {
  if (jour === jourDe(new Date(maintenant).toISOString())) return "Aujourd'hui";
  if (jour === jourDe(new Date(maintenant - 86_400_000).toISOString())) return "Hier";
  const t = tunis(`${jour}T12:00:00Z`, { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** La base suit-elle le code ? La dernière migration jouée, contre celle que la version attend. */
export function etatBase(attendue: string | null, base: string | null): { niveau: "ok" | "attention" | "panne" | "neutre"; texte: string } {
  if (!attendue || !base) return { niveau: "neutre", texte: base ? `dernière migration ${base}` : "les migrations jouées ne sont pas notées sur cette base" };
  if (base === attendue) return { niveau: "ok", texte: `à jour (migration ${base})` };
  if (base < attendue) return { niveau: "panne", texte: `en retard : la version attend la migration ${attendue}, la base s'arrête à ${base}` };
  return { niveau: "attention", texte: `en avance : la base a la migration ${base}, que cette version ne connaît pas (retour arrière ?)` };
}

function Ligne({ e }: { e: Evenement }) {
  const g = GENRES[e.genre];
  const boutique = "boutique" in e && e.boutique ? <Link href={`/boutiques/${e.boutique.slug}`}>{e.boutique.nom}</Link> : null;
  let quoi: React.ReactNode;
  let detail: React.ReactNode = null;
  switch (e.genre) {
    case "version":
      quoi = <>{e.retour ? "Retour à la version" : "Version"} <code className="ch-code">{e.version}</code> en ligne</>;
      detail = <>{e.titre ? <>« {e.titre} »</> : null}{e.migration ? <> · attend la migration {e.migration}</> : null}</>;
      break;
    case "changement": {
      const d = detailJournal(e.action, e.cible);
      quoi = <>{libelleAction(e.action)}{d ? <span className="ch-detail"> — {d}</span> : null}</>;
      detail = <>{boutique ?? "Toute la plateforme"}{e.qui ? <> · {e.qui}</> : null}</>;
      break;
    }
    case "panne":
      quoi = <>{PANNES[e.type] ?? e.type}{e.type === "page" || e.type === "domaine_envoi" ? <> · <span className="ch-detail">{e.cible}</span></> : null}</>;
      detail = <>{boutique ?? "Plateforme"}{e.detail ? <> · {e.detail}</> : null}{e.clos_le ? <> · rétablie le {dateJournal(e.clos_le)}</> : <> · <b>toujours en cours</b></>}</>;
      break;
    case "retabli":
      quoi = <>{PANNES[e.type] ?? e.type} : rétabli{e.type === "page" || e.type === "domaine_envoi" ? <> · <span className="ch-detail">{e.cible}</span></> : null}</>;
      detail = <>{boutique ?? "Plateforme"} · en panne depuis le {dateJournal(e.ouvert_le)}</>;
      break;
    case "erreur":
      quoi = <>{e.message}</>;
      detail = <>{boutique ?? "Plateforme"} · {SURFACES[e.surface] ?? e.surface}, {e.type === "navigateur" ? "navigateur" : "serveur"}{e.route ? <> · <span className="ch-detail">{e.route}</span></> : null}
        {e.nombre > 1 ? <> · {e.nombre.toLocaleString("fr-FR")} fois</> : null}{e.reglee ? " · réglée" : ""}</>;
      break;
  }
  return (
    <li data-genre={e.genre}>
      <time className="ch-heure" dateTime={e.quand}>{tunis(e.quand, { hour: "2-digit", minute: "2-digit" })}</time>
      <span className="ch-marque" aria-hidden="true"><Icone nom={g.icone} taille={14} /></span>
      <div className="ch-corps">
        <p className="ch-quoi"><span className="ch-genre">{g.libelle}</span> {quoi}</p>
        {detail ? <p className="ch-ou aide">{detail}</p> : null}
      </div>
    </li>
  );
}

/** La carte « Version en ligne » de l'État technique. */
export function CarteVersion({ d }: { d: DonneesChronologie }) {
  const base = etatBase(VERSION.migration, d.migration_base);
  const pastille = base.niveau === "panne" ? "ui-etat-rouge" : base.niveau === "attention" ? "ui-etat-ambre" : base.niveau === "ok" ? "ui-etat-vert" : "";
  const precedentes = d.versions.filter((m, i) => i > 0 || m.version !== VERSION.version).slice(0, 6);
  return (
    <section className="carte et-carte" aria-labelledby="t-version" data-niveau={base.niveau === "neutre" ? "neutre" : base.niveau}>
      <header className="et-tete">
        <h2 id="t-version" className="carte-titre-icone"><Icone nom="importer" /> Version en ligne</h2>
        <span className={`ui-etat ui-etat-point ${pastille}`}>{base.niveau === "panne" ? "Base en retard" : base.niveau === "attention" ? "Base en avance" : base.niveau === "ok" ? "Base à jour" : "En ligne"}</span>
      </header>
      <dl className="et-faits">
        <div><dt>Version</dt><dd><code className="ch-code">{VERSION.version}</code>{VERSION.titre ? <span className="discret"> · {VERSION.titre}</span> : null}</dd></div>
        <div><dt>Construite le</dt><dd>{VERSION.construite_le ? dateJournal(VERSION.construite_le) : <span className="discret">inconnu</span>}</dd></div>
        <div><dt>La base</dt><dd className={base.niveau === "panne" ? "et-manque" : undefined}>{base.texte}</dd></div>
      </dl>
      {base.niveau === "panne" ? (
        <ul className="et-points"><li data-niveau="panne"><Icone nom="alerte" taille={14} /> <span>Le code appelle des fonctions que la base n&apos;a pas encore : jouer les migrations (docs/DEPLOIEMENT.md) avant tout autre geste.</span></li></ul>
      ) : null}
      {precedentes.length ? (
        <>
          <h3 className="et-sous-titre">Mises en ligne précédentes</h3>
          <ul className="ch-versions" role="list">
            {precedentes.map((m) => (
              <li key={`${m.version}-${m.vue_le}`}>
                <code className="ch-code">{m.version}</code>
                <span className="ch-versions-titre">{m.titre ?? <span className="discret">sans titre</span>}</span>
                <span className="aide">le {dateJournal(m.vue_le)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/** La carte « Chronologie » : le fil d'une période, pour toute la plateforme ou une boutique. */
export function CarteChronologie({ d, boutiques, pour, maintenant }: { d: DonneesChronologie; boutiques: BoutiqueChoix[]; pour: BoutiqueChoix | null; maintenant: number }) {
  const jours = new Map<string, Evenement[]>();
  for (const e of d.fil) {
    const j = jourDe(e.quand);
    jours.set(j, [...(jours.get(j) ?? []), e]);
  }
  const pannes = d.fil.filter((e) => e.genre === "panne" && !e.clos_le).length;
  const periode = PERIODES.find((p) => p.jours === d.jours)?.libelle ?? `${d.jours} jours`;
  return (
    <section className="carte et-carte et-large" aria-labelledby="t-chronologie" data-niveau={pannes ? "panne" : "neutre"}>
      <header className="et-tete">
        <h2 id="t-chronologie" className="carte-titre-icone"><Icone nom="horloge" /> Chronologie</h2>
        <span className="ui-etat ui-etat-point">{d.total ? `${d.total.toLocaleString("fr-FR")} sur ${periode}` : `Rien sur ${periode}`}</span>
      </header>
      <p className="aide et-alertes-regle">
        Ce qui a changé, d&apos;un seul fil : les mises en ligne, les réglages, les pannes et leurs retours, les erreurs apparues.
        Quand quelque chose casse, regarder juste au-dessous : ce qui a précédé.
      </p>
      <form method="get" action="/etat#t-chronologie" className="ch-filtres">
        <div className="champ">
          <label htmlFor="ch-periode">Période</label>
          <select id="ch-periode" name="periode" defaultValue={String(d.jours)}>
            {PERIODES.map((p) => <option key={p.jours} value={p.jours}>{p.libelle}</option>)}
          </select>
        </div>
        <div className="champ">
          <label htmlFor="ch-pour">Autour de</label>
          <select id="ch-pour" name="pour" defaultValue={pour?.slug ?? ""}>
            <option value="">Toute la plateforme</option>
            {boutiques.map((b) => <option key={b.slug} value={b.slug}>{b.nom}{b.demonstration ? " (démonstration)" : ""}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-second">Afficher</button>
      </form>
      {pour ? <p className="aide ch-pour">Autour de <b>{pour.nom}</b> : ses changements, ses pannes, ses erreurs, et ce qui touche toute la plateforme. <Link href="/etat?periode=7#t-chronologie">Toute la plateforme</Link></p> : null}
      {d.fil.length ? (
        <div className="ch-fil">
          {[...jours.entries()].map(([jour, liste]) => (
            <section key={jour} aria-label={titreJour(jour, maintenant)}>
              <h3 className="ch-jour">{titreJour(jour, maintenant)}</h3>
              <ol className="ch-liste">{liste.map((e, i) => <Ligne key={`${e.genre}-${e.quand}-${i}`} e={e} />)}</ol>
            </section>
          ))}
          {d.total > d.fil.length ? <p className="aide">Les {d.fil.length} plus récents sur {d.total.toLocaleString("fr-FR")} : resserrer la période ou choisir une boutique.</p> : null}
        </div>
      ) : <p className="discret ch-vide">Rien n&apos;a bougé sur {periode}{pour ? ` autour de ${pour.nom}` : ""}.</p>}
    </section>
  );
}
