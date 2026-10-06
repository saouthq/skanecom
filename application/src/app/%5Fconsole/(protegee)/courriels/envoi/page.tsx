import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { OngletsCourriels } from "@/components/console/OngletsCourriels";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { adresseOuEtat, ceQuePart, LIBELLES_STATUT_DOMAINE, quandLisible, type DonneesCourriels } from "@/lib/console/courriels";
import { domainePlateforme, fournisseurCourant, LIBELLES_FOURNISSEUR } from "@/lib/courriels/domaines";
import { MODELES_ESSAI } from "@/lib/courriels/essai";
import { nombre } from "@/lib/console/consommation";

export const metadata: Metadata = { title: "E-mails · Envoi" };

/* ============================================================================
   L'ENVOI DES E-MAILS (migration …_courriels_expediteur) — l'expéditeur de
   la plateforme tel que le secret COURRIELS_ENVOI le branche (la clé n'est
   jamais montrée), son domaine chez le fournisseur, ce qui part et ce qui
   casse ce mois-ci ; où vont les réponses de l'équipe ; un essai ; et, pour
   chaque boutique, de qui partent ses e-mails et où vont les réponses.
   ========================================================================== */

type Messages = { ok?: string; erreur?: string; carte?: string };

export default async function Envoi({ searchParams }: { searchParams: Promise<Messages> }) {
  const { user, role } = await exigeAdmin();
  const peutRegler = role === "super_admin";
  const m = await searchParams;
  const [{ data, error }, domaine] = await Promise.all([
    clientService().rpc("console_courriels", { p_acteur: user.id }),
    domainePlateforme(),
  ]);
  if (error) throw new Error(`Envoi illisible : ${error.message}`);
  const d = data as DonneesCourriels;
  const { fournisseur, expediteur } = fournisseurCourant();
  const branche = fournisseur === "resend" || fournisseur === "brevo";
  const message = (carte: string) => m.carte === carte ? (
    <>
      {m.ok ? <p className="message message-succes ce-retour" role="status">{m.ok}</p> : null}
      {m.erreur ? <p className="message message-erreur ce-retour" role="alert">{m.erreur}</p> : null}
    </>
  ) : null;
  const statutDomaine = domaine.statut ? LIBELLES_STATUT_DOMAINE[domaine.statut] : null;
  const boutiques = d.boutiques.filter((b) => !b.demonstration);
  const demos = d.boutiques.length - boutiques.length;

  return (
    <>
      <EnTetePage
        titre="E-mails"
        description="Qui envoie, au nom de qui, et où vont les réponses : la plateforme, puis chaque boutique."
        actions={<OngletsCourriels actif="envoi" />}
      />
      <div className="grid gap-5">
        <section className="carte" aria-labelledby="t-expediteur-titre" id="t-expediteur">
          <div className="carte-tete">
            <div>
              <h2 id="t-expediteur-titre" className="carte-titre-icone"><Icone nom="courriel" /> L&apos;expéditeur de la plateforme</h2>
              <p>Branché par le secret COURRIELS_ENVOI du Worker (fournisseur, clé, adresse) : la clé ne s&apos;affiche jamais ici.</p>
            </div>
            <span className={branche ? "ui-etat ui-etat-point ui-etat-vert" : fournisseur === "aucun" ? "ui-etat ui-etat-point ui-etat-rouge" : "ui-etat ui-etat-point ui-etat-ambre"}>
              {branche ? "Branché" : fournisseur === "aucun" ? "Rien ne part" : fournisseur === "relais" ? "Local" : "Aperçu : rien ne part"}
            </span>
          </div>
          {fournisseur === "aucun" ? (
            <p className="message message-erreur" role="alert">
              Aucun fournisseur n&apos;est branché : aucun e-mail ne part (codes, commandes, invitations). Donnez au Worker le secret COURRIELS_ENVOI
              « resend:&lt;clé&gt;:&lt;adresse&gt; » ou « brevo:&lt;clé&gt;:&lt;adresse&gt; ».
            </p>
          ) : null}
          <dl className="ce-fiche">
            <div><dt>Fournisseur</dt><dd>{LIBELLES_FOURNISSEUR[fournisseur]}</dd></div>
            <div>
              <dt>Adresse d&apos;expédition</dt>
              <dd>{expediteur ? <span className="ce-adresse">{expediteur}</span> : <span className="discret">{branche ? "absente du secret" : fournisseur === "relais" ? "aucune : le relais local garde les e-mails (.outils/emails.log)" : fournisseur === "apercu" ? "aucune : l'aperçu garde les e-mails en base, lisibles au journal" : "aucune : rien ne part"}</span>}</dd>
            </div>
            <div>
              <dt>Son domaine</dt>
              <dd>
                {domaine.domaine ? <><span className="ce-adresse">{domaine.domaine}</span> </> : <span className="discret">—</span>}
                {statutDomaine ? <span className={statutDomaine.classe}>{statutDomaine.libelle} chez {LIBELLES_FOURNISSEUR[fournisseur]}</span> : null}
                {domaine.raison ? <span className="aide ce-raison">{domaine.raison}</span> : null}
              </dd>
            </div>
            <div>
              <dt>Ce mois-ci</dt>
              <dd>
                <b>{nombre(d.mois.envoyes)}</b> parti{d.mois.envoyes > 1 ? "s" : ""}
                {d.mois.refuses ? <>, <b className="ce-refus">{nombre(d.mois.refuses)}</b> refusé{d.mois.refuses > 1 ? "s" : ""}</> : ", aucun refus"}
                {d.dernier_envoi ? <span className="discret"> · le dernier {quandLisible(d.dernier_envoi)}</span> : null}
                {" · "}<Link href="/consommation">Consommation</Link>
              </dd>
            </div>
            {d.dernier_refus ? (
              <div>
                <dt>Dernier refus</dt>
                <dd>
                  {quandLisible(d.dernier_refus.le)} : {d.dernier_refus.raison ?? "sans raison donnée"}
                  {" · "}<Link href="/journal?vue=envois&echecs=1">les refus</Link>
                </dd>
              </div>
            ) : null}
            <div><dt>Au nom de</dt><dd>La boutique, pour ses clients ; SkanEcom, pour les équipes (invitations, mots de passe).</dd></div>
          </dl>
        </section>

        <section className="carte" aria-labelledby="t-reponse-titre" id="t-reponse">
          <div className="carte-tete">
            <div>
            <h2 id="t-reponse-titre" className="carte-titre-icone"><Icone nom="message" /> Les réponses de l&apos;équipe</h2>
            <p>Quand un commerçant répond à une invitation ou à un mot de passe oublié : l&apos;adresse où sa réponse arrive.</p>
          </div>
          </div>
          {message("reponse")}
          <form action="/courriels/envoi/reponse" method="post" className="ce-form">
            <div className="champ">
              <label htmlFor="cr-reponse">Les réponses vont à</label>
              <div className="ce-ligne">
                <input id="cr-reponse" name="reponse_a" type="email" inputMode="email" autoComplete="off" className="entree"
                  defaultValue={d.reponse_plateforme ?? ""} placeholder="support@skanecom.tn" disabled={!peutRegler} aria-describedby="cr-reponse-aide" />
                {peutRegler ? <button type="submit" className="btn btn-primaire">Enregistrer</button> : null}
              </div>
              <span className="aide" id="cr-reponse-aide">Vide : à l&apos;adresse d&apos;expédition{expediteur ? ` (${expediteur})` : ""}.</span>
            </div>
          </form>
        </section>

        <section className="carte" aria-labelledby="t-essai-titre" id="t-essai">
          <div className="carte-tete">
            <div>
            <h2 id="t-essai-titre" className="carte-titre-icone"><Icone nom="outil" /> Envoyer un essai</h2>
            <p>Un vrai envoi, par le même chemin que les autres ; le sujet commence par [Essai]. Compté à SkanEcom.</p>
          </div>
          </div>
          {message("essai")}
          <form action="/courriels/essai" method="post" className="ce-form ce-essai">
            <input type="hidden" name="retour" value="envoi" />
            <div className="champ">
              <label htmlFor="ep-a">À</label>
              <input id="ep-a" name="a" type="email" className="entree" required autoComplete="email" defaultValue={user.email ?? ""} />
            </div>
            <div className="champ">
              <label htmlFor="ep-boutique">Aux couleurs de</label>
              <select id="ep-boutique" name="boutique_id" className="entree" defaultValue={d.boutiques[0]?.id ?? ""}>
                {d.boutiques.map((b) => <option key={b.id} value={b.id}>{b.nom}{b.demonstration ? " (démonstration)" : ""}</option>)}
                <option value="">SkanEcom</option>
              </select>
            </div>
            <div className="champ">
              <label htmlFor="ep-modele">Le modèle</label>
              <select id="ep-modele" name="modele" className="entree" defaultValue="code">
                {MODELES_ESSAI.map((x) => <option key={x.cle} value={x.cle}>{x.libelle}</option>)}
              </select>
            </div>
            <div className="ce-gestes">
              <button type="submit" className="btn btn-second"><Icone nom="courriel" taille={16} /> Envoyer l&apos;essai</button>
            </div>
          </form>
        </section>

        <section className="carte carte-plate" aria-labelledby="t-boutiques-titre" id="t-boutiques">
          <div className="carte-tete">
            <div>
            <h2 id="t-boutiques-titre" className="carte-titre-icone"><Icone nom="boutique" /> Les boutiques</h2>
            <p>De qui partent les e-mails de chaque boutique, et où vont les réponses de ses clients.{demos ? ` Les ${demos} boutiques de démonstration n'apparaissent pas.` : ""}</p>
          </div>
          </div>
          {boutiques.length ? (
            <ul className="ce-boutiques" role="list">
              {boutiques.map((b) => {
                const part = ceQuePart(b, expediteur || null);
                const s = b.statut_domaine ? LIBELLES_STATUT_DOMAINE[b.statut_domaine] : null;
                return (
                  <li key={b.id}>
                    <Link href={`/boutiques/${b.slug}/courriels`} className="ce-boutique">
                      <span className="ce-boutique-nom">{b.nom}</span>
                      <span className="ce-boutique-de"><span className="discret">De </span>{part.nom} <span className="ce-adresse">&lt;{adresseOuEtat(part.adresse, fournisseur)}&gt;</span></span>
                      <span className="ce-boutique-rep">
                        <span className="discret">Réponses </span>{part.reponse ?? <span className="discret">à l&apos;expéditeur</span>}
                      </span>
                      <span className="ce-boutique-etat">
                        {b.domaine ? (
                          <span className={b.domaine_actif ? "ui-etat ui-etat-point ui-etat-vert" : s?.classe ?? "ui-etat"}>
                            {b.domaine_actif ? `${b.domaine}, allumé` : `${b.domaine} · ${s?.libelle ?? ""}`}
                          </span>
                        ) : <span className="ui-etat">Domaine de SkanEcom</span>}
                        <Icone nom="droite" taille={14} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <p className="vide">Aucune boutique encore.</p>}
        </section>
      </div>
    </>
  );
}
