import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prix } from "@/components/Prix";
import { Bulle, Coche, Telephone } from "@/components/Icones";
import { clientSession, exigeMembre, type Role } from "@/lib/console/session";
import { lieu } from "@/lib/commande";
import {
  LIBELLES_CANAL,
  LIBELLES_ORIGINE_REFUS,
  LIBELLES_RESULTAT,
  LIBELLES_ROLE,
  LIBELLES_STATUT,
  age,
  lienAppel,
  lienWhatsApp,
  messageConfirmation,
  quand,
  telephoneLisible,
} from "@/lib/gestion/libelles";
import { urlFichier } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";

/* ============================================================================
   LA FICHE D'UNE COMMANDE — en tête, le geste du moment, selon l'étape :
   · à confirmer : appeler (ou WhatsApp, message prêt), puis noter le
     résultat — confirmée, injoignable, à rappeler, refus du client ;
   · confirmée : préparer (les références, les quantités, le stock restant)
     et expédier ;
   · expédiée : livrée (paiement encaissé) ou refusée à la livraison, avec
     son origine (client, livreur, injoignable) — le stock revient seul.
   Puis les articles, le client (ses commandes, ses refus), la livraison,
   la note interne et l'historique complet.

   Chaque formulaire envoie l'étape affichée : si un collègue a déjà agi,
   la base refuse le geste au lieu de le rejouer (la fiche se met à jour).
   Les gestes que le rôle du membre ne permet pas ne sont pas proposés.
   ========================================================================== */

type Fiche = {
  numero: string;
  statut: string;
  origine: string;
  cree_le: string;
  mode_paiement: string;
  statut_paiement: string;
  contact: { nom: string; telephone: string; email: string | null };
  livraison: { ligne1: string; ligne2: string | null; ville: string; code_postal: string | null; gouvernorat: string; zone: string | null };
  sous_total_millimes: number;
  frais_livraison_millimes: number;
  remise_millimes: number;
  total_millimes: number;
  transporteur: string | null;
  numero_suivi: string | null;
  refus_origine: string | null;
  refus_commentaire: string | null;
  motif_annulation: string | null;
  note_client: string | null;
  note_interne: string | null;
  confirmee_le: string | null;
  expediee_le: string | null;
  livree_le: string | null;
  cloturee_le: string | null;
  lignes: {
    produit_nom: string;
    variante_libelle: string | null;
    sku: string | null;
    quantite: number;
    prix_unitaire_millimes: number;
    total_ligne_millimes: number;
    stock_restant: number | null;
    image: string | null;
  }[];
  historique: { le: string; avant: string | null; apres: string; origine_refus: string | null; commentaire: string | null; auteur: string | null }[];
  appels: { le: string; canal: string; resultat: string; note: string | null; auteur: string | null }[];
  client: {
    nom: string | null;
    telephone: string;
    compte: boolean;
    nb_commandes: number;
    nb_refus: number;
    niveau_risque: string;
    depuis: string;
  } | null;
  autres: { numero: string; statut: string; cree_le: string; total_millimes: number }[];
};

const FAIT: Record<string, string> = {
  "appel-confirmee": "Commande confirmée : elle passe à la préparation.",
  "appel-injoignable": "Appel noté : injoignable. La commande attend toujours sa confirmation.",
  "appel-rappeler": "Noté : à rappeler.",
  "appel-refus": "Commande annulée : le client a refusé au téléphone. Le stock est rendu.",
  annuler: "Commande annulée. Le stock est rendu.",
  expedier: "Commande expédiée.",
  livrer: "Livraison enregistrée : le paiement est encaissé.",
  refuser: "Refus enregistré. Le stock est rendu.",
  note: "Note interne enregistrée.",
};

const peut = (role: Role, roles: Role[]) => roles.includes(role);
const CONFIRMER: Role[] = ["proprietaire", "admin", "confirmateur"];
const EXPEDIER: Role[] = ["proprietaire", "admin", "preparateur"];
const LIVRER: Role[] = ["proprietaire", "admin", "confirmateur", "preparateur"];

function etapeDe(statut: string): string {
  if (statut === "recue" || statut === "a_arbitrer") return "a_confirmer";
  if (statut === "confirmee") return "a_preparer";
  if (statut === "expediee") return "expediees";
  return "cloturees";
}

