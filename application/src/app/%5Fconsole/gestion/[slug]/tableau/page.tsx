import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Compteur } from "@/components/console/Compteur";
import { Icone } from "@/components/console/Icone";
import { ObjectifMois } from "@/components/console/ObjectifMois";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { PEUT_FIXER, type Objectif } from "@/lib/gestion/objectif";
import { formateMontant } from "@/lib/prix";
import { DIRECTION, delta, duree, pourcent, type Synthese, type Tableau } from "@/lib/gestion/tableau";
import { canal as canalDe } from "@/lib/gestion/saisie";

export const metadata: Metadata = { title: "Tableau de bord" };

/* ============================================================================
   LE TABLEAU DE BORD (B12) — « combien on a vendu, combien de colis sont
   revenus » : sur 7, 30 ou 90 jours, comparés à la période précédente.
   En tête, l'objectif du mois (…_objectif_mois.sql) ; puis quatre chiffres
   (encaissé, commandes, confirmation, refus) ; puis
   le jour par jour, les refus (d'où ils viennent, où ils se concentrent),
   et ce qui se vend. Chaque chiffre renvoie aux commandes qu'il compte.

   Pour la direction : propriétaire, administrateur, lecture. La base
   revérifie le rôle (…_tableau_de_bord.sql).
   ========================================================================== */

const PERIODES = [7, 30, 90] as const;
/** D'où vient un refus, en un mot (les jauges sont étroites). */
const ORIGINES: Record<string, string> = { client: "Le client", livreur: "Le livreur", injoignable: "Injoignable", autre: "Autre raison" };
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const JOUR_LONG = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function Evolution({ maintenant, avant, inverse = false, points = false }: { maintenant: number | null | undefined; avant: number | null | undefined; inverse?: boolean; points?: boolean }) {
  const d = delta(maintenant, avant, points);
  // Rien à comparer (une boutique neuve) : on ne le dit pas quatre fois.
  if (!d) return null;
  const bon = d.sens === 0 ? null : (d.sens > 0) !== inverse;
  return (
    <span className={`tb-evolution ${bon === null ? "tb-neutre" : bon ? "tb-bon" : "tb-mauvais"}`}>
      {d.sens > 0 ? "▲" : d.sens < 0 ? "▼" : "="} {d.texte} <span className="discret">vs période précédente</span>
    </span>
  );
}

