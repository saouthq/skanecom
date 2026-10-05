import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { formateMontant } from "@/lib/prix";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { SANS_FORMULE, type DonneesFormules } from "@/lib/console/formules";
import { SEUILS } from "@/lib/console/pilotage";

export const metadata: Metadata = { title: "Tableau de bord" };

/* ============================================================================
   LE TABLEAU DE BORD DE LA PLATEFORME — sur 7, 30 ou 90 jours, comparé à la
   période d'avant : le chiffre (commandes livrées), les commandes reçues,
   le taux de refus à la livraison, le panier moyen ; la courbe de la
   plateforme jour par jour, puis chaque boutique, la plus grosse d'abord.
   Les boutiques de démonstration n'y comptent pas (elles s'affichent à part,
   sur demande).
   ========================================================================== */

type LigneTableau = {
  id: string; slug: string; nom: string; statut: string; demonstration: boolean; formule: string | null;
  recues: number; livrees: number; refusees: number; chiffre: number;
  precedent: { recues: number; chiffre: number };
};
type Tableau = { jours: number; du: string; au: string; boutiques: LigneTableau[]; serie: { jour: string; recues: number; chiffre: number }[] };

const PERIODES = [7, 30, 90] as const;
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

/** « +12 % », « −30 % », « nouveau » quand rien avant. */
function evolution(maintenant: number, avant: number): { texte: string; sens: "haut" | "bas" | "egal" } {
  if (avant === 0) return maintenant === 0 ? { texte: "—", sens: "egal" } : { texte: "nouveau", sens: "haut" };
  const pct = Math.round(((maintenant - avant) / avant) * 100);
  if (pct === 0) return { texte: "stable", sens: "egal" };
  return { texte: `${pct > 0 ? "+" : "−"}${Math.abs(pct)} %`, sens: pct > 0 ? "haut" : "bas" };
}

const tnd = (millimes: number) => `${formateMontant(millimes)} TND`;
const taux = (refusees: number, livrees: number) => (refusees + livrees > 0 ? refusees / (refusees + livrees) : null);