function libelleEvenement(e: Fiche["historique"][number]): string {
  if (e.avant === null) return "Commande passée sur la boutique";
  switch (e.apres) {
    case "confirmee": return "Confirmée";
    case "expediee": return "Expédiée";
    case "livree": return "Livrée, paiement encaissé";
    case "refusee": return `Refusée à la livraison — ${(LIBELLES_ORIGINE_REFUS[e.origine_refus ?? ""] ?? "").toLowerCase()}`;
    case "annulee": return "Annulée";
    default: return LIBELLES_STATUT[e.apres] ?? e.apres;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ numero: string }> }): Promise<Metadata> {
  return { title: (await params).numero };
}

export default async function FicheCommande({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; numero: string }>;
  searchParams: Promise<{ fait?: string; erreur?: string }>;
}) {
  const [{ slug, numero }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_commande", { p_boutique_id: boutique.boutique_id, p_numero: numero });
  if (error) throw new Error(`Commande illisible : ${error.message}`);
  if (!data) notFound();
  const f = data as Fiche;

  const role = boutique.role;
  const maintenant = new Date();
  const action = `/gestion/${slug}/commandes/${f.numero}/action`;
  const aConfirmer = f.statut === "recue" || f.statut === "a_arbitrer";
  const articles = f.lignes.reduce((n, l) => n + l.quantite, 0);
  const prenom = f.contact.nom.trim().split(/\s+/)[0] ?? f.contact.nom;
  const annulable = aConfirmer || f.statut === "confirmee";

  const journal = [
    ...f.historique.map((e) => ({
      le: e.le,
      texte: libelleEvenement(e),
      detail: e.commentaire,
      // Sans auteur : la commande passée par l'acheteur, ou un geste du système.
      auteur: e.auteur ?? (e.avant === null ? (f.origine === "vitrine" ? "boutique en ligne" : "saisie") : "système"),
      cle: `e-${e.le}`,
    })),
    ...f.appels.map((a) => ({
      le: a.le,
      texte: `${LIBELLES_CANAL[a.canal] ?? a.canal} · ${LIBELLES_RESULTAT[a.resultat] ?? a.resultat}`,
      detail: a.note,
      auteur: a.auteur ?? "équipe",
      cle: `a-${a.le}`,
    })),
  ].sort((x, y) => x.le.localeCompare(y.le));

  return (
    <>
      <p className="bo-retour">
        <Link href={`/gestion/${slug}?etape=${etapeDe(f.statut)}`}>← Commandes</Link>
      </p>
      <div className="bo-fiche-tete">
        <h1>{f.numero}</h1>
        <span className={`bo-statut bo-statut-${f.statut}`}>{LIBELLES_STATUT[f.statut] ?? f.statut}</span>
        <p className="bo-fiche-quand">
          Passée {quand(f.cree_le, maintenant)} · {age(f.cree_le, maintenant)} · {articles} article{articles > 1 ? "s" : ""} ·{" "}
          <strong>{formatePrix(f.total_millimes)}</strong> à la livraison
        </p>
      </div>

      {messages.fait && FAIT[messages.fait] ? (
        <p className="message message-succes bo-message" role="status">
          {FAIT[messages.fait]}{" "}
          <Link href={`/gestion/${slug}?etape=a_confirmer`} className="bo-lien">Commandes à confirmer →</Link>
        </p>
      ) : null}
      {messages.erreur ? <p className="message message-erreur bo-message" role="alert">{messages.erreur}</p> : null}

      <div className="bo-fiche">
        <div className="bo-fiche-principal">
          {/* ---------------- Le geste du moment ---------------- */}
          {aConfirmer ? (
            <section className="carte bo-action" aria-labelledby="action-titre">
              <h2 id="action-titre">Confirmer la commande</h2>
              {peut(role, CONFIRMER) ? (
                <>
                  <p className="bo-action-aide">
                    Appelez {prenom} pour confirmer l&apos;adresse et la disponibilité, puis notez le résultat.
                  </p>
                  <div className="bo-contact">
                    <a className="btn btn-primaire" href={lienAppel(f.contact.telephone)}>
                      <Telephone taille={18} /> Appeler le {telephoneLisible(f.contact.telephone)}
                    </a>
                    <a
                      className="btn btn-second"
                      href={lienWhatsApp(
                        f.contact.telephone,
                        messageConfirmation({ prenom, boutique: boutique.nom, numero: f.numero, totalMillimes: f.total_millimes, articles, ville: f.livraison.ville }),
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Bulle taille={18} /> WhatsApp
                    </a>
                  </div>
                  <form action={action} method="post" className="bo-resultats">
                    <input type="hidden" name="action" value="appel" />
                    <fieldset className="bo-canal">
                      <legend>Contacté par</legend>
                      <label className="opt">
                        <input type="radio" name="canal" value="appel" defaultChecked /> Appel
                      </label>
                      <label className="opt">
                        <input type="radio" name="canal" value="whatsapp" /> WhatsApp
                      </label>
                    </fieldset>
                    <div className="champ">
                      <label htmlFor="note-appel">
                        Note <span className="bo-facultatif">(facultatif)</span>
                      </label>
                      <input id="note-appel" name="note" maxLength={500} placeholder="Préfère être livré après 17 h" />
                    </div>
                    <div className="bo-boutons">
                      <button type="submit" name="resultat" value="confirmee" className="btn btn-primaire">
                        <Coche taille={16} /> Confirmée
                      </button>
                      <button type="submit" name="resultat" value="injoignable" className="btn btn-second">Injoignable</button>
                      <button type="submit" name="resultat" value="rappeler" className="btn btn-second">À rappeler</button>
                      <button type="submit" name="resultat" value="refus" className="btn btn-second bo-danger">Refus du client</button>
                    </div>
                  </form>
                  {f.appels.length > 0 ? (
                    <p className="bo-action-aide">
                      Déjà {f.appels.length} tentative{f.appels.length > 1 ? "s" : ""} : dernière{" "}
                      {(LIBELLES_RESULTAT[f.appels[f.appels.length - 1].resultat] ?? "").toLowerCase()},{" "}
                      {quand(f.appels[f.appels.length - 1].le, maintenant)}.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="bo-action-aide">La confirmation revient au propriétaire, à l&apos;administrateur ou à la personne chargée des appels.</p>
              )}
            </section>
          ) : f.statut === "confirmee" ? (
            <section className="carte bo-action" aria-labelledby="action-titre">
              <h2 id="action-titre">Préparer et expédier</h2>
              <p className="bo-action-aide">
                Confirmée {f.confirmee_le ? quand(f.confirmee_le, maintenant) : ""}. Préparez les articles ci-dessous, puis remettez le colis au livreur.
              </p>
              {peut(role, EXPEDIER) ? (
                <form action={action} method="post" className="bo-formulaire">
                  <input type="hidden" name="action" value="expedier" />
                  <input type="hidden" name="statut" value={f.statut} />
                  <div className="bo-deux">
                    <div className="champ">
                      <label htmlFor="transporteur">Transporteur</label>
                      <input id="transporteur" name="transporteur" maxLength={80} defaultValue={f.transporteur ?? ""} placeholder="Nom du livreur ou de la société" />
                    </div>
                    <div className="champ">
                      <label htmlFor="suivi">
                        Numéro de suivi <span className="bo-facultatif">(facultatif)</span>
                      </label>
                      <input id="suivi" name="suivi" maxLength={80} defaultValue={f.numero_suivi ?? ""} />
                    </div>
                  </div>
                  <div className="bo-boutons">
                    <button type="submit" className="btn btn-primaire">Marquer expédiée</button>
                  </div>
                </form>
              ) : (
                <p className="bo-action-aide">L&apos;expédition revient au propriétaire, à l&apos;administrateur ou à la préparation.</p>
              )}
            </section>
          ) : f.statut === "expediee" ? (
            <section className="carte bo-action" aria-labelledby="action-titre">
              <h2 id="action-titre">Livraison</h2>
              <p className="bo-action-aide">
                Expédiée {f.expediee_le ? quand(f.expediee_le, maintenant) : ""}
                {f.transporteur ? ` avec ${f.transporteur}` : ""}
                {f.numero_suivi ? ` · suivi ${f.numero_suivi}` : ""}. Le livreur encaisse {formatePrix(f.total_millimes)}.
              </p>
              {peut(role, LIVRER) ? (
                <>
                  <form action={action} method="post" className="bo-boutons">
                    <input type="hidden" name="action" value="livrer" />
                    <input type="hidden" name="statut" value={f.statut} />
                    <button type="submit" className="btn btn-primaire">
                      <Coche taille={16} /> Livrée, paiement encaissé
                    </button>
                  </form>
                  <details className="bo-pli">
                    <summary>Refusée à la livraison</summary>
                    <form action={action} method="post" className="bo-formulaire">
                      <input type="hidden" name="action" value="refuser" />
                      <input type="hidden" name="statut" value={f.statut} />
                      <fieldset className="bo-origines">
                        <legend>D&apos;où vient le refus ?</legend>
                        {Object.entries(LIBELLES_ORIGINE_REFUS).map(([cle, libelle]) => (
                          <label key={cle} className="opt">
                            <input type="radio" name="origine" value={cle} required /> {libelle}
                          </label>
                        ))}
                      </fieldset>
                      <div className="champ">
                        <label htmlFor="commentaire">
                          Commentaire <span className="bo-facultatif">(facultatif)</span>
                        </label>
                        <input id="commentaire" name="commentaire" maxLength={500} placeholder="Absent deux fois, colis revenu" />
                      </div>
                      <p className="bo-action-aide">Le stock revient automatiquement. Un refus du client ou un client injoignable compte sur sa fiche.</p>
                      <div className="bo-boutons">
                        <button type="submit" className="btn btn-second bo-danger">Enregistrer le refus</button>
                      </div>
                    </form>
                  </details>
                </>
              ) : (
                <p className="bo-action-aide">Votre rôle ne permet pas d&apos;enregistrer la livraison.</p>
              )}
            </section>
          ) : (
            <section className="carte bo-action bo-cloture" aria-labelledby="action-titre">
              <h2 id="action-titre">{LIBELLES_STATUT[f.statut] ?? f.statut}</h2>
              <p className="bo-action-aide">
                {f.statut === "livree"
                  ? `Livrée ${f.livree_le ? quand(f.livree_le, maintenant) : ""} : ${formatePrix(f.total_millimes)} encaissés.`
                  : f.statut === "refusee"
                    ? `${LIBELLES_ORIGINE_REFUS[f.refus_origine ?? ""] ?? "Refusée"}${f.refus_commentaire ? ` : ${f.refus_commentaire}` : ""}. Le stock est revenu.`
                    : `Motif : ${f.motif_annulation ?? "non précisé"}. Le stock est revenu.`}
              </p>
            </section>
          )}

          {annulable && peut(role, CONFIRMER) ? (
            <details className="bo-pli bo-annuler">
              <summary>Annuler la commande</summary>
              <form action={action} method="post" className="bo-formulaire">
                <input type="hidden" name="action" value="annuler" />
                <input type="hidden" name="statut" value={f.statut} />
                <div className="champ">
                  <label htmlFor="motif">Motif de l&apos;annulation</label>
                  <input id="motif" name="motif" required minLength={3} maxLength={500} placeholder="Doublon, rupture, demande du client…" />
                </div>
                <div className="bo-boutons">
                  <button type="submit" className="btn btn-second bo-danger">Annuler la commande</button>
                </div>
              </form>
            </details>
          ) : null}

          {/* ---------------- Les articles ---------------- */}
          <section className="carte" aria-labelledby="articles-titre">
            <h2 id="articles-titre">Articles</h2>
            <ul className="bo-articles">
              {f.lignes.map((l, i) => (
                <li key={`${l.sku}-${i}`} className="bo-article">
                  <span className="bo-vignette">
                    {l.image ? <Image src={urlFichier(l.image)} alt="" fill sizes="56px" /> : null}
                  </span>
                  <span className="bo-article-corps">
                    <span className="bo-article-nom">{l.produit_nom}</span>
                    {l.variante_libelle ? <span className="text-petit text-encre-doux">{l.variante_libelle}</span> : null}
                    <span className="text-petit text-encre-doux tabular-nums">
                      {l.sku ? `Réf. ${l.sku}` : "Sans référence"}
                      {l.stock_restant !== null ? ` · reste ${l.stock_restant} en stock` : ""}
                    </span>
                  </span>
                  <span className="bo-article-qte">× {l.quantite}</span>
                  <span className="bo-article-prix">
                    <Prix millimes={l.total_ligne_millimes} />
                  </span>
                </li>
              ))}
            </ul>
            <dl className="bo-totaux">
              <div>
                <dt>Sous-total</dt>
                <dd><Prix millimes={f.sous_total_millimes} /></dd>
              </div>
              <div>
                <dt>Livraison{f.livraison.zone ? ` (${f.livraison.zone})` : ""}</dt>
                <dd>{f.frais_livraison_millimes === 0 ? "Offerte" : <Prix millimes={f.frais_livraison_millimes} />}</dd>
              </div>
              <div className="bo-total">
                <dt>À encaisser</dt>
                <dd><Prix millimes={f.total_millimes} fort /></dd>
              </div>
            </dl>
          </section>

          {/* ---------------- L'historique ---------------- */}
          <section className="carte" aria-labelledby="historique-titre">
            <h2 id="historique-titre">Historique</h2>
            <ol className="bo-journal">
              {journal.map((j) => (
                <li key={j.cle}>
                  <span className="bo-journal-quand">{quand(j.le, maintenant)}</span>
                  <span className="bo-journal-texte">
                    {j.texte}
                    {j.detail ? <span className="bo-journal-detail"> — {j.detail}</span> : null}
                  </span>
                  <span className="bo-journal-auteur">{j.auteur}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="bo-fiche-cote">
          {/* ---------------- Le client ---------------- */}
          <section className="carte" aria-labelledby="client-titre">
            <h2 id="client-titre">Client</h2>
            <p className="bo-client-nom">{f.contact.nom}</p>
            <p>
              <a className="bo-lien" href={lienAppel(f.contact.telephone)}>{telephoneLisible(f.contact.telephone)}</a>
            </p>
            {f.client ? (
              <>
                <p className="bo-badges">
                  {f.client.compte ? <span className="bo-badge bo-badge-ok">Numéro vérifié par SMS</span> : <span className="bo-badge">Commande en invité</span>}
                  {f.client.nb_commandes <= 1 ? <span className="bo-badge">Nouveau client</span> : <span className="bo-badge">{f.client.nb_commandes} commandes</span>}
                  {f.client.nb_refus > 0 ? <span className="bo-badge bo-badge-alerte">{f.client.nb_refus} refus à la livraison</span> : null}
                  {f.client.niveau_risque !== "normal" ? (
                    <span className="bo-badge bo-badge-alerte">{f.client.niveau_risque === "bloque" ? "Bloqué" : "Surveillé"}</span>
                  ) : null}
                </p>
                <p className="text-petit text-encre-doux">Client depuis le {new Date(f.client.depuis).toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis" })}</p>
              </>
            ) : null}
            {f.autres.length > 0 ? (
              <>
                <h3 className="bo-sous-titre">Ses autres commandes</h3>
                <ul className="bo-autres">
                  {f.autres.map((o) => (
                    <li key={o.numero}>
                      <Link href={`/gestion/${slug}/commandes/${o.numero}`} className="bo-lien">{o.numero}</Link>
                      <span className={`bo-statut bo-statut-${o.statut}`}>{LIBELLES_STATUT[o.statut] ?? o.statut}</span>
                      <Prix millimes={o.total_millimes} />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          {/* ---------------- La livraison ---------------- */}
          <section className="carte" aria-labelledby="livraison-titre">
            <h2 id="livraison-titre">Livraison</h2>
            <address className="bo-adresse">
              {f.contact.nom}
              <br />
              {f.livraison.ligne1}
              {f.livraison.ligne2 ? (
                <>
                  <br />
                  {f.livraison.ligne2}
                </>
              ) : null}
              <br />
              {f.livraison.code_postal ? `${f.livraison.code_postal} ` : ""}
              {lieu(f.livraison.ville, f.livraison.gouvernorat)}
            </address>
            {f.note_client ? (
              <p className="bo-note-client">
                <strong>Note du client :</strong> {f.note_client}
              </p>
            ) : null}
          </section>

          {/* ---------------- La note interne ---------------- */}
          <section className="carte" aria-labelledby="note-titre">
            <h2 id="note-titre">Note interne</h2>
            {role !== "lecture" ? (
              <form action={action} method="post" className="bo-formulaire">
                <input type="hidden" name="action" value="note" />
                <div className="champ">
                  <label htmlFor="note-interne" className="sr-only">Note interne</label>
                  <textarea id="note-interne" name="note" maxLength={2000} rows={3} defaultValue={f.note_interne ?? ""}
                    placeholder="Visible par l'équipe seulement" />
                </div>
                <div className="bo-boutons">
                  <button type="submit" className="btn btn-second">Enregistrer la note</button>
                </div>
              </form>
            ) : (
              <p className="text-petit text-encre-doux">{f.note_interne ?? "Aucune note."}</p>
            )}
            <p className="text-petit text-encre-doux bo-role">Vous êtes : {LIBELLES_ROLE[role] ?? role}.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
