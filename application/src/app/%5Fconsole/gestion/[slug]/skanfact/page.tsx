import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone, type NomIcone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { adresseRetourSkanFact, adresseSkanFact, montant, secretPartenaire } from "@/lib/console/skanfact";
import { chiffrementPret } from "@/lib/gestion/chiffre";
import { quand } from "@/lib/gestion/libelles";
import { GENRES_SKANFACT, GESTES_SKANFACT, ecranSkanFact } from "@/lib/gestion/skanfact-libelles";

export const metadata: Metadata = { title: "Facturation SkanFact" };

type Envoi = {
  id: string; commande: string; genre: "facture" | "paiement" | "retour"; cle: string; etat: "a_envoyer" | "refuse";
  essais: number; prochain_essai: string; erreur: string | null; motif: string | null; cree_le: string;
};
type Fait = {
  commande: string; client: string; genre: "facture" | "retour"; motif: string | null; fait_le: string;
  reponse: { facture?: { numero?: string; netAPayer?: string; ecran?: string }; avoir?: { numero?: string; montant?: string; ecran?: string } } | null;
};
type EtatSkanFact = {
  actif: boolean;
  connexion: {
    entreprise: string; nom: string; gestes: string[]; expire_le: string; etat: "connectee" | "coupee"; coupee_le: string | null;
    tva_produits: string | null; tva_livraison: string | null; moment: "confirmation" | "livraison";
    depuis: string; connecte_le: string; connecte_par: string | null;
  } | null;
  file: Envoi[];
  faits: Fait[];
  compteurs: { factures: number; avoirs: number; avant: number };
};

const TAUX = ["19", "13", "7", "0"];
const REGLER = ["proprietaire", "admin"];
const JOUR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Tunis" });

const ETAPES: { icone: NomIcone; titre: string; texte: string }[] = [
  { icone: "lien", titre: "Connecter, en un clic", texte: "Vous passez par SkanFact : vous y choisissez votre entreprise et autorisez SkanEcom. Aucune clé à copier ; l'accès vaut un an, et se coupe à tout moment." },
  { icone: "billet", titre: "Chaque commande, facturée", texte: "La facture naît dans SkanFact, au millime, avec son encaissement ; le paiement à la livraison la solde. Ses écritures suivent : la facturation et la comptabilité, sans double saisie." },
  { icone: "rendre", titre: "Les retours, en avoirs", texte: "Une commande refusée ou annulée après sa facture, un article remboursé au service après-vente : SkanFact en fait l'avoir, l'argent rendu compris." },
];

/* ============================================================================
   LA FACTURATION SKANFACT DU COMMERÇANT (module skanfact, B0 à B4 du contrat
   de SkanFact) — la boutique reliée à l'entreprise du commerçant dans
   SkanFact. Ici : « Connecter SkanFact », la connexion (coupée, bientôt
   expirée), les réglages (taux de TVA, moment de la facture), la file (ce
   que SkanFact a refusé, avec sa phrase et « Réessayer » ; ce qui attend une
   panne), les factures et avoirs faits, et ce qui part vers SkanFact.
   La direction ; la lecture regarde.
   ========================================================================== */
