import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/console/Icone";
import { BoutonCopier } from "@/components/console/BoutonCopier";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { titreBoutique } from "@/lib/console/titre-boutique";
import { adresseOuEtat, ceQuePart, domaineSuggere, LIBELLES_STATUT_DOMAINE, quandLisible, type CourrielsBoutique } from "@/lib/console/courriels";
import { fournisseurCourant, hoteRelatif, LIBELLES_FOURNISSEUR, type Enregistrement } from "@/lib/courriels/domaines";
import { MODELES_ESSAI } from "@/lib/courriels/essai";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: await titreBoutique(params, "E-mails") };
}

/* ============================================================================
   LES E-MAILS D'UNE BOUTIQUE (migration …_courriels_expediteur) — ce que
   reçoivent ses clients : au nom de qui, où vont leurs réponses, et depuis
   quelle adresse. Rien n'est réglé par défaut : le nom de la boutique,
   l'adresse de la plateforme, pas d'adresse de réponse. Son propre domaine
   s'ajoute chez le fournisseur, se vérifie, puis s'allume ; un essai part
   comme un vrai e-mail de la boutique.
   ========================================================================== */

type Messages = { ok?: string; erreur?: string; carte?: string };

export default async function CourrielsDeLaBoutique({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Messages>;
}) {
  const { user, role } = await exigeAdmin();
  const peutRegler = role === "super_admin";
  const [{ slug }, m] = await Promise.all([params, searchParams]);
  const service = clientService();
  const { data: fiche } = await service.rpc("console_boutique", { p_slug: slug });
  if (!fiche) notFound();
  const id = (fiche.boutique as { id: string }).id;
  const { data, error } = await service.rpc("console_courriels_boutique", { p_acteur: user.id, p_boutique_id: id });
  if (error) throw new Error(`Réglages d'envoi illisibles : ${error.message}`);
  const b = data as CourrielsBoutique;
  const { fournisseur, expediteur } = fournisseurCourant();
  const part = ceQuePart(b, expediteur || null);
  const base = `/boutiques/${slug}/courriels`;
  const message = (carte: string) => m.carte === carte ? (
    <>
      {m.ok ? <p className="message message-succes ce-retour" role="status">{m.ok}</p> : null}
      {m.erreur ? <p className="message message-erreur ce-retour" role="alert">{m.erreur}</p> : null}
    </>
  ) : null;
  const statut = b.statut_domaine ? LIBELLES_STATUT_DOMAINE[b.statut_domaine] : null;
  const requis = b.enregistrements.filter((e) => !e.conseille);
  const vus = requis.filter((e) => e.etat === "ok" || e.vu).length;

  return (
    <>
      <div className="sous-tete">
        <h2>E-mails</h2>
        <p>
          Ce que reçoivent ses clients (codes de connexion, suivi des commandes, lettre) : au nom de qui, où vont leurs réponses,
          et depuis quelle adresse. Rien n&apos;est réglé par défaut.{peutRegler ? null : <> Seul un super-administrateur les règle.</>}
        </p>
      </div>
      <div className="grid gap-5">
        {/* Ce que voit le client dans sa boîte, d'un coup d'œil. */}
        <section className="carte ce-vu" aria-labelledby="t-vu">
          <h3 id="t-vu" className="sr-only">Ce que voit le client</h3>
          <div className="ce-vu-boite" aria-hidden="true"><Icone nom="courriel" taille={18} /></div>
          <dl className="ce-vu-lignes">
            <div><dt>De</dt><dd><b>{part.nom}</b> <span className="ce-adresse">&lt;{adresseOuEtat(part.adresse, fournisseur)}&gt;</span></dd></div>
            <div><dt>Répondre à</dt><dd>{part.reponse ?? <span className="discret">l&apos;adresse d&apos;expédition (aucune adresse de réponse)</span>}</dd></div>
          </dl>
          <span className={part.depuisDomaine ? "ui-etat ui-etat-point ui-etat-vert" : "ui-etat"}>
            {part.depuisDomaine ? "Depuis son domaine" : "Depuis SkanEcom"}
          </span>
        </section>

        <section className="carte" aria-labelledby="t-expediteur-titre" id="t-expediteur">
          <div className="carte-tete">
            <div>
            <h2 id="t-expediteur-titre" className="carte-titre-icone"><Icone nom="personne" /> Au nom de, et les réponses</h2>
            <p>Le nom que lit le client, et l&apos;adresse où arrivent ses réponses : celle de la boutique, pour qu&apos;elle lui réponde elle-même.</p>
          </div>
          </div>
          {message("expediteur")}
          <form action={`${base}/reglages`} method="post" className="ce-form">
            <input type="hidden" name="boutique_id" value={b.id} />
            <div className="champ">
              <label htmlFor="ce-nom">Nom affiché</label>
              <input id="ce-nom" name="nom" className="entree" maxLength={60} autoComplete="off" defaultValue={b.nom_expediteur ?? ""}
                placeholder={b.nom} disabled={!peutRegler} aria-describedby="ce-nom-aide" />
              <span className="aide" id="ce-nom-aide">Vide : « {b.nom} ».</span>
            </div>
            <div className="champ">
              <label htmlFor="ce-reponse">Les réponses vont à</label>
              <input id="ce-reponse" name="reponse_a" type="email" className="entree" autoComplete="off" inputMode="email"
                defaultValue={b.reponse_a ?? ""} placeholder={b.email_boutique ?? "contact@boutique.tn"} disabled={!peutRegler} aria-describedby="ce-reponse-aide" />
              <span className="aide" id="ce-reponse-aide">
                Vide : la réponse revient à l&apos;adresse d&apos;expédition{part.depuisDomaine ? " (son domaine)" : " de SkanEcom"}.
                {b.email_boutique ? <> Son e-mail (Réglages → Mentions légales) : {b.email_boutique}.</> : <> Elle n&apos;a pas encore donné d&apos;e-mail dans ses mentions légales.</>}
              </span>
            </div>
            {peutRegler ? (
              <div className="ce-gestes">
                <button type="submit" className="btn btn-primaire">Enregistrer</button>
                {b.email_boutique && b.email_boutique !== b.reponse_a ? (
                  <button type="submit" name="reponse_boutique" value="1" className="btn btn-second">
                    Répondre à {b.email_boutique}
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>
        </section>

        <section className="carte" aria-labelledby="t-domaine-titre" id="t-domaine">
          <div className="carte-tete">
            <div>
              <h2 id="t-domaine-titre" className="carte-titre-icone"><Icone nom="domaine" /> Envoyer depuis son domaine</h2>
              <p>
                Ses e-mails partent alors de {b.adresse_locale}@{b.domaine ?? (domaineSuggere(b.hote_principal) || "son-domaine.tn")} : le client reconnaît la boutique,
                et les messageries les classent mieux. Coupé tant qu&apos;il n&apos;est pas vérifié.
              </p>
            </div>
            {b.domaine ? (
              <span className="ce-etats">
                {statut ? <span className={statut.classe}>{statut.libelle}</span> : null}
                <span className={b.domaine_actif ? "ui-etat ui-etat-point ui-etat-vert" : "ui-etat"}>{b.domaine_actif ? "Allumé" : "Coupé"}</span>
              </span>
            ) : null}
          </div>
          {message("domaine")}
          {b.domaine ? (
            <Domaine b={b} base={base} peutRegler={peutRegler} vus={vus} requis={requis.length} />
          ) : fournisseur === "aucun" ? (
            <p className="message message-attention">Aucun fournisseur d&apos;e-mails n&apos;est branché (secret COURRIELS_ENVOI) : le domaine s&apos;ajoutera une fois Resend ou Brevo choisi.</p>
          ) : (
            <form action={`${base}/domaine`} method="post" className="ce-form ce-ajout">
              <input type="hidden" name="boutique_id" value={b.id} />
              <div className="champ ce-adresse-champ">
                <label htmlFor="cd-locale">Adresse d&apos;envoi</label>
                <span className="ce-adresse-saisie">
                  <input id="cd-locale" name="adresse_locale" className="entree" defaultValue={b.adresse_locale} maxLength={40}
                    autoComplete="off" spellCheck={false} aria-label="Avant l'arobase" disabled={!peutRegler} />
                  <span aria-hidden="true">@</span>
                  <input id="cd-domaine" name="domaine" className="entree" defaultValue={domaineSuggere(b.hote_principal)} placeholder="maymar.tn"
                    required autoComplete="off" spellCheck={false} inputMode="url" aria-label="Le domaine" disabled={!peutRegler} />
                </span>
                <span className="aide">
                  {domaineSuggere(b.hote_principal) ? <>Le domaine de sa vitrine, proposé. </> : null}
                  Un domaine que la boutique possède : il faudra poser trois ou quatre enregistrements dans sa zone DNS.
                </span>
              </div>
              {fournisseur === "apercu" ? (
                <p className="aide ce-note"><Icone nom="alerte" taille={14} /> L&apos;aperçu en ligne n&apos;envoie rien : les enregistrements montrés seront des exemples, et la vérification ne lira que le DNS public.</p>
              ) : null}
              {peutRegler ? (
                <div className="ce-gestes">
                  <button type="submit" name="geste" value="ajouter" className="btn btn-primaire">
                    Ajouter chez {LIBELLES_FOURNISSEUR[fournisseur].replace(/ \(.*\)$/, "")}
                  </button>
                </div>
              ) : null}
            </form>
          )}
        </section>

        <section className="carte" aria-labelledby="t-essai-titre" id="t-essai">
          <div className="carte-tete">
            <div>
            <h2 id="t-essai-titre" className="carte-titre-icone"><Icone nom="outil" /> Envoyer un essai</h2>
            <p>
              Comme un vrai e-mail de la boutique : son nom, ses réponses, son domaine s&apos;il est allumé ; le sujet commence par [Essai].
              Compté à SkanEcom, jamais à son quota.
            </p>
          </div>
          </div>
          {message("essai")}
          <form action="/courriels/essai" method="post" className="ce-form ce-essai">
            <input type="hidden" name="boutique_id" value={b.id} />
            <input type="hidden" name="retour" value={slug} />
            <div className="champ">
              <label htmlFor="ce-a">À</label>
              <input id="ce-a" name="a" type="email" className="entree" required autoComplete="email" defaultValue={user.email ?? ""} />
            </div>
            <div className="champ">
              <label htmlFor="ce-modele">Le modèle</label>
              <select id="ce-modele" name="modele" className="entree" defaultValue="code">
                {MODELES_ESSAI.filter((x) => x.boutique).map((x) => <option key={x.cle} value={x.cle}>{x.libelle}</option>)}
              </select>
            </div>
            <div className="ce-gestes">
              <button type="submit" className="btn btn-second"><Icone nom="courriel" taille={16} /> Envoyer l&apos;essai</button>
            </div>
          </form>
        </section>

        <p className="aide">
          Ce qui part pour elle ce mois-ci : <Link href={`/consommation#t-b-${slug}`}>Consommation</Link> · chaque envoi : <Link href="/journal?vue=envois">Journal → Envois</Link> ·
          l&apos;expéditeur de la plateforme : <Link href="/courriels/envoi">E-mails → Envoi</Link>.
        </p>
      </div>
    </>
  );
}

/** Le domaine ajouté : ses enregistrements DNS, leur état, les gestes. */
function Domaine({ b, base, peutRegler, vus, requis }: { b: CourrielsBoutique; base: string; peutRegler: boolean; vus: number; requis: number }) {
  const domaine = b.domaine ?? "";
  const adresse = `${b.adresse_locale}@${domaine}`;
  const exemples = b.enregistrements.some((e) => e.exemple);
  return (
    <div className="ce-domaine">
      <ol className="ce-etapes" role="list">
        <li data-fait=""><span className="ce-puce"><Icone nom="coche" taille={12} /></span> Ajouté chez {LIBELLES_FOURNISSEUR[(b.fournisseur ?? "aucun") as keyof typeof LIBELLES_FOURNISSEUR] ?? b.fournisseur}</li>
        <li data-fait={vus === requis && requis > 0 ? "" : undefined}>
          <span className="ce-puce">{vus === requis && requis > 0 ? <Icone nom="coche" taille={12} /> : 2}</span> Enregistrements DNS posés{requis ? ` (${vus} sur ${requis})` : ""}
        </li>
        <li data-fait={b.statut_domaine === "verifie" ? "" : undefined}>
          <span className="ce-puce">{b.statut_domaine === "verifie" ? <Icone nom="coche" taille={12} /> : 3}</span> Vérifié
          {b.verifie_le ? <span className="discret"> {quandLisible(b.verifie_le)}</span> : null}
        </li>
        <li data-fait={b.domaine_actif ? "" : undefined}>
          <span className="ce-puce">{b.domaine_actif ? <Icone nom="coche" taille={12} /> : 4}</span> Allumé : les e-mails partent de {adresse}
        </li>
      </ol>

      <p className="aide">
        À poser dans la zone DNS de <b>{domaine}</b> (chez son registrar, ou chez Cloudflare), tels quels. Le fournisseur les voit en quelques minutes,
        parfois jusqu&apos;à 48 heures.{b.derniere_verif ? <> Dernière vérification {quandLisible(b.derniere_verif)}.</> : null}
      </p>
      {exemples ? <p className="message message-attention">Aperçu en ligne : ces valeurs sont des exemples, à ne pas recopier. En production, les vraies viennent du fournisseur.</p> : null}
      <div className="ce-dns-cadre">
        <table className="ce-dns">
          <thead>
            <tr><th scope="col">Type</th><th scope="col">Nom</th><th scope="col">Valeur</th><th scope="col">État</th></tr>
          </thead>
          <tbody>
            {b.enregistrements.map((e, i) => <LigneDns key={`${e.nom}-${e.type}-${i}`} e={e} domaine={domaine} />)}
          </tbody>
        </table>
      </div>

      <div className="ce-gestes">
        <form action={`${base}/domaine`} method="post">
          <input type="hidden" name="boutique_id" value={b.id} />
          <button type="submit" name="geste" value="verifier" className={b.statut_domaine === "verifie" ? "btn btn-second" : "btn btn-primaire"}>
            <Icone nom="refaire" taille={16} /> Vérifier maintenant
          </button>
        </form>
        {peutRegler && b.statut_domaine === "verifie" ? (
          <form action={`${base}/domaine`} method="post">
            <input type="hidden" name="boutique_id" value={b.id} />
            {b.domaine_actif ? (
              <button type="submit" name="geste" value="couper" className="btn btn-second">Couper : repartir de SkanEcom</button>
            ) : (
              <button type="submit" name="geste" value="allumer" className="btn btn-primaire">Envoyer depuis {adresse}</button>
            )}
          </form>
        ) : null}
        {peutRegler ? (
          <details className="bt-confirmer ce-retirer" data-reste-ouvert>
            <summary className="btn btn-fantome"><Icone nom="corbeille" taille={16} /> Retirer le domaine</summary>
            <div className="bt-confirmer-panneau" role="group" aria-label="Confirmer le retrait du domaine">
              <p>Ses e-mails repartent de l&apos;adresse de SkanEcom. Le domaine reste chez le fournisseur : il se retrouve d&apos;un geste.</p>
              <form action={`${base}/domaine`} method="post">
                <input type="hidden" name="boutique_id" value={b.id} />
                <button type="submit" name="geste" value="retirer" className="btn btn-danger btn-petit">Retirer {domaine}</button>
              </form>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function LigneDns({ e, domaine }: { e: Enregistrement; domaine: string }) {
  const hote = hoteRelatif(e.nom, domaine);
  const ok = e.etat === "ok";
  const etat = ok ? { t: "Vérifié", c: "ui-etat ui-etat-point ui-etat-vert" }
    : e.etat === "echec" ? { t: "Refusé", c: "ui-etat ui-etat-point ui-etat-rouge" }
    : e.vu ? { t: "Vu dans le DNS", c: "ui-etat ui-etat-point ui-etat-vert" }
    : e.vu === false ? { t: "Pas encore posé", c: "ui-etat ui-etat-point ui-etat-ambre" }
    : e.conseille ? { t: "Conseillé", c: "ui-etat" }
    : { t: "En attente", c: "ui-etat ui-etat-point ui-etat-ambre" };
  return (
    <tr>
      <td data-titre="Type"><span className="ce-type">{e.type}</span>{e.priorite != null ? <span className="discret"> · priorité {e.priorite}</span> : null}<span className="ce-role">{e.role}</span></td>
      <td data-titre="Nom">
        <code className="ce-code">{hote}</code>
        {hote !== "@" ? <span className="ce-complet">{e.nom}</span> : null}
        <BoutonCopier texte={hote} libelle="Copier" classe="btn btn-fantome btn-petit ce-copier" />
      </td>
      <td data-titre="Valeur">
        <code className="ce-code ce-valeur">{e.valeur}</code>
        {e.exemple ? null : <BoutonCopier texte={e.valeur} libelle="Copier" classe="btn btn-fantome btn-petit ce-copier" />}
      </td>
      <td data-titre="État"><span className={etat.c}>{etat.t}</span>{e.conseille && !ok ? <span className="ce-role">demandé par Gmail et Yahoo</span> : null}</td>
    </tr>
  );
}
