import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Compteur } from "@/components/console/Compteur";
import { FormVersement } from "@/components/console/FormVersement";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { formateMontant } from "@/lib/prix";
import { DIRECTION } from "@/lib/gestion/tableau";
import { joursDepuis, nomTransporteur, TRESORERIE, type Encaissements } from "@/lib/gestion/encaissements";

export const metadata: Metadata = { title: "Encaissements" };

/* ============================================================================
   LES ENCAISSEMENTS (B12, 2e partie) — « combien Aramex me doit encore ? ».
   En tête, l'argent resté chez les livreurs et ce qui est rentré sur trente
   jours ; puis, livreur par livreur, les colis livrés dont l'argent n'est pas
   encore reversé, la plus ancienne livraison d'abord, avec la saisie du
   versement ; enfin le journal des versements (et leur écart).

   Pour la direction ; seuls le propriétaire et l'administrateur saisissent.
   La base revérifie tout (…_encaissements.sql).
   ========================================================================== */

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function Ecart({ millimes }: { millimes: number }) {
  if (millimes === 0) return <span className="ui-etat ui-etat-vert">Le compte est bon</span>;
  return (
    <span className={`ui-etat ${millimes < 0 ? "ui-etat-rouge" : "ui-etat-bleu"}`}>
      {millimes > 0 ? "+" : ""}{formateMontant(millimes)} TND
    </span>
  );
}

