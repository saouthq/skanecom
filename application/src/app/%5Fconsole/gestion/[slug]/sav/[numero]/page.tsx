import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prix } from "@/components/Prix";
import { EnTetePage, initiales, styleAvatar } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre, type Role } from "@/lib/console/session";
import { age, lienAppel, lienWhatsApp, quand, telephoneLisible } from "@/lib/gestion/libelles";
import {
  ISSUES_REFUS,
  ISSUES_RESOLUE,
  LIBELLES_STATUT_SAV,
  etapeSavDe,
  libelleIssue,
  messageSav,
  type StatutSav,
} from "@/lib/gestion/sav";

/* ============================================================================
   LA FICHE D'UNE DEMANDE DE SAV — en tête, le geste du moment :
   · nouvelle : rappeler le client (ou WhatsApp, message prêt : « envoyez-
     nous une photo »), puis la prendre en charge ;
   · en cours : la clore, résolue (réparé, échangé, remboursé, conseil) ou
     refusée (hors garantie, mauvaise utilisation, défaut non constaté) ;
   · close : ce qui a été fait, et la rouvrir si le problème revient.
   Puis la demande (l'article, le numéro de série, ce que dit le client, la
   commande, la garantie), le client, et l'historique, où chacun ajoute une
   note. Chaque formulaire envoie l'étape affichée : la base refuse un geste
   qu'un collègue a déjà fait, au lieu de le rejouer.
   ========================================================================== */

type Fiche = {
  numero: string;
  statut: StatutSav;
  issue: string | null;
  cree_le: string;
  cloturee_le: string | null;
  produit_nom: string;
  variante_libelle: string | null;
  sku: string | null;
  numero_serie: string | null;
  description: string;
  ligne: { quantite: number; prix_unitaire_millimes: number } | null;
  commande: { numero: string; cree_le: string; livree_le: string | null; mode_livraison: string; total_millimes: number };
  client: { id: string; nom: string; telephone: string; compte: boolean; nb_commandes: number; nb_refus: number; niveau_risque: string; sav: number } | null;
  garantie: { mois: number; sous_garantie: boolean | null };
  historique: { le: string; statut_avant: StatutSav | null; statut_apres: StatutSav; issue: string | null; note: string | null; par_client: boolean; auteur: string | null }[];
};

const FAIT: Record<string, string> = {
  prendre: "Demande prise en charge.",
  resoudre: "Demande close : résolue.",
  refuser: "Demande close : refusée.",
  rouvrir: "Demande rouverte.",
  noter: "Note ajoutée à l'historique.",
};

const AGIR: Role[] = ["proprietaire", "admin", "confirmateur", "preparateur"];
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Tunis" });

function libelleEvenement(e: Fiche["historique"][number]): string {
  if (e.statut_avant === null) return "Demande faite depuis la boutique en ligne";
  if (e.statut_avant === e.statut_apres) return "Note";
  if (e.statut_apres === "en_cours") return e.statut_avant === "nouvelle" ? "Prise en charge" : "Rouverte";
  const issue = libelleIssue(e.statut_apres, e.issue);
  return `${LIBELLES_STATUT_SAV[e.statut_apres]}${issue ? ` — ${issue.toLowerCase()}` : ""}`;
}

