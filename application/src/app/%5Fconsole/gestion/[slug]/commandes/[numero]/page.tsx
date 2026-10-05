import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prix } from "@/components/Prix";
import { EnTetePage, initiales, styleAvatar } from "@/components/console/Coquille";
import { RetourAppel } from "@/components/console/Raccourcis";
import { Icone } from "@/components/console/Icone";
import { FactureSkanFact, type EtatFactureSkanFact } from "@/components/console/FactureSkanFact";
import { adresseSkanFact } from "@/lib/console/skanfact";
import { clientSession, exigeMembre, type Role } from "@/lib/console/session";
import { lieu, type Magasin } from "@/lib/commande";
import {
  LIBELLES_CANAL,
  LIBELLES_ORIGINE_NON_RETRAIT,
  LIBELLES_ORIGINE_REFUS,
  LIBELLES_RESULTAT,
  LIBELLES_ROLE,
  age,
  libelleStatut,
  lienAppel,
  lienWhatsApp,
  messageConfirmation,
  messagePrete,
  quand,
  telephoneLisible,
} from "@/lib/gestion/libelles";
import { urlFichier } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";
import { canal as canalDe } from "@/lib/gestion/saisie";

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

   Une commande à retirer en magasin suit le même cycle, sous d'autres
   mots : préparer puis « prête au retrait » (sans transporteur ni
   bordereau ; un message WhatsApp prévient le client), puis retirée
   (payée au comptoir) ou non retirée — le stock revient seul.

   Chaque formulaire envoie l'étape affichée : si un collègue a déjà agi,
   la base refuse le geste au lieu de le rejouer (la fiche se met à jour).
   Les gestes que le rôle du membre ne permet pas ne sont pas proposés.
   ========================================================================== */

type Fiche = {
  numero: string;
  statut: string;
  origine: string;
  canal: string | null;
  saisie_par: string | null;
  sur_place: boolean;
  cree_le: string;
  mode_paiement: string;
  statut_paiement: string;
  mode_livraison: "domicile" | "retrait";
  retrait: Magasin | null;
  contact: { nom: string; telephone: string; email: string | null };
  livraison: { ligne1: string | null; ligne2: string | null; ville: string | null; code_postal: string | null; gouvernorat: string | null; zone: string | null };
  sous_total_millimes: number;
  frais_livraison_millimes: number;
  remise_millimes: number;
  /** Le code promo appliqué (module promotions). */
  code_promo: string | null;
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
    /** Le lot qui a baissé la ligne (module promotions), et ce qu'il lui a retiré. */
    lot: string | null;
    remise_lot_millimes: number;
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
  saisie: "Commande enregistrée.",
  comptoir: "Vente enregistrée : remise et payée au comptoir.",
  "appel-confirmee": "Commande confirmée : elle passe à la préparation.",
  "appel-injoignable": "Appel noté : injoignable. La commande attend toujours sa confirmation.",
  "appel-rappeler": "Noté : à rappeler.",
  "appel-refus": "Commande annulée : le client a refusé au téléphone. Le stock est rendu.",
  annuler: "Commande annulée. Le stock est rendu.",
  expedier: "Commande expédiée.",
  livrer: "Livraison enregistrée : le paiement est encaissé.",
  skanfact: "C'est fait dans SkanFact.",
  refuser: "Refus enregistré. Le stock est rendu.",
  note: "Note interne enregistrée.",
};