export default async function EncaissementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ fait?: string; n?: string; ecart?: string; erreur?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  if (!DIRECTION.includes(boutique.role)) redirect(`/gestion/${slug}`);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_encaissements", { p_boutique_id: boutique.boutique_id });
  if (error) throw new Error(`Encaissements illisibles : ${error.message}`);
  const e = data as Encaissements;
  const saisit = TRESORERIE.includes(boutique.role);
  const action = `/gestion/${slug}/encaissements/action`;
  const maintenant = new Date();
  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(maintenant);

  const chez = e.a_recevoir.reduce((s, g) => s + g.total_millimes, 0);
  const colis = e.a_recevoir.reduce((s, g) => s + g.nombre, 0);
  const plusAncien = e.a_recevoir.reduce((m, g) => Math.max(m, joursDepuis(g.plus_ancienne, maintenant.getTime())), 0);
  const ecartFait = Number(messages.ecart ?? 0);

  return (
    <>
      <EnTetePage
        titre="Encaissements"
        description="L'argent des colis livrés : ce que les livreurs ont encaissé pour vous, et ce qu'ils vous ont reversé."
      />
      <div className="pile">
        {messages.fait === "verse" ? (
          <p className="message message-succes" role="status">
            Versement enregistré : {messages.n} colis rapproché{Number(messages.n) > 1 ? "s" : ""}
            {ecartFait ? `, écart de ${ecartFait > 0 ? "+" : ""}${formateMontant(ecartFait)} TND.` : ", le compte est bon."}
          </p>
        ) : null}
        {messages.fait === "annule" ? (
          <p className="message message-succes" role="status">Versement annulé : ses colis sont de nouveau à recevoir.</p>
        ) : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

        <section className="tb-chiffres" aria-label="L'argent en un coup d'œil">
          <article className="carte tb-chiffre tb-chiffre-fort">
            <p className="tb-libelle">Chez les livreurs</p>
            <p className="tb-valeur"><Compteur valeur={chez} format="montant" /> <span>TND</span></p>
            <p className="tb-detail">
              {colis ? `${colis} colis livré${colis > 1 ? "s" : ""}, pas encore reversé${colis > 1 ? "s" : ""}` : "tout est reversé"}
              {colis && plusAncien >= 1 ? ` · le plus ancien il y a ${plusAncien} j` : ""}
            </p>
          </article>
          <article className="carte tb-chiffre">
            <p className="tb-libelle">Reçu sur 30 jours</p>
            <p className="tb-valeur"><Compteur valeur={e.trente_jours.recu_millimes} format="montant" /> <span>TND</span></p>
            <p className="tb-detail">{e.trente_jours.nombre} versement{e.trente_jours.nombre > 1 ? "s" : ""}</p>
          </article>
          <article className="carte tb-chiffre">
            <p className="tb-libelle">Écart sur 30 jours</p>
            <p className="tb-valeur">{formateMontant(e.trente_jours.ecart_millimes)} <span>TND</span></p>
            <p className="tb-detail">
              {e.trente_jours.ecart_millimes < 0 ? "retenu par les livreurs (frais, colis manquants)" : e.trente_jours.ecart_millimes > 0 ? "reçu en plus de l'attendu" : "rien de retenu"}
            </p>
          </article>
        </section>

        {e.a_recevoir.length === 0 ? (
          <div className="vide bo-vide ec-vide">
            <span className="vide-icone"><Icone nom="billet" taille={20} /></span>
            <strong>Rien à recevoir</strong>
            <p>Tous les colis livrés et payés au livreur sont rapprochés d&apos;un versement.</p>
          </div>
        ) : (
          e.a_recevoir.map((g, i) => (
            <section key={g.transporteur ?? "-"} className="carte ec-groupe" aria-labelledby={`ec-groupe-${i}`}>
              <div className="carte-tete ec-groupe-tete">
                <div>
                  <h2 id={`ec-groupe-${i}`} className="carte-titre-icone"><Icone nom="camion" /> {nomTransporteur(g.transporteur)}</h2>
                  <p className="discret">
                    {g.nombre} colis à reverser · livré{g.nombre > 1 ? "s" : ""} depuis le {JOUR.format(g.plus_ancienne ? new Date(g.plus_ancienne) : maintenant)}
                  </p>
                </div>
                <p className="ec-groupe-total tabular-nums">{formateMontant(g.total_millimes)} <span className="discret">TND</span></p>
              </div>
              {saisit ? (
                <FormVersement action={action} transporteur={g.transporteur} commandes={g.commandes} aujourdhui={aujourdhui} maintenant={maintenant.getTime()} />
              ) : (
                <ul className="ec-colis ec-colis-lecture">
                  {g.commandes.map((c) => (
                    <li key={c.numero} className="ec-colis-ligne">
                      <span className="ec-colis-qui"><b>{c.numero}</b><span>{c.client}{c.ville ? ` · ${c.ville}` : ""}</span></span>
                      <span className="ec-colis-montant tabular-nums">{formateMontant(c.total_millimes)} <span className="discret">TND</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))
        )}

        <section className="carte" aria-labelledby="t-versements">
          <div className="carte-tete">
            <h2 id="t-versements" className="carte-titre-icone"><Icone nom="journal" /> Versements reçus</h2>
            <p className="discret">Chaque versement, les colis qu&apos;il couvre, et son écart avec l&apos;attendu.</p>
          </div>
          {e.versements.length === 0 ? (
            <p className="discret">Aucun versement enregistré pour le moment.</p>
          ) : (
            <ol className="ec-versements">
              {e.versements.map((v) => (
                <li key={v.id} className="ec-versement" data-annule={v.annule_le ? "" : undefined}>
                  <div className="ec-versement-tete">
                    <span className="ec-versement-quoi">
                      <b>{nomTransporteur(v.transporteur)}</b>
                      <span className="discret">
                        {JOUR.format(new Date(v.recu_le))}{v.reference ? ` · ${v.reference}` : ""}{v.auteur ? ` · ${v.auteur}` : ""}
                      </span>
                    </span>
                    <span className="ec-versement-montant tabular-nums">{formateMontant(v.recu_millimes)} <span className="discret">TND</span></span>
                    {v.annule_le ? <span className="ui-etat">Annulé</span> : <Ecart millimes={v.ecart_millimes} />}
                  </div>
                  <details className="ec-versement-colis">
                    <summary>{v.numeros.length} colis · attendu {formateMontant(v.attendu_millimes)} TND</summary>
                    <p className="ec-numeros">
                      {v.numeros.map((n) => (
                        <Link key={n} href={`/gestion/${slug}/commandes/${encodeURIComponent(n)}`}>{n}</Link>
                      ))}
                    </p>
                    {saisit && !v.annule_le ? (
                      <form method="post" action={action} className="ec-annuler">
                        <input type="hidden" name="geste" value="annuler" />
                        <input type="hidden" name="versement" value={v.id} />
                        <span className="discret">Une erreur de saisie ? Ses colis redeviendront à recevoir ; il reste au journal.</span>
                        <button type="submit" className="btn btn-second btn-petit">Annuler ce versement</button>
                      </form>
                    ) : null}
                    {v.annule_le ? <p className="discret">Annulé{v.annule_par ? ` par ${v.annule_par}` : ""}.</p> : null}
                  </details>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