/** Les deux façons de clore, pliées : on ouvre celle qui s'applique. */
function Clore({ action, statut }: { action: string; statut: StatutSav }) {
  return (
    <div className="sav-clore">
      <details className="bo-pli">
        <summary><Icone nom="succes" /> Résolue <Icone nom="bas" className="bo-pli-chevron" /></summary>
        <form action={action} method="post" className="bo-formulaire">
          <input type="hidden" name="geste" value="resoudre" />
          <input type="hidden" name="statut" value={statut} />
          <fieldset className="choix bo-origines">
            <legend>Comment ?</legend>
            {Object.entries(ISSUES_RESOLUE).map(([cle, libelle]) => (
              <label key={cle} className="choix-carte">
                <input type="radio" name="issue" value={cle} required /> <span><b>{libelle}</b></span>
              </label>
            ))}
          </fieldset>
          <div className="champ">
            <label htmlFor="note-resolue">Note <span className="facultatif">(obligatoire pour « Autre »)</span></label>
            <input id="note-resolue" name="note" maxLength={1000} placeholder="Roue changée, rendue au client le 3 octobre" />
          </div>
          <div className="bo-boutons">
            <button type="submit" className="btn btn-succes"><Icone nom="coche" /> Enregistrer : résolue</button>
          </div>
        </form>
      </details>
      <details className="bo-pli">
        <summary><Icone nom="croix" /> Refusée <Icone nom="bas" className="bo-pli-chevron" /></summary>
        <form action={action} method="post" className="bo-formulaire">
          <input type="hidden" name="geste" value="refuser" />
          <input type="hidden" name="statut" value={statut} />
          <fieldset className="choix bo-origines">
            <legend>Pourquoi ?</legend>
            {Object.entries(ISSUES_REFUS).map(([cle, libelle]) => (
              <label key={cle} className="choix-carte">
                <input type="radio" name="issue" value={cle} required /> <span><b>{libelle}</b></span>
              </label>
            ))}
          </fieldset>
          <div className="champ">
            <label htmlFor="note-refusee">Note <span className="facultatif">(obligatoire pour « Autre »)</span></label>
            <input id="note-refusee" name="note" maxLength={1000} placeholder="Chute visible sur la coque : non couvert" />
          </div>
          <p className="aide">Le client lit le motif sur sa page « Mes commandes » ; la note reste à l&apos;équipe.</p>
          <div className="bo-boutons">
            <button type="submit" className="btn btn-danger bo-danger">Enregistrer : refusée</button>
          </div>
        </form>
      </details>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ numero: string }> }): Promise<Metadata> {
  return { title: (await params).numero };
}

