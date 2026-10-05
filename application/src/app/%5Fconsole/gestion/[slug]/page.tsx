import type { Metadata } from "next";
import Link from "next/link";
import { Prix } from "@/components/Prix";
import { EnTetePage, initiales, styleAvatar } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { AlertesCommandes } from "@/components/console/Veille";
import { RaccourciRecherche } from "@/components/console/Raccourcis";
import { clientSession, exigeMembre, type Role } from "@/lib/console/session";
import { lieu } from "@/lib/commande";
import {
  ETAPES,
  LIBELLES_RESULTAT,
  age,
  libelleStatut,
  lienAppel,
  telephoneLisible,
  type Etape,
} from "@/lib/gestion/libelles";
import { PEUT_SAISIR } from "@/lib/gestion/saisie";
import { BarreLot } from "@/components/console/BarreLot";

export const metadata: Metadata = { title: "Commandes" };

/* ============================================================================
   LES COMMANDES — par étape du travail : à confirmer (la plus ancienne
   d'abord : c'est elle qu'on appelle), à préparer, expédiées, clôturées.

   Sur téléphone, chaque commande à confirmer a son bouton d'appel : on
   appelle depuis la liste, on note le résultat sur la fiche. Les etats
   disent ce qu'on doit savoir avant d'appeler : nouveau client, numéro
   vérifié par SMS (un compte e-mail, lui, ne l'a pas prouvé), refus passés,
   appels déjà tentés.
   ========================================================================== */

type Ligne = {
  numero: string;
  statut: string;
  cree_le: string;
  contact_nom: string;
  contact_telephone: string;
  mode_livraison: "domicile" | "retrait";
  ville: string | null;
  gouvernorat: string | null;
  total_millimes: number;
  origine: string;
  articles: number;
  premier_article: string | null;
  appels: number;
  dernier_appel: string | null;
  client: { nb_commandes: number; nb_refus: number; niveau_risque: string; compte: boolean } | null;
};

type Liste = {
  etape: Etape;
  total: number;
  compteurs: Record<"a_confirmer" | "a_preparer" | "expediees" | "cloturees", number>;
  commandes: Ligne[];
};

const PAR_PAGE = 50;

/* Les gestes groupés (…_gestes_groupes.sql) : remettre au livreur, le point du livreur. */
const EXPEDIER_LOT: Role[] = ["proprietaire", "admin", "preparateur"];
const LIVRER_LOT: Role[] = ["proprietaire", "admin", "confirmateur", "preparateur"];
const FORMULAIRE_LOT = "lot-commandes";

function bilanLot(fait: string | undefined, n: string | undefined, ignorees: string | undefined): string | null {
  if (fait !== "lot-expedier" && fait !== "lot-livrer") return null;
  const k = Number(n ?? 0);
  const s = k > 1 ? "s" : "";
  const fait_ = fait === "lot-expedier"
    ? (k ? `${k} commande${s} remise${s} au livreur.` : "Aucune commande remise au livreur.")
    : (k ? `${k} colis livré${s}, paiement encaissé.` : "Aucun colis marqué livré.");
  const cote = (ignorees ?? "").split(",").filter(Boolean);
  return cote.length
    ? `${fait_} Laissée${cote.length > 1 ? "s" : ""} de côté (elle${cote.length > 1 ? "s avaient" : " avait"} bougé entre-temps, ou ne va pas au livreur) : ${cote.join(", ")}.`
    : fait_;
}