export default async function TableauPlateforme({ searchParams }: { searchParams: Promise<{ jours?: string; demos?: string; boutique?: string }> }) {
  const { user } = await exigeAdmin();
  const p = await searchParams;
  const jours = PERIODES.find((j) => String(j) === p.jours) ?? 30;
  const avecDemos = p.demos === "1";
  const service = clientService();
  const [{ data, error }, { data: df }] = await Promise.all([
    service.rpc("console_tableau", { p_acteur: user.id, p_jours: jours }),
    service.rpc("console_formules", { p_acteur: user.id }),
  ]);
  if (error) throw new Error(`Tableau illisible : ${error.message}`);
  const t = data as Tableau;
  const noms = new Map(((df ?? { formules: [] }) as DonneesFormules).formules.map((f) => [f.code, f.nom]));
  const clientes = t.boutiques.filter((b) => !b.demonstration);
  const lignes = avecDemos ? t.boutiques : clientes;
  const somme = (cle: "recues" | "livrees" | "refusees" | "chiffre") => clientes.reduce((n, b) => n + b[cle], 0);
  const chiffre = somme("chiffre");
  const recues = somme("recues");
  const livrees = somme("livrees");
  const refusees = somme("refusees");
  const chiffreAvant = clientes.reduce((n, b) => n + b.precedent.chiffre, 0);
  const recuesAvant = clientes.reduce((n, b) => n + b.precedent.recues, 0);
  const tauxRefus = taux(refusees, livrees);
  const actives = clientes.filter((b) => b.recues > 0).length;
  const max = Math.max(1, ...t.serie.map((j) => j.chiffre));
  const lien = (v: { jours?: number; demos?: boolean }) =>
    `/tableau?${new URLSearchParams({ jours: String(v.jours ?? jours), ...((v.demos ?? avecDemos) ? { demos: "1" } : {}) })}`;
  const evChiffre = evolution(chiffre, chiffreAvant);
  const evRecues = evolution(recues, recuesAvant);

  return (
    <>
      <EnTetePage
        titre="Tableau de bord"
        description={`Du ${JOUR.format(new Date(t.du))} au ${JOUR.format(new Date(t.au))}, comparé aux ${jours} jours d'avant. Le chiffre : les commandes livrées.`}
        actions={
          <nav className="segments" aria-label="Période">
            {PERIODES.map((j) => (
              <Link key={j} href={lien({ jours: j })} className={j === jours ? "crl-segment crl-segment-actif" : "crl-segment"} aria-current={j === jours ? "page" : undefined}>
                {j} jours
              </Link>
            ))}
          </nav>
        }
      />

      <ul className="tbp-chiffres" role="list">
        <li className="carte">
          <span className="tbp-libelle">Chiffre livré</span>
          <b className="tbp-valeur">{tnd(chiffre)}</b>
          <span className="tbp-evolution" data-sens={evChiffre.sens}>{evChiffre.texte} <span className="discret">vs {tnd(chiffreAvant)}</span></span>
        </li>
        <li className="carte">
          <span className="tbp-libelle">Commandes reçues</span>
          <b className="tbp-valeur">{recues}</b>
          <span className="tbp-evolution" data-sens={evRecues.sens}>{evRecues.texte} <span className="discret">vs {recuesAvant}</span></span>
        </li>
        <li className="carte" data-alerte={tauxRefus !== null && tauxRefus >= SEUILS.refusAttention ? "" : undefined}>
          <span className="tbp-libelle">Refus à la livraison</span>
          <b className="tbp-valeur">{tauxRefus === null ? "—" : `${Math.round(tauxRefus * 100)} %`}</b>
          <span className="tbp-evolution discret">{refusees} refusée{refusees > 1 ? "s" : ""} · {livrees} livrée{livrees > 1 ? "s" : ""}</span>
        </li>
        <li className="carte">
          <span className="tbp-libelle">Panier moyen</span>
          <b className="tbp-valeur">{livrees ? tnd(Math.round(chiffre / livrees)) : "—"}</b>
          <span className="tbp-evolution discret">{actives} boutique{actives > 1 ? "s" : ""} avec des commandes</span>
        </li>
      </ul>

      <section className="carte tbp-graphe-carte" aria-labelledby="t-serie">
        <div className="carte-tete">
          <div>
            <h2 id="t-serie" className="carte-titre-icone"><Icone nom="graphique" /> Chiffre livré, jour par jour</h2>
            <p>Toutes les boutiques clientes. Au survol : le jour, le chiffre, les commandes reçues.</p>
          </div>
        </div>
        <ol className="tbp-graphe" role="list" style={{ "--tbp-n": t.serie.length } as React.CSSProperties}>
          {t.serie.map((j) => (
            <li key={j.jour} title={`${JOUR.format(new Date(j.jour))} : ${tnd(j.chiffre)} · ${j.recues} reçue${j.recues > 1 ? "s" : ""}`}>
              <span className="tbp-barre" style={{ blockSize: `${Math.max(j.chiffre ? 3 : 0, (j.chiffre / max) * 100)}%` }} />
              <span className="sr-only">{JOUR.format(new Date(j.jour))} : {tnd(j.chiffre)}, {j.recues} commandes reçues</span>
            </li>
          ))}
        </ol>
        <div className="tbp-axe" aria-hidden="true">
          <span>{JOUR.format(new Date(t.du))}</span><span>{tnd(max)} au plus haut</span><span>{JOUR.format(new Date(t.au))}</span>
        </div>
      </section>

      <section className="carte carte-plate" aria-labelledby="t-par-boutique">
        <div className="carte-tete">
          <div>
            <h2 id="t-par-boutique" className="carte-titre-icone"><Icone nom="boutique" /> Par boutique</h2>
            <p>La plus grosse d&apos;abord. Un refus sur quatre ou plus est marqué.</p>
          </div>
          <Link href={lien({ demos: !avecDemos })} className="btn btn-fantome btn-petit">
            {avecDemos ? "Sans les démonstrations" : "Avec les démonstrations"}
          </Link>
        </div>
        <div className="defile">
          <table className="tableau tbp-tableau">
            <thead>
              <tr>
                <th>Boutique</th><th>Formule</th><th className="text-end">Reçues</th><th className="text-end">Livrées</th>
                <th className="text-end">Refus</th><th className="text-end">Chiffre</th><th className="text-end">Panier moyen</th><th className="text-end">Évolution</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((b) => {
                const tx = taux(b.refusees, b.livrees);
                const ev = evolution(b.chiffre, b.precedent.chiffre);
                return (
                  <tr key={b.id} className="ligne-lien" data-choisie={p.boutique === b.slug ? "" : undefined}>
                    <td>
                      <Link href={`/boutiques/${b.slug}`} className="ligne-cible">{b.nom}</Link>
                      {b.demonstration ? <small className="discret"> · démonstration</small> : null}
                    </td>
                    <td className={b.formule ? undefined : "discret"}>{b.formule ? noms.get(b.formule) ?? b.formule : SANS_FORMULE}</td>
                    <td className="tabular-nums text-end">{b.recues}</td>
                    <td className="tabular-nums text-end">{b.livrees}</td>
                    <td className="tabular-nums text-end" data-alerte={tx !== null && b.refusees + b.livrees >= SEUILS.refusMinimum && tx >= SEUILS.refusAttention ? "" : undefined}>
                      {tx === null ? <span className="discret">—</span> : `${Math.round(tx * 100)} %`}
                    </td>
                    <td className="tabular-nums text-end whitespace-nowrap">{tnd(b.chiffre)}</td>
                    <td className="tabular-nums text-end whitespace-nowrap">{b.livrees ? tnd(Math.round(b.chiffre / b.livrees)) : <span className="discret">—</span>}</td>
                    <td className="tabular-nums text-end"><span className="tbp-evolution" data-sens={ev.sens}>{ev.texte}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