export default async function FicheSav({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; numero: string }>;
  searchParams: Promise<{ fait?: string; erreur?: string }>;
}) {
  const [{ slug, numero }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_sav", { p_boutique_id: boutique.boutique_id, p_numero: numero });
  if (error) throw new Error(`Demande illisible : ${error.message}`);
  if (!data) notFound();
  const f = data as Fiche;
  // Le numéro de la commande est-il celui d'un compte SMS confirmé ? (un compte e-mail ne l'a pas prouvé)
  const { data: verifiees } = f.client?.compte
    ? await sb.rpc("gestion_numeros_verifies", { p_boutique_id: boutique.boutique_id, p_commandes: [f.commande.numero] })
    : { data: [] };
  const numeroVerifie = ((verifiees as string[] | null) ?? []).includes(f.commande.numero);

  const maintenant = new Date();
  const action = `/gestion/${slug}/sav/${f.numero}/action`;
  const agit = AGIR.includes(boutique.role);
  const nom = f.client?.nom ?? "Le client";
  const prenom = nom.trim().split(/\s+/)[0] ?? nom;
  const telephone = f.client?.telephone ?? null;
  const issue = libelleIssue(f.statut, f.issue);
  const article = `${f.produit_nom}${f.variante_libelle ? ` (${f.variante_libelle})` : ""}`;
  const whatsapp = telephone ? lienWhatsApp(telephone, messageSav({ prenom, boutique: boutique.nom, numero: f.numero, produit: f.produit_nom })) : null;

  return (
    <>
      <EnTetePage
        avant={<Link href={`/gestion/${slug}/sav?etape=${etapeSavDe(f.statut)}`}><Icone nom="retour" taille={14} /> Service après-vente</Link>}
        titre={
          <span className="bo-fiche-tete">
            <span>{f.numero}</span>
            <span className={`bo-statut sav-statut-${f.statut}`}>{LIBELLES_STATUT_SAV[f.statut]}</span>
            {f.garantie.sous_garantie === true ? <span className="ui-etat ui-etat-vert"><Icone nom="bouclier" taille={12} /> Sous garantie</span> : null}
            {f.garantie.sous_garantie === false ? <span className="ui-etat ui-etat-ambre">Hors garantie</span> : null}
          </span>
        }
        description={<>Signalée {quand(f.cree_le, maintenant)} · {age(f.cree_le, maintenant)} · {article}</>}
      />

      <div className="pile">
        {messages.fait && FAIT[messages.fait] ? (
          <p className="message message-succes bo-message" role="status">
            <span>{FAIT[messages.fait]} <Link href={`/gestion/${slug}/sav`}>Nouvelles demandes</Link></span>
          </p>
        ) : null}
        {messages.erreur ? <p className="message message-erreur bo-message" role="alert">{messages.erreur}</p> : null}

        <div className="grille-2 bo-fiche">
          <div className="pile bo-fiche-principal">
            {/* ---------------- Le geste du moment ---------------- */}
            {f.statut === "nouvelle" ? (
              <section className="carte bo-action" aria-labelledby="action-titre">
                <div className="bo-action-tete">
                  <span className="bo-action-icone"><Icone nom="telephone" /></span>
                  <div>
                    <p className="bo-action-sur">Nouvelle demande</p>
                    <h2 id="action-titre">Rappeler {prenom}</h2>
                  </div>
                </div>
                {agit ? (
                  <>
                    <p className="bo-action-aide">
                      Demandez une photo du problème et convenez de la suite (dépôt au magasin, envoi, échange), puis prenez la demande en charge.
                    </p>
                    {telephone ? (
                      <div className="bo-contact">
                        <a className="btn btn-primaire btn-grand" href={lienAppel(telephone)} aria-label={`Appeler ${nom} au ${telephoneLisible(telephone)}`}>
                          <Icone nom="telephone" /> Appeler {prenom}
                        </a>
                        {whatsapp ? (
                          <a className="btn btn-second btn-grand bo-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer">
                            <Icone nom="message" /> WhatsApp
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                    <form action={action} method="post" className="bo-resultats">
                      <input type="hidden" name="geste" value="prendre" />
                      <input type="hidden" name="statut" value={f.statut} />
                      <div className="champ">
                        <label htmlFor="note-prise" className="sr-only">Note (facultatif)</label>
                        <input id="note-prise" name="note" maxLength={1000} placeholder="Note (facultatif) : dépose la valise samedi au magasin" />
                      </div>
                      <div className="bo-boutons">
                        <button type="submit" className="btn btn-primaire"><Icone nom="coche" /> Prendre en charge</button>
                      </div>
                    </form>
                    <p className="ui-etiquette sav-ou">Ou la clore tout de suite</p>
                    <Clore action={action} statut={f.statut} />
                  </>
                ) : (
                  <p className="bo-action-aide">Le traitement revient au propriétaire, à l&apos;administrateur, à la confirmation ou à la préparation.</p>
                )}
              </section>
            ) : f.statut === "en_cours" ? (
              <section className="carte bo-action" aria-labelledby="action-titre">
                <div className="bo-action-tete">
                  <span className="bo-action-icone"><Icone nom="outil" /></span>
                  <div>
                    <p className="bo-action-sur">En cours de traitement</p>
                    <h2 id="action-titre">Clore la demande</h2>
                  </div>
                </div>
                {agit ? (
                  <>
                    <p className="bo-action-aide">Une fois le problème réglé (ou la demande écartée), dites comment : le client le lit sur son compte.</p>
                    <Clore action={action} statut={f.statut} />
                  </>
                ) : (
                  <p className="bo-action-aide">Le traitement revient au propriétaire, à l&apos;administrateur, à la confirmation ou à la préparation.</p>
                )}
              </section>
            ) : (
              <section className={`carte bo-action bo-cloture sav-cloture-${f.statut}`} aria-labelledby="action-titre">
                <div className="bo-action-tete">
                  <span className="bo-action-icone"><Icone nom={f.statut === "resolue" ? "succes" : "croix"} /></span>
                  <div>
                    <p className="bo-action-sur">Demande close</p>
                    <h2 id="action-titre">{LIBELLES_STATUT_SAV[f.statut]}{issue ? ` : ${issue.toLowerCase()}` : ""}</h2>
                  </div>
                </div>
                <p className="bo-action-aide">
                  Close {f.cloturee_le ? quand(f.cloturee_le, maintenant) : ""}. Si le problème revient, rouvrez-la plutôt que d&apos;attendre une nouvelle demande.
                </p>
                {agit ? (
                  <form action={action} method="post" className="bo-boutons">
                    <input type="hidden" name="geste" value="rouvrir" />
                    <input type="hidden" name="statut" value={f.statut} />
                    <button type="submit" className="btn btn-second"><Icone nom="refus" /> Rouvrir la demande</button>
                  </form>
                ) : null}
              </section>
            )}

            {/* ---------------- La demande ---------------- */}
            <section className="carte" aria-labelledby="demande-titre">
              <div className="carte-tete">
                <div>
                  <h2 id="demande-titre" className="carte-titre-icone"><Icone nom="colis" /> La demande</h2>
                </div>
              </div>
              <div className="sav-article">
                <span className="sav-article-nom">{f.produit_nom}</span>
                <span className="text-petit discret">
                  {[f.variante_libelle, f.sku ? `Réf. ${f.sku}` : null, f.ligne ? `× ${f.ligne.quantite}` : null].filter(Boolean).join(" · ")}
                </span>
              </div>
              <blockquote className="sav-description">{f.description}</blockquote>
              <dl className="liste-def sav-faits">
                <div>
                  <dt>Numéro de série</dt>
                  <dd>{f.numero_serie ?? <span className="discret">non donné</span>}</dd>
                </div>
                <div>
                  <dt>Commande</dt>
                  <dd><Link href={`/gestion/${slug}/commandes/${f.commande.numero}`} className="lien">{f.commande.numero}</Link></dd>
                </div>
                <div>
                  <dt>{f.commande.mode_livraison === "retrait" ? "Retirée le" : "Livrée le"}</dt>
                  <dd>{f.commande.livree_le ? JOUR.format(new Date(f.commande.livree_le)) : "—"}</dd>
                </div>
                {f.ligne ? (
                  <div>
                    <dt>Prix payé</dt>
                    <dd><Prix millimes={f.ligne.prix_unitaire_millimes} /></dd>
                  </div>
                ) : null}
                <div>
                  <dt>Garantie</dt>
                  <dd>
                    {f.garantie.mois > 0
                      ? `${f.garantie.mois} mois annoncés : ${f.garantie.sous_garantie ? "encore couvert" : "échue"}`
                      : <span className="discret">aucune durée annoncée (Réglages)</span>}
                  </dd>
                </div>
              </dl>
            </section>

            {/* ---------------- L'historique ---------------- */}
            <section className="carte" aria-labelledby="historique-titre">
              <div className="carte-tete">
                <div>
                  <h2 id="historique-titre" className="carte-titre-icone"><Icone nom="journal" /> Historique</h2>
                </div>
              </div>
              <ol className="bo-journal">
                {f.historique.map((e, i) => (
                  <li key={`${e.le}-${i}`}>
                    <span className="bo-journal-point" aria-hidden="true" />
                    <span className="bo-journal-texte">
                      {libelleEvenement(e)}
                      {e.note ? <span className="bo-journal-detail"> — {e.note}</span> : null}
                    </span>
                    <span className="bo-journal-meta">
                      <span className="bo-journal-auteur">{e.par_client ? "le client" : (e.auteur ?? "équipe")}</span> ·{" "}
                      <span className="bo-journal-quand">{quand(e.le, maintenant)}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {agit ? (
                <form action={action} method="post" className="bo-formulaire mt-4 sav-noter">
                  <input type="hidden" name="geste" value="noter" />
                  <input type="hidden" name="statut" value={f.statut} />
                  <div className="champ flex-1">
                    <label htmlFor="note-historique" className="sr-only">Ajouter une note</label>
                    <input id="note-historique" name="note" required maxLength={1000} placeholder="Ajouter une note : pièce commandée, rappel prévu…" />
                  </div>
                  <button type="submit" className="btn btn-second">Ajouter</button>
                </form>
              ) : null}
            </section>
          </div>

          <aside className="pile bo-fiche-cote">
            {/* ---------------- Le client ---------------- */}
            <section className="carte" aria-labelledby="client-titre">
              <h2 id="client-titre" className="sr-only">Client</h2>
              <div className="bo-client">
                <span className="avatar avatar-l" style={styleAvatar(nom)} aria-hidden="true">{initiales(nom)}</span>
                <span className="bo-client-texte">
                  <span className="bo-client-nom">{nom}</span>
                  {telephone ? <a className="lien" href={lienAppel(telephone)}>{telephoneLisible(telephone)}</a> : null}
                </span>
              </div>
              {f.client ? (
                <>
                  <p className="ui-etats mt-3">
                    {f.client.compte && numeroVerifie ? <span className="ui-etat ui-etat-vert"><Icone nom="bouclier" taille={12} /> Numéro vérifié par SMS</span> : null}
                    <span className="ui-etat">{f.client.nb_commandes} commande{f.client.nb_commandes > 1 ? "s" : ""}</span>
                    {f.client.sav > 1 ? <span className="ui-etat ui-etat-ambre">{f.client.sav} demandes de SAV</span> : null}
                    {f.client.nb_refus > 0 ? <span className="ui-etat ui-etat-rouge">{f.client.nb_refus} refus à la livraison</span> : null}
                  </p>
                  <p className="text-petit discret mt-3 bo-client-depuis">
                    <Link href={`/gestion/${slug}/clients/${f.client.telephone.replace(/\D/g, "")}`} className="lien">Voir sa fiche <Icone nom="droite" taille={12} /></Link>
                  </p>
                </>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