export default async function Commandes({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ etape?: string; q?: string; page?: string; fait?: string; n?: string; ignorees?: string; erreur?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const etape = ETAPES.find((e) => e.cle === recherche.etape) ?? ETAPES[0];
  const q = (recherche.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number.parseInt(recherche.page ?? "1", 10) || 1);

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_liste_commandes", {
    p_boutique_id: boutique.boutique_id,
    p_etape: etape.cle,
    p_recherche: q || null,
    p_limite: PAR_PAGE,
    p_decalage: (page - 1) * PAR_PAGE,
  });
  if (error) throw new Error(`Commandes illisibles : ${error.message}`);
  const liste = data as Liste;
  // Un compte e-mail n'a pas prouvé son numéro : seul un compte SMS confirmé est « vérifié ».
  const { data: verifiees } = liste.commandes.some((c) => c.client?.compte)
    ? await sb.rpc("gestion_numeros_verifies", {
        p_boutique_id: boutique.boutique_id,
        p_commandes: liste.commandes.filter((c) => c.client?.compte).map((c) => c.numero),
      })
    : { data: [] };
  const numeroVerifie = new Set((verifiees as string[] | null) ?? []);
  const maintenant = new Date();
  const pages = Math.max(1, Math.ceil(liste.total / PAR_PAGE));
  // Les bordereaux ne servent qu'aux colis livrés : pas aux commandes à retirer.
  const aExpedier = liste.total <= liste.commandes.length
    ? liste.commandes.filter((c) => c.mode_livraison !== "retrait").length
    : liste.compteurs.a_preparer;
  // Le geste groupé de cette étape, si le rôle le permet.
  const geste = etape.cle === "a_preparer" && EXPEDIER_LOT.includes(boutique.role) ? "expedier"
    : etape.cle === "expediees" && LIVRER_LOT.includes(boutique.role) ? "livrer" : null;
  const statutLot = geste === "expedier" ? "confirmee" : "expediee";
  const bilan = bilanLot(recherche.fait, recherche.n, recherche.ignorees);
  const lien = (e: string, p = 1) => `/gestion/${slug}?etape=${e}${q ? `&q=${encodeURIComponent(q)}` : ""}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <>
      <EnTetePage
        titre="Commandes"
        description={etape.cle === "a_confirmer" ? "La plus ancienne en haut : c'est elle qu'on appelle d'abord." : undefined}
        actions={
          <>
            <form role="search" method="get" action={`/gestion/${slug}`} className="bo-recherche">
              <input type="hidden" name="etape" value={etape.cle} />
              <label htmlFor="q" className="sr-only">Chercher une commande</label>
              <span className="bo-recherche-champ">
                <Icone nom="recherche" />
                <input id="q" name="q" type="search" className="entree" defaultValue={q} placeholder="Numéro, nom ou téléphone" autoComplete="off" />
                <kbd className="bo-recherche-touche" aria-hidden="true">/</kbd>
              </span>
              <RaccourciRecherche cible="q" />
              <button type="submit" className="btn btn-second">Chercher</button>
            </form>
            {etape.cle === "a_confirmer" ? <AlertesCommandes /> : null}
            {PEUT_SAISIR.includes(boutique.role) ? (
              <Link href={`/gestion/${slug}/commandes/nouvelle`} className="btn btn-second">
                <Icone nom="plus" /> Saisir une commande
              </Link>
            ) : null}
            {etape.cle === "a_preparer" && aExpedier > 0 ? (
              <Link href={`/gestion/${slug}/bordereaux?etape=a_preparer`} className="btn btn-primaire">
                <Icone nom="fichier" /> Bordereaux ({aExpedier})
              </Link>
            ) : null}
          </>
        }
      />

      <nav className="onglets bo-etapes" aria-label="Étapes des commandes">
        {ETAPES.map((e) => (
          <Link key={e.cle} href={lien(e.cle)} aria-current={e.cle === etape.cle ? "page" : undefined}>
            {e.libelle}
            {e.cle !== "toutes" ? <span className="compte-onglet">{liste.compteurs[e.cle]}</span> : null}
          </Link>
        ))}
      </nav>

      {bilan ? <p className="message message-succes bo-message" role="status">{bilan}</p> : null}
      {recherche.erreur ? <p className="message message-erreur bo-message" role="alert">{recherche.erreur}</p> : null}
      {geste ? (
        <form id={FORMULAIRE_LOT} method="post" action={`/gestion/${slug}/commandes/lot`} hidden>
          <input type="hidden" name="geste" value={geste} />
        </form>
      ) : null}

      {q ? (
        <p className="bo-resultat" role="status">
          {liste.total} commande{liste.total > 1 ? "s" : ""} pour « {q} »
          <Link href={lien(etape.cle).replace(/&q=[^&]*/, "")} className="btn btn-fantome btn-petit"><Icone nom="croix" taille={14} /> Effacer</Link>
        </p>
      ) : null}

      {liste.commandes.length === 0 ? (
        <div className="vide bo-vide">
          <span className="vide-icone"><Icone nom={q ? "recherche" : "commandes"} taille={20} /></span>
          <strong>{q ? "Aucun résultat" : "Rien ici"}</strong>
          <p>{q ? `Aucune commande « ${etape.libelle.toLowerCase()} » ne correspond à « ${q} ».` : etape.vide}</p>
        </div>
      ) : (
        <ul className="bo-liste" role="list">
          {liste.commandes.map((c, i) => {
            const aConfirmer = c.statut === "recue" || c.statut === "a_arbitrer";
            const premier = i === 0 && page === 1 && !q && etape.cle === "a_confirmer" && liste.commandes.length > 1;
            return (
              <li key={c.numero} className="bo-ligne" data-statut={c.statut}>
                {geste && c.statut === statutLot && c.mode_livraison === "domicile" ? (
                  <label className="bo-coche">
                    <input type="checkbox" form={FORMULAIRE_LOT} name="n" value={c.numero}
                           aria-label={`${geste === "expedier" ? "Remettre au livreur" : "Livrée"} : ${c.numero}, ${c.contact_nom}`} />
                  </label>
                ) : null}
                <Link href={`/gestion/${slug}/commandes/${c.numero}`} className="bo-ligne-lien">
                  <span className="bo-ligne-id">
                    <span className="bo-numero">{c.numero}</span>
                    <span className="bo-age" title={c.cree_le}><Icone nom="horloge" taille={13} /> {age(c.cree_le, maintenant)}</span>
                    {premier ? <span className="bo-premier">À appeler en premier</span> : null}
                  </span>
                  <span className="bo-ligne-client">
                    <span className="avatar" style={styleAvatar(c.contact_nom)} aria-hidden="true">{initiales(c.contact_nom)}</span>
                    <span className="bo-ligne-client-texte">
                      <strong>{c.contact_nom}</strong>
                      <span>{telephoneLisible(c.contact_telephone)} · {c.mode_livraison === "retrait" ? "retrait en magasin" : lieu(c.ville, c.gouvernorat)}</span>
                    </span>
                  </span>
                  <span className="bo-ligne-articles">
                    {c.articles} article{c.articles > 1 ? "s" : ""}
                    {c.premier_article ? <span> · {c.premier_article}</span> : null}
                  </span>
                  <span className="bo-badges ui-etats">
                    {c.mode_livraison === "retrait" ? <span className="ui-etat ui-etat-violet"><Icone nom="boutique" taille={12} /> À retirer</span> : null}
                    {c.origine === "manuelle" ? <span className="ui-etat"><Icone nom="crayon" taille={12} /> Saisie par l&apos;équipe</span> : null}
                    {c.client?.compte ? (
                      numeroVerifie.has(c.numero)
                        ? <span className="ui-etat ui-etat-vert"><Icone nom="bouclier" taille={12} /> Numéro vérifié</span>
                        : <span className="ui-etat">Numéro non vérifié</span>
                    ) : null}
                    {c.client && c.client.nb_commandes <= 1 ? <span className="ui-etat ui-etat-bleu">Nouveau client</span> : null}
                    {c.client && c.client.nb_commandes > 1 ? <span className="ui-etat">{c.client.nb_commandes} commandes</span> : null}
                    {c.client && c.client.nb_refus > 0 ? <span className="ui-etat ui-etat-rouge">{c.client.nb_refus} refus</span> : null}
                    {c.client && c.client.niveau_risque !== "normal" ? (
                      <span className="ui-etat ui-etat-rouge">{c.client.niveau_risque === "bloque" ? "Bloqué" : "Surveillé"}</span>
                    ) : null}
                    {aConfirmer && c.appels > 0 ? (
                      <span className="ui-etat ui-etat-ambre">
                        Appelé {c.appels}×{c.dernier_appel ? ` · ${(LIBELLES_RESULTAT[c.dernier_appel] ?? c.dernier_appel).toLowerCase()}` : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="bo-ligne-fin">
                    <span className={`bo-statut bo-statut-${c.statut}`}>{libelleStatut(c.statut, c.mode_livraison)}</span>
                    <span className="bo-ligne-total"><Prix millimes={c.total_millimes} /></span>
                  </span>
                </Link>
                {aConfirmer ? (
                  <a className="bo-appel" href={lienAppel(c.contact_telephone)} aria-label={`Appeler ${c.contact_nom} au ${telephoneLisible(c.contact_telephone)}`}>
                    <Icone nom="telephone" taille={18} />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {geste && liste.commandes.length ? <BarreLot formulaire={FORMULAIRE_LOT} geste={geste} /> : null}

      {pages > 1 ? (
        <nav className="bo-pages" aria-label="Pages">
          {page > 1 ? <Link href={lien(etape.cle, page - 1)} className="btn btn-second">Précédentes</Link> : <span />}
          <span className="text-petit discret">Page {page} sur {pages}</span>
          {page < pages ? <Link href={lien(etape.cle, page + 1)} className="btn btn-second">Suivantes</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