const FAIT_RETRAIT: Record<string, string> = {
  expedier: "Commande prête au retrait : prévenez le client.",
  livrer: "Retrait enregistré : le paiement est encaissé.",
  refuser: "Commande non retirée. Le stock est rendu.",
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

function libelleEvenement(e: Fiche["historique"][number], retrait: boolean, f: Pick<Fiche, "origine" | "canal" | "sur_place">): string {
  if (e.avant === null) {
    if (f.origine !== "manuelle") return "Commande passée sur la boutique";
    return f.sur_place ? "Vente saisie au comptoir" : `Commande saisie par l'équipe, reçue ${canalDe(f.canal)?.par ?? "hors de la vitrine"}`;
  }
  if (f.sur_place && e.apres === "livree") return "Remise au client, payée au comptoir";
  switch (e.apres) {
    case "confirmee": return "Confirmée";
    case "expediee": return retrait ? "Prête au retrait" : "Expédiée";
    case "livree": return retrait ? "Retirée, paiement encaissé" : "Livrée, paiement encaissé";
    case "refusee":
      return retrait
        ? `Non retirée — ${(LIBELLES_ORIGINE_NON_RETRAIT[e.origine_refus ?? ""] ?? "").toLowerCase()}`
        : `Refusée à la livraison — ${(LIBELLES_ORIGINE_REFUS[e.origine_refus ?? ""] ?? "").toLowerCase()}`;
    case "annulee": return "Annulée";
    default: return libelleStatut(e.apres);
  }
}

type EtapeProgression = { cle: string; libelle: string; etat: "fait" | "courant" | "a_venir" | "echec"; quand: string | null };

/** La frise d'une commande : reçue, confirmée, expédiée, livrée (en
 *  retrait : prête, retirée) — ou arrêtée en route (annulée, refusée). */
function progressionDe(f: Fiche): EtapeProgression[] {
  const retrait = f.mode_livraison === "retrait";
  const ordre = ["recue", "confirmee", "expediee", "livree"];
  const rang = f.statut === "a_arbitrer" ? 0 : ordre.indexOf(f.statut);
  const etapes: EtapeProgression[] = [
    { cle: "recue", libelle: "Reçue", etat: "fait", quand: f.cree_le },
    { cle: "confirmee", libelle: "Confirmée", etat: "a_venir", quand: f.confirmee_le },
    { cle: "expediee", libelle: retrait ? "Prête" : "Expédiée", etat: "a_venir", quand: f.expediee_le },
    { cle: "livree", libelle: retrait ? "Retirée" : "Livrée", etat: "a_venir", quand: f.livree_le },
  ];
  if (f.statut === "annulee" || f.statut === "refusee") {
    const faites = etapes.filter((e) => e.quand).length;
    const fin = { cle: f.statut, libelle: f.statut === "annulee" ? "Annulée" : retrait ? "Non retirée" : "Refusée", etat: "echec" as const, quand: f.cloturee_le };
    return [...etapes.slice(0, Math.max(1, faites)).map((e) => ({ ...e, etat: "fait" as const })), fin];
  }
  return etapes.map((e, i) => ({ ...e, etat: i < rang || f.statut === "livree" ? "fait" : i === rang + 1 ? "courant" : i <= rang ? "fait" : "a_venir" }));
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
  // Un compte e-mail n'a pas prouvé son numéro : seul un compte SMS confirmé est « vérifié ».
  const { data: verifiees } = f.client?.compte
    ? await sb.rpc("gestion_numeros_verifies", { p_boutique_id: boutique.boutique_id, p_commandes: [f.numero] })
    : { data: [] };
  const numeroVerifie = ((verifiees as string[] | null) ?? []).includes(f.numero);
  // Ce que SkanFact sait de la commande (module skanfact) : sa facture, ses paiements, ses avoirs.
  const { data: sf } = await sb.rpc("gestion_skanfact_commande", { p_boutique_id: boutique.boutique_id, p_numero: f.numero });
  const etatSkanFact = sf as EtatFactureSkanFact | null;

  const role = boutique.role;
  const maintenant = new Date();
  const action = `/gestion/${slug}/commandes/${f.numero}/action`;
  const aConfirmer = f.statut === "recue" || f.statut === "a_arbitrer";
  const articles = f.lignes.reduce((n, l) => n + l.quantite, 0);
  const prenom = f.contact.nom.trim().split(/\s+/)[0] ?? f.contact.nom;
  const annulable = aConfirmer || f.statut === "confirmee";
  const retrait = f.mode_livraison === "retrait";
  const statut = libelleStatut(f.statut, f.mode_livraison);
  const saisie = f.origine === "manuelle" ? canalDe(f.canal) ?? canalDe("autre") : undefined;
  const fait = messages.fait ? ((retrait ? FAIT_RETRAIT[messages.fait] : undefined) ?? FAIT[messages.fait]) : undefined;

  const journal = [
    ...f.historique.map((e) => ({
      le: e.le,
      texte: libelleEvenement(e, retrait, f),
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

  const whatsapp = lienWhatsApp(
    f.contact.telephone,
    messageConfirmation({
      prenom, boutique: boutique.nom, numero: f.numero, totalMillimes: f.total_millimes, articles, ville: f.livraison.ville,
      retraitA: retrait ? (f.retrait?.ville ?? boutique.nom) : null,
    }),
  );
  const whatsappPrete = retrait && f.retrait
    ? lienWhatsApp(f.contact.telephone, messagePrete({ prenom, boutique: boutique.nom, numero: f.numero, totalMillimes: f.total_millimes, magasin: f.retrait }))
    : null;
  const progression = progressionDe(f);

  return (
    <div className={aConfirmer && peut(role, CONFIRMER) ? "bo-avec-barre" : undefined}>
      <EnTetePage
        avant={<Link href={`/gestion/${slug}?etape=${etapeDe(f.statut)}`}><Icone nom="retour" taille={14} /> Commandes</Link>}
        titre={
          <span className="bo-fiche-tete">
            <span>{f.numero}</span>
            <span className={`bo-statut bo-statut-${f.statut}`}>{statut}</span>
            {f.sur_place ? <span className="ui-etat ui-etat-violet"><Icone nom="boutique" taille={12} /> Vendue au comptoir</span>
              : retrait ? <span className="ui-etat ui-etat-violet"><Icone nom="boutique" taille={12} /> Retrait en magasin</span> : null}
            {saisie && !f.sur_place ? <span className="ui-etat"><Icone nom={saisie.icone} taille={12} /> {saisie.libelle}</span> : null}
          </span>
        }
        description={
          <>
            {f.sur_place ? `Vendue au comptoir${f.saisie_par ? ` par ${f.saisie_par}` : ""}` : saisie ? `Reçue ${saisie.par}, saisie${f.saisie_par ? ` par ${f.saisie_par}` : ""}` : "Passée"} {quand(f.cree_le, maintenant)} · {age(f.cree_le, maintenant)} · {articles} article{articles > 1 ? "s" : ""} ·{" "}
            <strong className="text-encre">{formatePrix(f.total_millimes)}</strong> {f.sur_place ? "payés au comptoir" : retrait ? "au retrait" : "à la livraison"}
          </>
        }
        actions={
          !retrait && ["confirmee", "expediee"].includes(f.statut) ? (
            <Link href={`/gestion/${slug}/bordereaux?n=${encodeURIComponent(f.numero)}`} className="btn btn-second">
              <Icone nom="fichier" /> Bordereau
            </Link>
          ) : null
        }
      />

      <ol className="bo-progression" aria-label="Avancement de la commande">
        {progression.map((e) => (
          <li key={e.cle} data-etat={e.etat}>
            <span className="bo-progression-point" aria-hidden="true">
              {e.etat === "fait" ? <Icone nom="coche" taille={12} /> : e.etat === "echec" ? <Icone nom="croix" taille={12} /> : null}
            </span>
            <span className="bo-progression-texte">
              <span>{e.libelle}</span>
              {e.quand ? <span className="discret">{quand(e.quand, maintenant)}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      <div className="pile">
        {fait ? (
          <p className="message message-succes bo-message" role="status">
            <span>
              {fait}{" "}
              {messages.fait === "saisie" || messages.fait === "comptoir"
                ? <Link href={`/gestion/${slug}/commandes/nouvelle`}>Saisir une autre commande</Link>
                : <Link href={`/gestion/${slug}?etape=a_confirmer`}>Commandes à confirmer</Link>}
            </span>
          </p>
        ) : null}
        {messages.erreur ? <p className="message message-erreur bo-message" role="alert">{messages.erreur}</p> : null}

        <div className="grille-2 bo-fiche">
          <div className="pile bo-fiche-principal">
            {/* ---------------- Le geste du moment ---------------- */}
            {aConfirmer ? (
              <section className="carte bo-action" aria-labelledby="action-titre">
                <div className="bo-action-tete">
                  <span className="bo-action-icone"><Icone nom="telephone" /></span>
                  <div>
                    <p className="bo-action-sur">Étape en cours</p>
                    <h2 id="action-titre">Confirmer la commande</h2>
                  </div>
                </div>
                {peut(role, CONFIRMER) ? (
                  <>
                    <p className="bo-action-aide">
                      {retrait
                        ? <>Appelez {prenom} pour confirmer la commande et le moment du retrait au magasin, puis notez le résultat.</>
                        : <>Appelez {prenom} pour confirmer l&apos;adresse et la disponibilité, puis notez le résultat.</>}
                    </p>
                    <div className="bo-contact">
                      <a className="btn btn-primaire btn-grand" href={lienAppel(f.contact.telephone)}>
                        <Icone nom="telephone" /> Appeler le {telephoneLisible(f.contact.telephone)}
                      </a>
                      <a className="btn btn-second btn-grand bo-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer">
                        <Icone nom="message" /> WhatsApp
                      </a>
                    </div>
                    <form action={action} method="post" className="bo-resultats" id="resultat-appel">
                      <RetourAppel cible="resultat-appel" />
                      <p className="bo-retour-appel" aria-hidden="true"><Icone nom="telephone" taille={14} /> Comment s&apos;est passé l&apos;appel ?</p>
                      <input type="hidden" name="action" value="appel" />
                      <div className="bo-resultats-rang">
                        <fieldset className="segments">
                          <legend>Contacté par</legend>
                          <label><input type="radio" name="canal" value="appel" defaultChecked /> Appel</label>
                          <label><input type="radio" name="canal" value="whatsapp" /> WhatsApp</label>
                        </fieldset>
                        <div className="champ flex-1">
                          <label htmlFor="note-appel" className="sr-only">Note (facultatif)</label>
                          <input id="note-appel" name="note" maxLength={500} placeholder="Note (facultatif) : préfère être livré après 17 h" />
                        </div>
                      </div>
                      <p className="ui-etiquette">Résultat de l&apos;appel</p>
                      <div className="bo-boutons">
                        <button type="submit" name="resultat" value="confirmee" className="btn btn-succes">
                          <Icone nom="coche" /> Confirmée
                        </button>
                        <button type="submit" name="resultat" value="injoignable" className="btn btn-second">Injoignable</button>
                        <button type="submit" name="resultat" value="rappeler" className="btn btn-second">À rappeler</button>
                        <button type="submit" name="resultat" value="refus" className="btn btn-danger bo-danger">Refus du client</button>
                      </div>
                    </form>
                    {f.appels.length > 0 ? (
                      <p className="bo-action-note">
                        <Icone nom="journal" taille={14} />
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
            ) : f.statut === "confirmee" && retrait ? (
              <section className="carte bo-action" aria-labelledby="action-titre">
                <div className="bo-action-tete">
                  <span className="bo-action-icone"><Icone nom="colis" /></span>
                  <div>
                    <p className="bo-action-sur">Étape en cours</p>
                    <h2 id="action-titre">Préparer la commande</h2>
                  </div>
                </div>
                <p className="bo-action-aide">
                  Confirmée {f.confirmee_le ? quand(f.confirmee_le, maintenant) : ""}. Préparez les articles ci-dessous : {prenom} vient les
                  retirer au magasin{f.retrait ? ` (${f.retrait.ville})` : ""}. Pas de transporteur, pas de bordereau.
                </p>
                {peut(role, EXPEDIER) ? (
                  <form action={action} method="post" className="bo-boutons">
                    <input type="hidden" name="action" value="expedier" />
                    <input type="hidden" name="statut" value={f.statut} />
                    <button type="submit" className="btn btn-primaire"><Icone nom="boutique" /> Prête au retrait</button>
                  </form>
                ) : (
                  <p className="bo-action-aide">La préparation revient au propriétaire, à l&apos;administrateur ou à la préparation.</p>
                )}
              </section>
            ) : f.statut === "expediee" && retrait ? (
              <section className="carte bo-action" aria-labelledby="action-titre">
                <div className="bo-action-tete">
                  <span className="bo-action-icone"><Icone nom="boutique" /></span>
                  <div>
                    <p className="bo-action-sur">Étape en cours</p>
                    <h2 id="action-titre">Au comptoir</h2>
                  </div>
                </div>
                <p className="bo-action-aide">
                  Prête {f.expediee_le ? quand(f.expediee_le, maintenant) : ""}. {prenom} règle {formatePrix(f.total_millimes)} en la retirant.
                </p>
                {peut(role, LIVRER) ? (
                  <>
                    <form action={action} method="post" className="bo-boutons">
                      <input type="hidden" name="action" value="livrer" />
                      <input type="hidden" name="statut" value={f.statut} />
                      {whatsappPrete ? (
                        <a className="btn btn-second bo-whatsapp" href={whatsappPrete} target="_blank" rel="noopener noreferrer">
                          <Icone nom="message" /> Prévenir {prenom} : c&apos;est prêt
                        </a>
                      ) : null}
                      <button type="submit" className="btn btn-succes">
                        <Icone nom="coche" /> Retirée, paiement encaissé
                      </button>
                    </form>
                    <details className="bo-pli">
                      <summary><Icone nom="refus" /> Non retirée <Icone nom="bas" className="bo-pli-chevron" /></summary>
                      <form action={action} method="post" className="bo-formulaire">
                        <input type="hidden" name="action" value="refuser" />
                        <input type="hidden" name="statut" value={f.statut} />
                        <fieldset className="choix bo-origines">
                          <legend>Pourquoi ?</legend>
                          {Object.entries(LIBELLES_ORIGINE_NON_RETRAIT).map(([cle, libelle]) => (
                            <label key={cle} className="choix-carte">
                              <input type="radio" name="origine" value={cle} required /> <span><b>{libelle}</b></span>
                            </label>
                          ))}
                        </fieldset>
                        <div className="champ">
                          <label htmlFor="commentaire">
                            Commentaire <span className="facultatif">(facultatif)</span>
                          </label>
                          <input id="commentaire" name="commentaire" maxLength={500} placeholder="Appelé trois fois, jamais venu" />
                        </div>
                        <p className="aide">Le stock revient automatiquement. Une commande abandonnée compte sur la fiche du client.</p>
                        <div className="bo-boutons">
                          <button type="submit" className="btn btn-danger bo-danger">Enregistrer : non retirée</button>
                        </div>
                      </form>
                    </details>
                  </>
                ) : (
                  <p className="bo-action-aide">Votre rôle ne permet pas d&apos;enregistrer le retrait.</p>
                )}
              </section>
            ) : f.statut === "confirmee" ? (
              <section className="carte bo-action" aria-labelledby="action-titre">
                <div className="bo-action-tete">
                  <span className="bo-action-icone"><Icone nom="colis" /></span>
                  <div>
                    <p className="bo-action-sur">Étape en cours</p>
                    <h2 id="action-titre">Préparer et expédier</h2>
                  </div>
                </div>
                <p className="bo-action-aide">
                  Confirmée {f.confirmee_le ? quand(f.confirmee_le, maintenant) : ""}. Préparez les articles ci-dessous, puis remettez le colis au livreur.
                </p>
                {peut(role, EXPEDIER) ? (
                  <form action={action} method="post" className="bo-formulaire">
                    <input type="hidden" name="action" value="expedier" />
                    <input type="hidden" name="statut" value={f.statut} />
                    <div className="deux-colonnes">
                      <div className="champ">
                        <label htmlFor="transporteur">Transporteur</label>
                        <input id="transporteur" name="transporteur" maxLength={80} defaultValue={f.transporteur ?? ""} placeholder="Nom du livreur ou de la société" />
                      </div>
                      <div className="champ">
                        <label htmlFor="suivi">
                          Numéro de suivi <span className="facultatif">(facultatif)</span>
                        </label>
                        <input id="suivi" name="suivi" maxLength={80} defaultValue={f.numero_suivi ?? ""} />
                      </div>
                    </div>
                    <div className="bo-boutons">
                      <button type="submit" className="btn btn-primaire"><Icone nom="camion" /> Marquer expédiée</button>
                    </div>
                  </form>
                ) : (
                  <p className="bo-action-aide">L&apos;expédition revient au propriétaire, à l&apos;administrateur ou à la préparation.</p>
                )}
              </section>
            ) : f.statut === "expediee" ? (
              <section className="carte bo-action" aria-labelledby="action-titre">
                <div className="bo-action-tete">
                  <span className="bo-action-icone"><Icone nom="camion" /></span>
                  <div>
                    <p className="bo-action-sur">Étape en cours</p>
                    <h2 id="action-titre">Livraison</h2>
                  </div>
                </div>
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
                      <button type="submit" className="btn btn-succes">
                        <Icone nom="coche" /> Livrée, paiement encaissé
                      </button>
                    </form>
                    <details className="bo-pli">
                      <summary><Icone nom="refus" /> Refusée à la livraison <Icone nom="bas" className="bo-pli-chevron" /></summary>
                      <form action={action} method="post" className="bo-formulaire">
                        <input type="hidden" name="action" value="refuser" />
                        <input type="hidden" name="statut" value={f.statut} />
                        <fieldset className="choix bo-origines">
                          <legend>D&apos;où vient le refus ?</legend>
                          {Object.entries(LIBELLES_ORIGINE_REFUS).map(([cle, libelle]) => (
                            <label key={cle} className="choix-carte">
                              <input type="radio" name="origine" value={cle} required /> <span><b>{libelle}</b></span>
                            </label>
                          ))}
                        </fieldset>
                        <div className="champ">
                          <label htmlFor="commentaire">
                            Commentaire <span className="facultatif">(facultatif)</span>
                          </label>
                          <input id="commentaire" name="commentaire" maxLength={500} placeholder="Absent deux fois, colis revenu" />
                        </div>
                        <p className="aide">Le stock revient automatiquement. Un refus du client ou un client injoignable compte sur sa fiche.</p>
                        <div className="bo-boutons">
                          <button type="submit" className="btn btn-danger bo-danger">Enregistrer le refus</button>
                        </div>
                      </form>
                    </details>
                  </>
                ) : (
                  <p className="bo-action-aide">Votre rôle ne permet pas d&apos;enregistrer la livraison.</p>
                )}
              </section>
            ) : (
              <section className={`carte bo-action bo-cloture bo-cloture-${f.statut}`} aria-labelledby="action-titre">
                <div className="bo-action-tete">
                  <span className="bo-action-icone"><Icone nom={f.statut === "livree" ? "succes" : f.statut === "refusee" ? "refus" : "croix"} /></span>
                  <div>
                    <p className="bo-action-sur">Commande clôturée</p>
                    <h2 id="action-titre">{statut}</h2>
                  </div>
                </div>
                <p className="bo-action-aide">
                  {f.statut === "livree"
                    ? `${retrait ? "Retirée" : "Livrée"} ${f.livree_le ? quand(f.livree_le, maintenant) : ""} : ${formatePrix(f.total_millimes)} encaissés.`
                    : f.statut === "refusee"
                      ? `${(retrait ? LIBELLES_ORIGINE_NON_RETRAIT : LIBELLES_ORIGINE_REFUS)[f.refus_origine ?? ""] ?? statut}${f.refus_commentaire ? ` : ${f.refus_commentaire}` : ""}. Le stock est revenu.`
                      : `Motif : ${f.motif_annulation ?? "non précisé"}. Le stock est revenu.`}
                </p>
              </section>
            )}

            {etatSkanFact && (etatSkanFact.envois.length
              || (etatSkanFact.actif && etatSkanFact.connecte && ["confirmee", "expediee", "livree"].includes(f.statut))) ? (
              <FactureSkanFact e={etatSkanFact} statut={f.statut} numero={f.numero} action={`/gestion/${slug}/skanfact/action`}
                fiche={`/gestion/${slug}/commandes/${f.numero}`}
                peutAgir={["proprietaire", "admin", "confirmateur", "preparateur"].includes(role)} url={adresseSkanFact()} maintenant={maintenant} />
            ) : null}

            {annulable && peut(role, CONFIRMER) ? (
              <details className="bo-pli bo-annuler carte">
                <summary><Icone nom="croix" /> Annuler la commande <Icone nom="bas" className="bo-pli-chevron" /></summary>
                <form action={action} method="post" className="bo-formulaire">
                  <input type="hidden" name="action" value="annuler" />
                  <input type="hidden" name="statut" value={f.statut} />
                  <div className="champ">
                    <label htmlFor="motif">Motif de l&apos;annulation</label>
                    <input id="motif" name="motif" required minLength={3} maxLength={500} placeholder="Doublon, rupture, demande du client…" />
                  </div>
                  <div className="bo-boutons">
                    <button type="submit" className="btn btn-danger bo-danger">Annuler la commande</button>
                  </div>
                </form>
              </details>
            ) : null}

            {/* ---------------- Les articles ---------------- */}
            <section className="carte" aria-labelledby="articles-titre">
              <div className="carte-tete">
                <div>
                  <h2 id="articles-titre" className="carte-titre-icone"><Icone nom="colis" /> Articles</h2>
                </div>
              </div>
              <ul className="bo-articles" role="list">
                {f.lignes.map((l, i) => (
                  <li key={`${l.sku}-${i}`} className="bo-article">
                    <span className="bo-vignette">
                      {l.image ? <Image src={urlFichier(l.image)} alt="" fill sizes="56px" /> : <Icone nom="colis" taille={18} />}
                      <span className="bo-vignette-qte">{l.quantite}</span>
                    </span>
                    <span className="bo-article-corps">
                      <span className="bo-article-nom">{l.produit_nom}</span>
                      {l.variante_libelle ? <span className="text-petit discret">{l.variante_libelle}</span> : null}
                      <span className="text-petit discret">
                        {l.sku ? `Réf. ${l.sku}` : "Sans référence"}
                        {l.stock_restant !== null ? ` · reste ${l.stock_restant} en stock` : ""}
                      </span>
                      {l.lot ? (
                        <span className="text-petit bo-article-lot">
                          <Icone nom="etiquette" taille={12} /> Lot « {l.lot} » · −{formatePrix(l.remise_lot_millimes)}
                        </span>
                      ) : null}
                    </span>
                    <span className="bo-article-qte">× {l.quantite}</span>
                    <span className="bo-article-prix">
                      <Prix millimes={l.total_ligne_millimes} />
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="bo-totaux liste-def">
                <div>
                  <dt>Sous-total</dt>
                  <dd><Prix millimes={f.sous_total_millimes} /></dd>
                </div>
                <div>
                  <dt>{f.sur_place ? "Remis sur place" : retrait ? "Retrait en magasin" : `Livraison${f.livraison.zone ? ` (${f.livraison.zone})` : ""}`}</dt>
                  <dd>{f.sur_place ? "Sans livraison" : retrait ? "Gratuit" : f.frais_livraison_millimes === 0 ? "Offerte" : <Prix millimes={f.frais_livraison_millimes} />}</dd>
                </div>
                {f.remise_millimes > 0 ? (
                  <div className="bo-remise">
                    <dt>{f.code_promo ? <>Code promo <span className="pm-ticket pm-ticket-petit">{f.code_promo}</span></> : "Remise"}</dt>
                    <dd>−<Prix millimes={f.remise_millimes} /></dd>
                  </div>
                ) : null}
                <div className="bo-total">
                  <dt>{f.sur_place ? "Payé au comptoir" : retrait ? "À encaisser au retrait" : "À encaisser à la livraison"}</dt>
                  <dd><Prix millimes={f.total_millimes} fort /></dd>
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
                {journal.map((j) => (
                  <li key={j.cle}>
                    <span className="bo-journal-point" aria-hidden="true" />
                    <span className="bo-journal-texte">
                      {j.texte}
                      {j.detail ? <span className="bo-journal-detail"> — {j.detail}</span> : null}
                    </span>
                    <span className="bo-journal-meta">
                      <span className="bo-journal-auteur">{j.auteur}</span> · <span className="bo-journal-quand">{quand(j.le, maintenant)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside className="pile bo-fiche-cote">
            {/* ---------------- Le client ---------------- */}
            <section className="carte" aria-labelledby="client-titre">
              <h2 id="client-titre" className="sr-only">Client</h2>
              <div className="bo-client">
                <span className="avatar avatar-l" style={styleAvatar(f.contact.nom)} aria-hidden="true">{initiales(f.contact.nom)}</span>
                <span className="bo-client-texte">
                  <span className="bo-client-nom">{f.contact.nom}</span>
                  <a className="lien" href={lienAppel(f.contact.telephone)}>{telephoneLisible(f.contact.telephone)}</a>
                </span>
              </div>
              {f.client ? (
                <>
                  <p className="ui-etats mt-3">
                    {f.client.compte
                      ? numeroVerifie
                        ? <span className="ui-etat ui-etat-vert"><Icone nom="bouclier" taille={12} /> Numéro vérifié par SMS</span>
                        : <span className="ui-etat ui-etat-ambre">Compte client · numéro à confirmer à l&apos;appel</span>
                      : <span className="ui-etat">Commande en invité</span>}
                    {f.client.nb_commandes <= 1 ? <span className="ui-etat ui-etat-bleu">Nouveau client</span> : <span className="ui-etat">{f.client.nb_commandes} commandes</span>}
                    {f.client.nb_refus > 0 ? <span className="ui-etat ui-etat-rouge">{f.client.nb_refus} refus à la livraison</span> : null}
                    {f.client.niveau_risque !== "normal" ? (
                      <span className="ui-etat ui-etat-rouge">{f.client.niveau_risque === "bloque" ? "Bloqué" : "Surveillé"}</span>
                    ) : null}
                  </p>
                  <p className="text-petit discret mt-3 bo-client-depuis">
                    Client depuis le {new Date(f.client.depuis).toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis" })}
                    <Link href={`/gestion/${slug}/clients/${f.client.telephone.replace(/\D/g, "")}`} className="lien">Voir sa fiche <Icone nom="droite" taille={12} /></Link>
                  </p>
                </>
              ) : null}
              {f.autres.length > 0 ? (
                <>
                  <h3 className="bo-sous-titre">Ses autres commandes</h3>
                  <ul className="bo-autres" role="list">
                    {f.autres.map((o) => (
                      <li key={o.numero}>
                        <Link href={`/gestion/${slug}/commandes/${o.numero}`} className="lien">{o.numero}</Link>
                        <span className={`bo-statut bo-statut-${o.statut}`}>{libelleStatut(o.statut)}</span>
                        <Prix millimes={o.total_millimes} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>

            {/* ---------------- La livraison ---------------- */}
            <section className="carte" aria-labelledby="livraison-titre">
              {f.sur_place ? (
                <>
                  <h2 id="livraison-titre" className="carte-titre-icone"><Icone nom="boutique" /> Vendue au comptoir</h2>
                  <p className="bo-adresse">Articles remis en main propre au magasin, payés sur place.</p>
                </>
              ) : retrait ? (
                <>
                  <h2 id="livraison-titre" className="carte-titre-icone"><Icone nom="boutique" /> Retrait en magasin</h2>
                  <p className="bo-adresse">
                    {f.contact.nom} vient la retirer
                    {f.retrait ? (
                      <>
                        {" "}au magasin :
                        <br />
                        {f.retrait.adresse}, {f.retrait.ville}
                        {f.retrait.horaires ? (
                          <>
                            <br />
                            <span className="discret">{f.retrait.horaires}</span>
                          </>
                        ) : null}
                      </>
                    ) : " au magasin."}
                  </p>
                </>
              ) : (
                <>
                  <h2 id="livraison-titre" className="carte-titre-icone"><Icone nom="lieu" /> Livraison</h2>
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
                </>
              )}
              {f.note_client ? (
                <p className="bo-note-client">
                  <strong>Note du client</strong> {f.note_client}
                </p>
              ) : null}
            </section>

            {/* ---------------- La note interne ---------------- */}
            <section className="carte" aria-labelledby="note-titre">
              <h2 id="note-titre" className="carte-titre-icone"><Icone nom="note" /> Note interne</h2>
              {role !== "lecture" ? (
                <form action={action} method="post" className="bo-formulaire mt-3">
                  <input type="hidden" name="action" value="note" />
                  <div className="champ">
                    <label htmlFor="note-interne" className="sr-only">Note interne</label>
                    <textarea id="note-interne" name="note" maxLength={2000} rows={3} defaultValue={f.note_interne ?? ""}
                      placeholder="Visible par l'équipe seulement" />
                  </div>
                  <div className="bo-boutons">
                    <button type="submit" className="btn btn-second btn-petit">Enregistrer la note</button>
                  </div>
                </form>
              ) : (
                <p className="text-petit discret mt-2">{f.note_interne ?? "Aucune note."}</p>
              )}
              <p className="text-petit discret bo-role">Vous êtes : {LIBELLES_ROLE[role] ?? role}.</p>
            </section>
          </aside>
        </div>
      </div>

      {aConfirmer && peut(role, CONFIRMER) ? (
        <div className="bo-barre-mobile" role="group" aria-label={`Joindre ${prenom}`}>
          <a className="btn btn-primaire btn-grand" href={lienAppel(f.contact.telephone)}>
            <Icone nom="telephone" /> Appeler {prenom}
          </a>
          <a className="btn btn-second btn-grand bo-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp à ${prenom}`}>
            <Icone nom="message" />
          </a>
        </div>
      ) : null}
    </div>
  );
}
