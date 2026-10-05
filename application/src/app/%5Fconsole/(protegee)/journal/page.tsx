import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { Pagination } from "@/components/console/Pagination";
import { dateJournal } from "@/lib/console/libelles";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { ACTIONS, GENRES_JOURNAL, jourValide, libelleSignal } from "@/lib/console/journal";
import { SANS_FORMULE, type DonneesFormules } from "@/lib/console/formules";

export const metadata: Metadata = { title: "Journal" };

/* ============================================================================
   LE JOURNAL DE LA PLATEFORME — deux vues :
   · « Gestes » : tout ce qui a été fait, par qui, d'où, toutes boutiques
     confondues ; filtré par boutique et par genre de geste ;
   · « Envois » : chaque e-mail sorti (ou refusé) par l'application, l'adresse
     masquée, sur trois mois. Les SMS s'y ajouteront avec le fournisseur SMS.
   ========================================================================== */

type LigneJournal = {
  id: number; at: string; action: string; cible: string | null; ip: string | null; acteur: string | null;
  boutique: { slug: string; nom: string } | null;
};
type Envoi = { id: number; le: string; canal: string; destinataire: string; expediteur: string | null; sujet: string | null; fournisseur: string; ok: boolean; raison: string | null };

const PAR_PAGE = 50;