export default async function SkanFact({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_skanfact", { p_boutique_id: boutique.boutique_id });
  if (error) throw new Error(`Facturation SkanFact illisible : ${error.message}`);
  const e = data as EtatSkanFact;
  const regle = REGLER.includes(boutique.role);
  const action = `/gestion/${slug}/skanfact/action`;
  const connecter = `/gestion/${slug}/skanfact/connecter`;
  const url = adresseSkanFact();
  const pret = url !== null && secretPartenaire() !== null && adresseRetourSkanFact() !== null && (await chiffrementPret());
  const c = e.connexion;
  const maintenant = new Date();
  const refuses = e.file.filter((x) => x.etat === "refuse");
  const attente = e.file.filter((x) => x.etat === "a_envoyer");
  const joursRestants = c ? Math.ceil((Date.parse(c.expire_le) - maintenant.getTime()) / 86_400_000) : 0;
  const coupee = c?.etat === "coupee";
  const expireBientot = c?.etat === "connectee" && joursRestants <= 30;
  const aRegler = c !== null && (!c.tva_produits || !c.tva_livraison);

  const boutonConnecter = (libelle: string, principal = true) => (
    <form action={connecter} method="post">
      <button type="submit" className={`btn ${principal ? "btn-primaire" : "btn-second"}`}>
        <Icone nom="lien" taille={16} /> {libelle}
      </button>
    </form>
  );

  return (
    <>
      <EnTetePage
        titre="Facturation SkanFact"
        description={c
          ? `Vos commandes deviennent des factures dans « ${c.nom} », avec leurs encaissements et leurs retours.${e.compteurs.factures ? ` ${e.compteurs.factures} facture${e.compteurs.factures > 1 ? "s" : ""}${e.compteurs.avoirs ? ` et ${e.compteurs.avoirs} avoir${e.compteurs.avoirs > 1 ? "s" : ""}` : ""} jusqu'ici.` : ""}`
          : "Votre facturation et votre comptabilité dans SkanFact, sans double saisie : chaque commande y devient une facture."}
      />
      <div className="pile">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

        {!e.actif && !c ? (
          <div className="vide">
            <span className="vide-icone"><Icone nom="modules" taille={20} /></span>
            <strong>Le module Facturation SkanFact n&apos;est pas allumé</strong>
            <p>Demandez à SkanEcom de l&apos;allumer pour votre boutique ; vous la connecterez ensuite à votre SkanFact.</p>
          </div>
        ) : null}

        {e.actif && !c ? (
          <div className="grille-2">
            <div className="pile">
              <section className="carte sf-connecter" aria-labelledby="t-sf-connecter">
                <div className="carte-tete">
                  <div>
                    <h2 id="t-sf-connecter" className="carte-titre-icone"><Icone nom="lien" /> Connecter votre SkanFact</h2>
                    <p>Vous allez sur SkanFact : connectez-vous, choisissez votre entreprise et autorisez SkanEcom. Vous revenez ensuite ici.</p>
                  </div>
                </div>
                {!pret ? (
                  <p className="message message-erreur" role="alert">SkanFact n&apos;est pas encore branché sur la plateforme : SkanEcom s&apos;en occupe.</p>
                ) : !regle ? (
                  <p className="aide">Le propriétaire ou un administrateur de la boutique la connecte.</p>
                ) : (
                  <div className="pile">
                    {boutonConnecter("Connecter SkanFact")}
                    <p className="aide">Pas encore de compte SkanFact ? La page de SkanFact vous guide pour le créer, puis votre entreprise.</p>
                  </div>
                )}
              </section>
              <Donnees />
            </div>
            <Etapes />
          </div>
        ) : null}

        {c ? (
          <>
            {coupee ? (
              <section className="carte sf-alerte" role="alert" aria-labelledby="t-sf-coupee">
                <h2 id="t-sf-coupee" className="carte-titre-icone"><Icone nom="alerte" /> La connexion à SkanFact est coupée</h2>
                <p>
                  SkanFact a refusé la clé de la boutique {c.coupee_le ? quand(c.coupee_le, maintenant) : ""} : l&apos;accès a été retiré dans SkanFact,
                  ou il a expiré. {attente.length ? `${attente.length} envoi${attente.length > 1 ? "s attendent" : " attend"} dans la file : ${attente.length > 1 ? "ils partiront" : "il partira"} dès la reconnexion.` : "Ce qui arrive attend dans la file."}
                </p>
                {regle && pret ? boutonConnecter("Reconnecter SkanFact") : <p className="aide">Le propriétaire ou un administrateur reconnecte la boutique.</p>}
              </section>
            ) : expireBientot ? (
              <section className="carte sf-alerte sf-alerte-douce" aria-labelledby="t-sf-expire">
                <h2 id="t-sf-expire" className="carte-titre-icone"><Icone nom="horloge" /> La connexion expire {joursRestants > 1 ? `dans ${joursRestants} jours` : "bientôt"}</h2>
                <p>L&apos;accès donné à SkanEcom vaut un an : il finit le {JOUR.format(new Date(c.expire_le))}. Renouvelez-le avant, pour que les factures continuent de partir.</p>
                {regle && pret ? boutonConnecter("Renouveler la connexion", false) : null}
              </section>
            ) : null}
            {aRegler && !coupee ? (
              <p className="message sf-message-attention" role="status">
                Choisissez le taux de TVA de vos produits et celui de la livraison : aucune facture ne part avant.
              </p>
            ) : null}

            <div className="grille-2">
              <div className="pile">
                {e.file.length ? (
                  <section className={`carte${refuses.length ? " sf-renvoyer" : ""}`} aria-labelledby="t-sf-file">
                    <div className="carte-tete">
                      <div>
                        <h2 id="t-sf-file" className="carte-titre-icone"><Icone nom={refuses.length ? "alerte" : "horloge"} /> À voir</h2>
                        <p>
                          {refuses.length ? `${refuses.length} refusé${refuses.length > 1 ? "s" : ""} par SkanFact : corrigez, puis réessayez. ` : ""}
                          {attente.length ? `${attente.length} en attente : ${attente.length > 1 ? "ils repartent" : "il repart"} seul${attente.length > 1 ? "s" : ""}, à l'identique.` : ""}
                        </p>
                      </div>
                    </div>
                    <ul className="sf-liste" role="list">
                      {e.file.map((x) => (
                        <li key={x.id} className="sf-ligne">
                          <span className="sf-ligne-texte">
                            <span>
                              <b>{GENRES_SKANFACT[x.genre]}</b>{" "}
                              <span className="discret">· commande <Link className="sf-ref" href={`/gestion/${slug}/commandes/${encodeURIComponent(x.commande)}`}>{x.commande}</Link></span>
                            </span>
                            {x.etat === "refuse" ? (
                              <span className="sf-erreur">{x.erreur}</span>
                            ) : (
                              <span className="discret">
                                {x.essais ? `${x.erreur ?? "SkanFact n'a pas répondu"} · ${x.essais} essai${x.essais > 1 ? "s" : ""}, prochain essai ${quand(x.prochain_essai, maintenant)}` : "Part dans un instant."}
                              </span>
                            )}
                          </span>
                          {x.etat === "refuse" ? (
                            <form action={action} method="post">
                              <input type="hidden" name="geste" value="reessayer" />
                              <input type="hidden" name="envoi" value={x.id} />
                              <input type="hidden" name="numero" value={x.commande} />
                              <button type="submit" className="btn btn-second">Réessayer</button>
                            </form>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {attente.length && !coupee ? (
                      <form action={action} method="post" className="carte-pied">
                        <input type="hidden" name="geste" value="renvoyer" />
                        <button type="submit" className="btn btn-second btn-bloc">Renvoyer maintenant</button>
                      </form>
                    ) : null}
                  </section>
                ) : null}

                <section className="carte" aria-labelledby="t-sf-connexion">
                  <div className="carte-tete">
                    <div>
                      <h2 id="t-sf-connexion" className="carte-titre-icone"><Icone nom={coupee ? "alerte" : "succes"} /> {coupee ? `Coupée : ${c.nom}` : `Connecté à ${c.nom}`}</h2>
                      <p>Connectée {quand(c.connecte_le, maintenant)}{c.connecte_par ? ` par ${c.connecte_par}` : ""}.</p>
                    </div>
                  </div>
                  <dl className="liste-def fa-fiche">
                    <div><dt>SkanEcom peut</dt><dd className="sf-gestes">{c.gestes.length ? c.gestes.map((g) => <span key={g}>{GESTES_SKANFACT[g] ?? g}</span>) : "—"}</dd></div>
                    <div><dt>Accès valable jusqu&apos;au</dt><dd>{JOUR.format(new Date(c.expire_le))}</dd></div>
                    <div><dt>Commandes facturées depuis le</dt><dd>{JOUR.format(new Date(c.depuis))}</dd></div>
                  </dl>
                  {regle ? (
                    <form action={action} method="post" className="formulaire sf-reglages">
                      <input type="hidden" name="geste" value="regler" />
                      <ChoixTva produits={c.tva_produits} livraison={c.tva_livraison} />
                      <fieldset className="choix sf-moment">
                        <legend>La facture part</legend>
                        <label className="choix-carte">
                          <input type="radio" name="moment" value="confirmation" defaultChecked={c.moment === "confirmation"} />
                          <span><b>À la confirmation de la commande</b><span className="aide">Le paiement à la livraison la solde ; une commande refusée ensuite reçoit son avoir.</span></span>
                        </label>
                        <label className="choix-carte">
                          <input type="radio" name="moment" value="livraison" defaultChecked={c.moment === "livraison"} />
                          <span><b>À la livraison</b><span className="aide">Seule une commande livrée est facturée, avec son encaissement.</span></span>
                        </label>
                      </fieldset>
                      <button type="submit" className="btn btn-primaire">Enregistrer les réglages</button>
                    </form>
                  ) : (
                    <dl className="liste-def fa-fiche">
                      <div><dt>TVA des produits</dt><dd>{c.tva_produits ? `${c.tva_produits} %` : "à choisir"}</dd></div>
                      <div><dt>TVA de la livraison</dt><dd>{c.tva_livraison ? `${c.tva_livraison} %` : "à choisir"}</dd></div>
                      <div><dt>La facture part</dt><dd>{c.moment === "livraison" ? "à la livraison" : "à la confirmation"}</dd></div>
                    </dl>
                  )}
                  {regle ? (
                    <div className="carte-pied fa-pied">
                      {url ? (
                        <a className="btn btn-second" href={`${url}/v10/?e=${encodeURIComponent(c.entreprise)}`} target="_blank" rel="noopener">
                          Ouvrir SkanFact <Icone nom="externe" taille={14} />
                        </a>
                      ) : null}
                      <details className="fa-delier">
                        <summary className="btn btn-fantome">Déconnecter</summary>
                        <form action={action} method="post" className="pile">
                          <input type="hidden" name="geste" value="deconnecter" />
                          <p className="aide">SkanEcom oublie la clé : les prochaines commandes ne partiront plus dans SkanFact. Ce qui est fait reste. Pour couper aussi l&apos;accès côté SkanFact, faites-le dans SkanFact.</p>
                          <button type="submit" className="btn btn-danger">Déconnecter la boutique</button>
                        </form>
                      </details>
                    </div>
                  ) : null}
                </section>
                <section className="carte" aria-labelledby="t-sf-faits">
                  <div className="carte-tete">
                    <div>
                      <h2 id="t-sf-faits" className="carte-titre-icone"><Icone nom="fichier" /> Dernières pièces</h2>
                      <p>{e.faits.length ? "Faites dans SkanFact, la plus récente en haut." : c.moment === "livraison"
                        ? "Aucune encore : la première partira à la prochaine livraison."
                        : "Aucune encore : la première partira à la prochaine commande confirmée."}</p>
                    </div>
                  </div>
                  {e.faits.length ? (
                    <ul className="sf-liste" role="list">
                      {e.faits.map((x, i) => {
                        const piece = x.genre === "retour" ? x.reponse?.avoir : x.reponse?.facture;
                        const lien = ecranSkanFact(url, piece?.ecran);
                        const somme = x.genre === "retour" ? x.reponse?.avoir?.montant : x.reponse?.facture?.netAPayer;
                        return (
                          <li key={`${x.commande}-${i}`} className="sf-ligne">
                            <span className="sf-ligne-texte">
                              <span>
                                {lien ? (
                                  <a href={lien} target="_blank" rel="noopener" className="sf-numero"
                                    aria-label={`${piece?.numero ?? "La pièce"}, à ouvrir dans SkanFact (nouvel onglet)`}>
                                    {piece?.numero} <Icone nom="externe" taille={12} />
                                  </a>
                                ) : <b className="sf-numero">{piece?.numero}</b>}
                                {" "}<span className="discret">· commande <Link className="sf-ref" href={`/gestion/${slug}/commandes/${encodeURIComponent(x.commande)}`}>{x.commande}</Link></span>
                              </span>
                              <span className="discret">{x.genre === "retour" ? `Avoir — ${x.motif ?? "retour"}` : x.client} · {quand(x.fait_le, maintenant)}</span>
                            </span>
                            <b className="tabular-nums sf-montant">{somme ? `${x.genre === "retour" ? "− " : ""}${montant(somme, "TND", "TND")}` : ""}</b>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {e.compteurs.avant ? (
                    <p className="aide sf-avant">
                      {e.compteurs.avant} commande{e.compteurs.avant > 1 ? "s" : ""} d&apos;avant la connexion
                      {e.compteurs.avant > 1 ? " ne sont pas facturées" : " n'est pas facturée"} : chacune se facture depuis sa fiche, si vous le voulez.
                    </p>
                  ) : null}
                </section>
              </div>

              <div className="pile">
                <Donnees />
                <Etapes />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

function ChoixTva({ produits, livraison }: { produits?: string | null; livraison?: string | null }) {
  return (
    <div className="deux-colonnes sf-taux">
      <div className="champ">
        <label htmlFor="sf-tva-produits">TVA de vos produits</label>
        <select id="sf-tva-produits" name="tva_produits" required className="entree" defaultValue={produits ?? ""}>
          <option value="" disabled>Choisir…</option>
          {TAUX.map((t) => <option key={t} value={t}>{t} %</option>)}
        </select>
      </div>
      <div className="champ">
        <label htmlFor="sf-tva-livraison">TVA de la livraison</label>
        <select id="sf-tva-livraison" name="tva_livraison" required className="entree" defaultValue={livraison ?? ""}>
          <option value="" disabled>Choisir…</option>
          {TAUX.map((t) => <option key={t} value={t}>{t} %</option>)}
        </select>
      </div>
      <p className="aide sf-taux-aide">Les prix de la boutique sont TTC : SkanFact en retrouve le HT au millime, avec ces taux. Votre comptable vous les dit.</p>
    </div>
  );
}

function Etapes() {
  return (
    <section className="carte" aria-labelledby="t-sf-etapes">
      <div className="carte-tete">
        <div>
          <h2 id="t-sf-etapes" className="carte-titre-icone"><Icone nom="question" /> Comment ça marche</h2>
        </div>
      </div>
      <ol className="sp-regles sf-etapes" role="list">
        {ETAPES.map((x) => (
          <li key={x.titre}>
            <span className="sp-regle-icone" aria-hidden="true"><Icone nom={x.icone} taille={16} /></span>
            <span><b>{x.titre}</b><br />{x.texte}</span>
          </li>
        ))}
      </ol>
      <p className="aide">La signature électronique et l&apos;envoi à la TTN restent à faire dans SkanFact.</p>
    </section>
  );
}

function Donnees() {
  return (
    <section className="carte" aria-labelledby="t-sf-donnees">
      <div className="carte-tete">
        <div>
          <h2 id="t-sf-donnees" className="carte-titre-icone"><Icone nom="bouclier" /> Ce qui part vers SkanFact</h2>
          <p>Le strict nécessaire à la facture, rien d&apos;autre.</p>
        </div>
      </div>
      <ul className="sf-donnees" role="list">
        <li><b>Le client</b> : son nom (ou sa raison sociale), sa référence dans la boutique, son e-mail, son téléphone, son adresse, son matricule fiscal s&apos;il a un compte professionnel.</li>
        <li><b>Les lignes</b> : chaque article (désignation, code), sa quantité, son prix TTC, son taux de TVA ; la livraison.</li>
        <li><b>Les paiements</b> : l&apos;encaissement, le paiement à la livraison, l&apos;argent rendu d&apos;un retour.</li>
      </ul>
      <p className="aide">Jamais les notes de l&apos;équipe, ni le commentaire d&apos;un refus : le motif d&apos;un avoir est fixe (« Commande refusée à la livraison »…).</p>
    </section>
  );
}