export default async function TableauDeBord({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ jours?: string; ok?: string; erreur?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  if (!DIRECTION.includes(boutique.role)) redirect(`/gestion/${slug}`);
  const jours = PERIODES.find((p) => String(p) === recherche.jours) ?? 30;
  const sb = await clientSession();
  const [{ data, error }, { data: dob, error: eob }] = await Promise.all([
    sb.rpc("gestion_tableau_de_bord", { p_boutique_id: boutique.boutique_id, p_jours: jours }),
    sb.rpc("gestion_objectif", { p_boutique_id: boutique.boutique_id }),
  ]);
  if (error || eob) throw new Error(`Tableau de bord illisible : ${(error ?? eob)?.message}`);
  const t = data as Tableau;
  const objectif = dob as Objectif;
  const c: Partial<Synthese> = t.courante;
  const p: Partial<Synthese> = t.precedente;
  const max = Math.max(1, ...t.par_jour.map((j) => j.recues));
  const refusTotal = t.refus_origines.reduce((n, r) => n + r.refus, 0);
  // Les canaux ne disent quelque chose que si tout ne vient pas de la vitrine.
  const canaux = (t.canaux ?? []).filter((c) => c.commandes > 0);
  const canauxTotal = canaux.reduce((n, c) => n + c.commandes, 0);
  const montrerCanaux = canaux.some((c) => c.canal !== "vitrine");
  const vide = !c.recues;
  const enRoute = (c.en_cours ?? 0) - (c.a_confirmer ?? 0);

  return (
    <>
      <EnTetePage
        titre="Tableau de bord"
        description={`Du ${JOUR.format(new Date(t.du))} au ${JOUR.format(new Date(t.au))} : les commandes passées sur la période, et ce qu'elles sont devenues.`}
        actions={
          <nav className="segments tb-periodes" aria-label="Période">
            {PERIODES.map((n) => (
              <Link key={n} href={`/gestion/${slug}/tableau?jours=${n}`} aria-current={n === jours ? "page" : undefined}>
                {n} jours
              </Link>
            ))}
          </nav>
        }
      />

      {recherche.ok ? <p className="message message-succes mb-4" role="status">{recherche.ok}</p> : null}
      {recherche.erreur ? <p className="message message-erreur mb-4" role="alert">{recherche.erreur}</p> : null}
      {/* L'objectif du mois : il ne dépend pas de la période choisie. */}
      <div className="mb-6">
        <ObjectifMois o={objectif} slug={slug} peutFixer={PEUT_FIXER.includes(boutique.role)} />
      </div>

      {vide ? (
        <div className="vide bo-vide">
          <span className="vide-icone"><Icone nom="graphique" taille={20} /></span>
          <strong>Pas encore de commande sur la période</strong>
          <p>Les chiffres s&apos;affichent dès la première commande. Essayez une période plus longue.</p>
        </div>
      ) : (
        <div className="pile">
          {/* ---------------- Les quatre chiffres ---------------- */}
          <section className="tb-chiffres" aria-label="Les chiffres de la période">
            <article className="carte tb-chiffre tb-chiffre-fort">
              <p className="tb-libelle">Encaissé</p>
              <p className="tb-valeur"><Compteur valeur={c.encaisse_millimes ?? 0} format="montant" /> <span>TND</span></p>
              <p className="tb-detail">{c.livrees} commande{(c.livrees ?? 0) > 1 ? "s" : ""} livrée{(c.livrees ?? 0) > 1 ? "s" : ""}</p>
              <Evolution maintenant={c.encaisse_millimes} avant={p.encaisse_millimes} />
            </article>
            <article className="carte tb-chiffre">
              <p className="tb-libelle">Commandes reçues</p>
              <p className="tb-valeur"><Compteur valeur={c.recues ?? 0} /></p>
              <p className="tb-detail">
                {c.a_confirmer ? <Link href={`/gestion/${slug}?etape=a_confirmer`}>{c.a_confirmer} à confirmer</Link> : "aucune à confirmer"}
                {enRoute > 0 ? ` · ${enRoute} en préparation ou en route` : ""}
                {/* Sur les commandes reçues (non annulées), pas sur les livrées :
                    rangé ici, il ne se lit pas comme l'encaissé divisé par les livrées. */}
                {c.panier_moyen_millimes ? <> · <span className="whitespace-nowrap">panier moyen {formateMontant(c.panier_moyen_millimes)} TND</span></> : null}
              </p>
              <Evolution maintenant={c.recues} avant={p.recues} />
            </article>
            <article className="carte tb-chiffre">
              <p className="tb-libelle">Taux de confirmation</p>
              <p className="tb-valeur">{c.taux_confirmation != null ? <Compteur valeur={c.taux_confirmation} format="pourcent" /> : pourcent(null)}</p>
              <p className="tb-detail">
                {c.confirmees} confirmée{(c.confirmees ?? 0) > 1 ? "s" : ""}
                {c.confirmation_minutes != null ? ` · en ${duree(c.confirmation_minutes)} (médiane)` : ""}
              </p>
              <Evolution maintenant={c.taux_confirmation} avant={p.taux_confirmation} points />
            </article>
            <article className="carte tb-chiffre">
              <p className="tb-libelle">Refus à la livraison</p>
              <p className="tb-valeur">{c.taux_refus != null ? <Compteur valeur={c.taux_refus} format="pourcent" /> : pourcent(null)}</p>
              <p className="tb-detail">
                {c.refusees ? `${c.refusees} colis revenu${(c.refusees ?? 0) > 1 ? "s" : ""} · ${formateMontant(c.perdu_millimes ?? 0)} TND non encaissés` : "aucun colis revenu"}
              </p>
              <Evolution maintenant={c.taux_refus} avant={p.taux_refus} inverse points />
            </article>
          </section>

          {/* ---------------- Jour par jour ---------------- */}
          <section className="carte" aria-labelledby="tb-jours">
            <div className="carte-tete">
              <div>
                <h2 id="tb-jours" className="carte-titre-icone"><Icone nom="graphique" /> Jour par jour</h2>
                <p>Les commandes reçues chaque jour ; en plein, celles qui ont été livrées.</p>
              </div>
              <p className="tb-legende" aria-hidden="true">
                <span><i className="tb-pastille tb-pastille-recues" /> Reçues</span>
                <span><i className="tb-pastille tb-pastille-livrees" /> Livrées</span>
              </p>
            </div>
            {/* L'échelle : le plus haut jour, sa moitié quand elle tombe juste, zéro. */}
            <div className="tb-graphe">
            <span className="tb-echelle" aria-hidden="true">
              <span>{max}</span>
              {max % 2 === 0 && max > 2 ? <span>{max / 2}</span> : <span />}
              <span>0</span>
            </span>
            <ol className="tb-barres" data-jours={jours} data-milieu={max % 2 === 0 && max > 2 ? "" : undefined} aria-label="Commandes par jour">
              {t.par_jour.map((j, i) => (
                <li key={j.jour} style={{ "--i": i } as React.CSSProperties} title={`${JOUR_LONG.format(new Date(j.jour))} : ${j.recues} reçue${j.recues > 1 ? "s" : ""}, ${j.livrees} livrée${j.livrees > 1 ? "s" : ""}`}>
                  <span className="tb-barre" style={{ blockSize: `${(j.recues / max) * 100}%` }}>
                    <span className="tb-barre-livrees" style={{ blockSize: j.recues ? `${(j.livrees / j.recues) * 100}%` : 0 }} />
                  </span>
                  <span className="sr-only">{JOUR_LONG.format(new Date(j.jour))} : {j.recues} reçues, {j.livrees} livrées</span>
                </li>
              ))}
            </ol>
            </div>
            <p className="tb-axe" aria-hidden="true">
              <span>{JOUR.format(new Date(t.du))}</span>
              <span>{JOUR.format(new Date(t.au))}</span>
            </p>
          </section>

          <div className="grille-2 tb-grille">
            {/* ---------------- Les refus ---------------- */}
            <section className="carte" aria-labelledby="tb-refus">
              <div className="carte-tete">
                <div>
                  <h2 id="tb-refus" className="carte-titre-icone"><Icone nom="refus" /> Les refus</h2>
                  <p>D&apos;où ils viennent, et où ils se concentrent : les gouvernorats où les colis reviennent le plus.</p>
                </div>
              </div>
              {refusTotal === 0 ? (
                <p className="discret tb-rien">Aucun colis refusé sur la période.</p>
              ) : (
                <ul className="tb-origines" role="list">
                  {t.refus_origines.map((r) => (
                    <li key={r.origine}>
                      <span className="tb-origine-nom">{ORIGINES[r.origine] ?? r.origine}</span>
                      <span className="tb-jauge" aria-hidden="true"><span style={{ inlineSize: `${(r.refus / refusTotal) * 100}%` }} /></span>
                      <span className="tb-origine-n">{r.refus}</span>
                    </li>
                  ))}
                </ul>
              )}
              {t.gouvernorats.length ? (
                <table className="tb-table">
                  <caption className="sr-only">Refus par gouvernorat</caption>
                  <thead>
                    <tr><th scope="col">Gouvernorat</th><th scope="col">Arrivés</th><th scope="col">Refusés</th><th scope="col">Taux</th></tr>
                  </thead>
                  <tbody>
                    {t.gouvernorats.map((g) => (
                      <tr key={g.code}>
                        <th scope="row">{g.nom}</th>
                        <td>{g.arrivees}</td>
                        <td>{g.refusees}</td>
                        <td><span className={`tb-taux ${g.taux_refus >= 0.25 ? "tb-taux-haut" : ""}`}>{pourcent(g.taux_refus)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </section>

            {/* ---------------- Ce qui se vend ---------------- */}
            <section className="carte" aria-labelledby="tb-produits">
              <div className="carte-tete">
                <div>
                  <h2 id="tb-produits" className="carte-titre-icone"><Icone nom="colis" /> Ce qui se vend</h2>
                  <p>Les articles livrés sur la période, par quantité.</p>
                </div>
              </div>
              {t.produits.length === 0 ? (
                <p className="discret tb-rien">Aucune commande livrée sur la période.</p>
              ) : (
                <ol className="tb-produits" role="list">
                  {t.produits.map((x, i) => (
                    <li key={x.produit}>
                      <span className="tb-rang">{i + 1}</span>
                      <span className="tb-produit-nom">{x.produit}</span>
                      <span className="tb-produit-q">{x.quantite} vendu{x.quantite > 1 ? "s" : ""}</span>
                      <span className="tb-produit-m">{formateMontant(x.montant_millimes)} TND</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {/* ---------------- D'où viennent les commandes ---------------- */}
          {montrerCanaux ? (
            <section className="carte" aria-labelledby="tb-canaux">
              <div className="carte-tete">
                <div>
                  <h2 id="tb-canaux" className="carte-titre-icone"><Icone nom="message" /> D&apos;où viennent les commandes</h2>
                  <p>La vitrine, ou le canal des commandes saisies par l&apos;équipe ; et ce que chacun a encaissé (commandes livrées).</p>
                </div>
              </div>
              <ul className="tb-canaux" role="list">
                {canaux.map((c) => {
                  const k = c.canal === "vitrine" ? { libelle: "La vitrine", icone: "ecran" as const } : canalDe(c.canal) ?? { libelle: c.canal, icone: "commandes" as const };
                  return (
                    <li key={c.canal}>
                      <span className="tb-canal-nom"><Icone nom={k.icone} taille={14} /> {k.libelle}</span>
                      <span className="tb-jauge tb-jauge-canal" aria-hidden="true"><span style={{ inlineSize: `${(c.commandes / canauxTotal) * 100}%` }} /></span>
                      <span className="tb-canal-n">{c.commandes} commande{c.commandes > 1 ? "s" : ""} <span className="discret">· {pourcent(c.commandes / canauxTotal)}</span></span>
                      <span className="tb-canal-m">{c.livrees > 0 ? `${formateMontant(c.encaisse_millimes)} TND` : <span className="discret">pas encore livrée{c.commandes > 1 ? "s" : ""}</span>}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