export default async function Journal({ searchParams }: { searchParams: Promise<{ vue?: string; boutique?: string; genre?: string; page?: string; echecs?: string; du?: string; au?: string }> }) {
  const { user } = await exigeAdmin();
  const p = await searchParams;
  const vue = p.vue === "envois" ? "envois" : "gestes";
  const page = Math.max(1, Number.parseInt(p.page ?? "1", 10) || 1);
  const service = clientService();
  const { data: df } = await service.rpc("console_formules", { p_acteur: user.id });
  const donnees = (df ?? { boutiques: [], formules: [] }) as DonneesFormules;
  const boutiques = donnees.boutiques;
  const nomsFormules = new Map(donnees.formules.map((f) => [f.code, f.nom]));
  // Le détail d'une ligne : rien pour une note ou une annonce (leur numéro ne dit rien), le nom d'une formule.
  const detail = (x: LigneJournal) =>
    x.action.startsWith("note.") || x.action.startsWith("annonce.") ? ""
    : x.action === "boutique.formule" ? (x.cible ? nomsFormules.get(x.cible) ?? x.cible : SANS_FORMULE)
    : x.action.startsWith("vigilance.") ? libelleSignal(x.cible)
    : x.cible ?? "";
  const choisie = boutiques.find((b) => b.slug === p.boutique) ?? null;
  const genre = GENRES_JOURNAL.find((g) => g.cle === p.genre) ?? null;
  const echecs = p.echecs === "1";
  // La période : deux jours de Tunis, l'un ou l'autre facultatif ; à l'envers, on les remet dans l'ordre.
  let du = jourValide(p.du);
  let au = jourValide(p.au);
  if (du && au && du > au) [du, au] = [au, du];
  const filtre = Boolean(choisie || genre || du || au);

  const lien = (v: { vue?: string; page?: number; boutique?: string | null; genre?: string | null; echecs?: boolean }) => {
    const q = new URLSearchParams();
    const vv = v.vue ?? vue;
    if (vv === "envois") q.set("vue", "envois");
    const b = v.boutique === undefined ? choisie?.slug : v.boutique;
    const g = v.genre === undefined ? genre?.cle : v.genre;
    if (vv === "gestes" && b) q.set("boutique", b);
    if (vv === "gestes" && g) q.set("genre", g);
    if (vv === "gestes" && du) q.set("du", du);
    if (vv === "gestes" && au) q.set("au", au);
    if (vv === "envois" && (v.echecs ?? echecs)) q.set("echecs", "1");
    if ((v.page ?? 1) > 1) q.set("page", String(v.page));
    const s = q.toString();
    return `/journal${s ? `?${s}` : ""}`;
  };

  const onglets = (
    <nav className="segments" aria-label="Vue du journal">
      <Link href={lien({ vue: "gestes", page: 1 })} className={vue === "gestes" ? "crl-segment crl-segment-actif" : "crl-segment"} aria-current={vue === "gestes" ? "page" : undefined}>
        <Icone nom="journal" taille={14} /> Gestes
      </Link>
      <Link href={lien({ vue: "envois", page: 1 })} className={vue === "envois" ? "crl-segment crl-segment-actif" : "crl-segment"} aria-current={vue === "envois" ? "page" : undefined}>
        <Icone nom="courriel" taille={14} /> Envois
      </Link>
    </nav>
  );

  if (vue === "envois") {
    const { data, error } = await service.rpc("console_envois", { p_acteur: user.id, p_echecs: echecs, p_limite: PAR_PAGE, p_decalage: (page - 1) * PAR_PAGE });
    if (error) throw new Error(`Envois illisibles : ${error.message}`);
    const e = data as { total: number; semaine: { partis: number; refuses: number }; lignes: Envoi[] };
    return (
      <>
        <EnTetePage titre="Journal" description="Les e-mails sortis de l'application, l'adresse masquée, sur trois mois. Les SMS s'ajouteront avec le fournisseur SMS." actions={onglets} />
        <div className="jr-barre">
          <p className="jr-resume">
            Sur 7 jours : <b>{e.semaine.partis}</b> parti{e.semaine.partis > 1 ? "s" : ""}
            {e.semaine.refuses ? <>, <b className="jr-refus">{e.semaine.refuses}</b> refusé{e.semaine.refuses > 1 ? "s" : ""}</> : ", aucun refus"}.
          </p>
          <Link href={lien({ echecs: !echecs, page: 1 })} className="btn btn-fantome btn-petit">{echecs ? "Tous les envois" : "Les refus seulement"}</Link>
        </div>
        <div className="carte carte-plate defile">
          {e.lignes.length === 0 ? <p className="discret jr-vide">{echecs ? "Aucun refus." : "Aucun envoi pour l'instant."}</p> : (
            <table className="tableau">
              <thead><tr><th>Quand</th><th>À</th><th>De</th><th>Sujet</th><th>Par</th><th>Résultat</th></tr></thead>
              <tbody>
                {e.lignes.map((x) => (
                  <tr key={x.id}>
                    <td className="tabular-nums whitespace-nowrap discret">{dateJournal(x.le)}</td>
                    <td className="whitespace-nowrap">{x.destinataire}</td>
                    <td>{x.expediteur ?? "—"}</td>
                    <td>{x.sujet ?? "—"}</td>
                    <td className="discret">{x.fournisseur}</td>
                    <td>{x.ok ? <span className="ui-etat ui-etat-point ui-etat-vert">Parti</span> : <span className="ui-etat ui-etat-point ui-etat-rouge" title={x.raison ?? undefined}>Refusé</span>}
                      {!x.ok && x.raison ? <span className="aide jr-raison">{x.raison}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={page} pages={Math.max(1, Math.ceil(e.total / PAR_PAGE))} total={e.total} parPage={PAR_PAGE} lien={(n) => lien({ page: n })} unite={["envoi", "envois"]} />
      </>
    );
  }

  const { data, error } = await service.rpc("console_journal", {
    p_acteur: user.id, p_boutique_id: choisie?.id ?? null, p_genre: genre?.cle ?? null, p_limite: PAR_PAGE, p_decalage: (page - 1) * PAR_PAGE,
    p_du: du, p_au: au,
  });
  if (error) throw new Error(`Journal illisible : ${error.message}`);
  const j = data as { total: number; lignes: LigneJournal[] };

  return (
    <>
      <EnTetePage titre="Journal" description="Chaque geste fait sur la plateforme, par qui et d'où : la console, et les réglages des back-offices." actions={onglets} />
      <form action="/journal" method="get" className="jr-filtres">
        <label className="sr-only" htmlFor="jr-boutique">Boutique</label>
        <select id="jr-boutique" className="entree" name="boutique" defaultValue={choisie?.slug ?? ""}>
          <option value="">Toutes les boutiques</option>
          {boutiques.map((b) => <option key={b.id} value={b.slug}>{b.nom}</option>)}
        </select>
        <label className="sr-only" htmlFor="jr-genre">Genre de geste</label>
        <select id="jr-genre" className="entree" name="genre" defaultValue={genre?.cle ?? ""}>
          <option value="">Tous les gestes</option>
          {GENRES_JOURNAL.map((g) => <option key={g.cle} value={g.cle}>{g.titre}</option>)}
        </select>
        <span className="jr-periode">
          <label htmlFor="jr-du">Du</label>
          <input id="jr-du" className="entree" type="date" name="du" defaultValue={du ?? ""} />
          <label htmlFor="jr-au">au</label>
          <input id="jr-au" className="entree" type="date" name="au" defaultValue={au ?? ""} />
        </span>
        <button type="submit" className="btn btn-second btn-petit">Filtrer</button>
        {filtre ? <Link href="/journal" className="btn-lien">Tout voir</Link> : null}
        <a href={lien({ page: 1 }).replace(/^\/journal/, "/journal/export")} className="btn btn-fantome btn-petit jr-export" download>
          <Icone nom="telecharger" taille={14} /> Exporter (CSV)
        </a>
      </form>
      <div className="carte carte-plate defile">
        {j.lignes.length === 0 ? <p className="discret jr-vide">Aucun geste {filtre ? "pour ce filtre" : "pour l'instant"}.</p> : (
          <table className="tableau">
            <thead><tr><th>Quand</th><th>Geste</th><th>Boutique</th><th>Détail</th><th>Par</th></tr></thead>
            <tbody>
              {j.lignes.map((x) => (
                <tr key={x.id}>
                  <td className="tabular-nums whitespace-nowrap discret">{dateJournal(x.at)}</td>
                  <td className="font-medium">{ACTIONS[x.action] ?? x.action}</td>
                  <td>{x.boutique ? <Link href={`/boutiques/${x.boutique.slug}`}>{x.boutique.nom}</Link> : <span className="discret">Plateforme</span>}</td>
                  <td className="discret jr-cible">{detail(x)}</td>
                  <td className="whitespace-nowrap">{x.acteur ?? <span className="discret">—</span>}{x.ip ? <span className="aide jr-ip">{x.ip}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={Math.max(1, Math.ceil(j.total / PAR_PAGE))} total={j.total} parPage={PAR_PAGE} lien={(n) => lien({ page: n })} unite={["geste", "gestes"]} />
    </>
  );
}
