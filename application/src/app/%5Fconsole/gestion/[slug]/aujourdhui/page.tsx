import type { Metadata } from "next";
import Link from "next/link";
import { Prix } from "@/components/Prix";
import { EnTetePage, initiales, styleAvatar } from "@/components/console/Coquille";
import { Icone, type NomIcone } from "@/components/console/Icone";
import { clientSession, exigeMembre, type Role } from "@/lib/console/session";
import { lieu } from "@/lib/commande";
import { LIBELLES_RESULTAT, lienAppel, lienWhatsApp, messageConfirmation, telephoneLisible } from "@/lib/gestion/libelles";
import { DIRECTION } from "@/lib/gestion/tableau";
import { duMois, enTnd, type Objectif } from "@/lib/gestion/objectif";
import { jourArrivageCourt, type EcranArrivages } from "@/lib/gestion/arrivages";

export const metadata: Metadata = { title: "Aujourd'hui" };

/* ============================================================================
   « AUJOURD'HUI » — le matin, ce qui attend l'équipe : les commandes à
   appeler (et à rappeler), à préparer, en route depuis trop longtemps, les
   retraits prêts ; ce que les modules demandent ; les pièces à réassortir.
   Chaque carte mène à sa liste. Ce qui attend un geste vient d'abord ; ce
   qui est à jour se range en dessous, discret. La journée en chiffres, pour
   la direction (public.gestion_aujourdhui).

   En tête, pour qui confirme les commandes : LE PROCHAIN APPEL — la
   commande qui attend depuis le plus longtemps (la première de la liste « à
   confirmer »), le client, depuis quand, ce qu'il a pris, ce qu'on sait de
   lui, et l'appel ou le message WhatsApp à portée de pouce. Le résultat se
   note sur la fiche, où mène le troisième bouton.
   ========================================================================== */

type Prochaine = {
  numero: string;
  cree_le: string;
  contact_nom: string;
  contact_telephone: string;
  mode_livraison: "domicile" | "retrait";
  ville: string | null;
  gouvernorat: string | null;
  total_millimes: number;
  articles: number;
  premier_article: string | null;
  appels: number;
  dernier_appel: string | null;
  client: { nb_commandes: number; nb_refus: number; niveau_risque: string; compte: boolean } | null;
};

const CONFIRMER: Role[] = ["proprietaire", "admin", "confirmateur"];

type Etat = {
  jour: string;
  direction: boolean;
  commandes: {
    a_confirmer: number; a_rappeler: number; attente_depuis: string | null;
    a_preparer: number; en_livraison: number; en_retard: number; retraits_prets: number;
    /** Les précommandes qui attendent leur arrivage (migration 88). */
    precommandes?: number;
  };
  journee: { recues: number; livrees: number; refusees: number; recues_millimes: number | null; livrees_millimes: number | null };
  modules: { sav: number | null; devis: number | null; avis: number | null; comptes_pro: number | null };
  stock: {
    ruptures: number;
    bas: number;
    pieces: { produit_id: string; produit: string; declinaison: string | null; sku: string; stock: number; seuil: number }[];
  };
};

type Tache = {
  cle: string; nombre: number; titre: string; detail: string; href: string; icone: NomIcone; action?: { href: string; libelle: string };
  /** Ce qui suit son cours sans geste de l'équipe (colis en route, précommandes) :
   *  compté, mais sans la couleur « à faire » tant que rien n'est anormal. */
  enCours?: boolean; alerte?: boolean;
};

const JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Tunis" });

/** « 35 min », « 2 h », « 3 jours » : depuis quand la plus ancienne attend. */
function depuis(iso: string, maintenant: Date): string {
  const minutes = Math.max(1, Math.round((maintenant.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}\u00a0min`;
  const heures = Math.round(minutes / 60);
  if (heures < 48) return `${heures}\u00a0h`;
  return `${Math.round(heures / 24)}\u00a0jours`;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const majuscule = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export default async function Aujourdhui({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const confirme = CONFIRMER.includes(boutique.role);
  const [{ data, error }, { data: file }, { data: alertes }, { data: paniers }, { data: dob }, { data: arr }] = await Promise.all([
    sb.rpc("gestion_aujourdhui", { p_boutique_id: boutique.boutique_id }),
    // La première de la file « à confirmer » : la plus ancienne (gestion_liste_commandes).
    confirme
      ? sb.rpc("gestion_liste_commandes", { p_boutique_id: boutique.boutique_id, p_etape: "a_confirmer", p_recherche: null, p_limite: 1, p_decalage: 0 })
      : Promise.resolve({ data: null }),
    // Les clients dont la pièce est revenue (« Prévenez-moi de son retour »).
    sb.rpc("gestion_alertes_etat", { p_boutique_id: boutique.boutique_id }),
    // Les paniers laissés sans commande (réglage commande.relance_paniers).
    sb.rpc("gestion_paniers_etat", { p_boutique_id: boutique.boutique_id }),
    // L'objectif du mois, pour la direction.
    DIRECTION.includes(boutique.role)
      ? sb.rpc("gestion_objectif", { p_boutique_id: boutique.boutique_id })
      : Promise.resolve({ data: null }),
    // Les arrivages annoncés : une pièce épuisée qui arrive ne se recommande pas.
    sb.rpc("gestion_arrivages", { p_boutique_id: boutique.boutique_id }),
  ]);
  // Référence → la date du premier arrivage attendu qui l'apporte (recette du 05/10).
  const arrivePar = new Map<string, string>();
  for (const a of ((arr as EcranArrivages | null)?.arrivages ?? []).filter((x) => x.statut === "attendu")) {
    for (const l of a.lignes) if (!arrivePar.has(l.sku) || a.date_prevue < arrivePar.get(l.sku)!) arrivePar.set(l.sku, a.date_prevue);
  }
  const objectif = dob as Objectif | null;
  const relances = paniers as { actif: boolean; a_relancer: number } | null;
  const reassort = alertes as { actif: boolean; a_prevenir: number; ouvertes: number } | null;
  if (error) throw new Error(`Aujourd'hui illisible : ${error.message}`);
  const e = data as Etat;
  const prochaine = ((file as { commandes?: Prochaine[] } | null)?.commandes ?? [])[0] ?? null;
  const base = `/gestion/${slug}`;
  const maintenant = new Date();
  const c = e.commandes;

  const taches: Tache[] = [
    {
      cle: "a_confirmer", nombre: c.a_confirmer, icone: "telephone", href: `${base}?etape=a_confirmer`,
      titre: c.a_confirmer > 1 ? "Commandes à confirmer" : "Commande à confirmer",
      detail: c.a_confirmer
        ? [c.a_rappeler ? `dont ${c.a_rappeler} à rappeler` : null, c.attente_depuis ? `la plus ancienne attend depuis ${depuis(c.attente_depuis, maintenant)}` : null]
            .filter(Boolean).join(" · ")
        : "Tous les appels sont faits.",
    },
    {
      cle: "a_preparer", nombre: c.a_preparer, icone: "colis", href: `${base}?etape=a_preparer`,
      titre: "Colis à préparer",
      detail: c.a_preparer ? "Confirmés par le client : à emballer et à remettre au transporteur." : "Rien en attente de préparation.",
      action: c.a_preparer ? { href: `${base}/bordereaux?etape=a_preparer`, libelle: "Imprimer les bordereaux" } : undefined,
    },
    {
      cle: "en_livraison", nombre: c.en_livraison, icone: "camion", href: `${base}?etape=expediees`,
      titre: "En route chez le client", enCours: true, alerte: c.en_retard > 0,
      detail: c.en_retard
        ? `${pluriel(c.en_retard, "colis", "colis")} depuis plus de 5 jours : un appel au transporteur.`
        : c.en_livraison ? "Rien d'anormal sur la route." : "Aucun colis en route.",
    },
    ...(c.precommandes
      ? [{ cle: "precommandes", nombre: c.precommandes, icone: "calendrier" as const, href: `${base}?etape=precommandes`,
          titre: c.precommandes > 1 ? "Précommandes en attente" : "Précommande en attente", enCours: true,
          detail: "Elles attendent leur arrivage : à la réception, elles sont servies d'abord et passent « À préparer ».",
          action: { href: `${base}/produits/arrivages`, libelle: "Voir les arrivages" } }]
      : []),
    ...(c.retraits_prets
      ? [{ cle: "retraits", nombre: c.retraits_prets, icone: "boutique" as const, href: `${base}?etape=expediees`,
          titre: "Prêtes au comptoir", detail: "Le client vient la retirer : la commande l'attend au magasin." }]
      : []),
    ...(e.modules.sav !== null
      ? [{ cle: "sav", nombre: e.modules.sav, icone: "outil" as const, href: `${base}/sav`,
          titre: "Demandes de SAV", detail: e.modules.sav ? "Nouvelles : le client attend votre appel." : "Aucune nouvelle demande." }]
      : []),
    ...(e.modules.devis !== null
      ? [{ cle: "devis", nombre: e.modules.devis, icone: "fichier" as const, href: `${base}/devis`,
          titre: "Devis à chiffrer", detail: e.modules.devis ? "Des listes de chantier attendent vos prix." : "Aucune demande de devis en attente." }]
      : []),
    ...(e.modules.avis !== null
      ? [{ cle: "avis", nombre: e.modules.avis, icone: "etoile" as const, href: `${base}/avis`,
          titre: "Avis à relire", detail: e.modules.avis ? "Relisez-les avant qu'ils paraissent sur la vitrine." : "Aucun avis à relire." }]
      : []),
    ...(reassort && (reassort.actif || reassort.ouvertes)
      ? [{ cle: "reassort", nombre: reassort.a_prevenir, icone: "cloche" as const, href: `${base}/reassort`,
          titre: reassort.a_prevenir > 1 ? "Clients à prévenir" : "Client à prévenir",
          detail: reassort.a_prevenir ? "Leur pièce est de retour en stock : le message est prêt." : "Personne n'attend une pièce revenue." }]
      : []),
    ...(relances?.actif
      ? [{ cle: "paniers", nombre: relances.a_relancer, icone: "panier" as const, href: `${base}/paniers`,
          titre: relances.a_relancer > 1 ? "Paniers à relancer" : "Panier à relancer",
          detail: relances.a_relancer ? "Laissés sans commande depuis plus d'une heure : le message est prêt." : "Aucun panier laissé en route." }]
      : []),
    ...(e.modules.comptes_pro !== null
      ? [{ cle: "pros", nombre: e.modules.comptes_pro, icone: "personne" as const, href: `${base}/clients/pros`,
          titre: "Comptes pro à valider", detail: e.modules.comptes_pro ? "Des professionnels demandent leurs prix." : "Aucune demande de compte pro." }]
      : []),
  ];
  const aFaire = taches.filter((x) => x.nombre > 0);
  const aJour = taches.filter((x) => x.nombre === 0);
  const stockAlerte = e.stock.ruptures + e.stock.bas;
  const total = aFaire.reduce((n, x) => n + x.nombre, 0);

  return (
    <>
      <EnTetePage
        titre="Aujourd'hui"
        description={
          <>
            <span className="jd-jour">{majuscule(JOUR.format(new Date(`${e.jour}T12:00:00`)))}</span>
            {" · "}
            {total
              ? `${pluriel(total, "chose attend", "choses attendent")} un geste de l'équipe.`
              : "Tout est à jour : rien n'attend."}
          </>
        }
      />

      {prochaine ? <ProchainAppel commande={prochaine} base={base} boutique={boutique.nom} maintenant={maintenant} /> : null}

      {aFaire.length ? (
        <section aria-labelledby="jd-a-faire">
          <h2 id="jd-a-faire" className="jd-titre">À faire</h2>
          <ul className="jd-grille" role="list">
            {aFaire.map((x, i) => <Carte key={x.cle} tache={x} rang={i} />)}
          </ul>
        </section>
      ) : (
        <div className="carte jd-calme">
          <span className="jd-calme-icone"><Icone nom="succes" taille={22} /></span>
          <div>
            <strong>Tout est à jour</strong>
            <p className="aide">Aucune commande n&apos;attend d&apos;appel ni de préparation. Les nouvelles s&apos;afficheront ici, et dans la pastille « Commandes ».</p>
          </div>
        </div>
      )}

      {stockAlerte ? (
        <section className="carte jd-stock" aria-labelledby="jd-stock">
          <div className="jd-stock-tete">
            <h2 id="jd-stock" className="carte-titre-icone"><Icone nom="alerte" /> Stock à réassortir</h2>
            <span className="aide">
              {[e.stock.ruptures ? pluriel(e.stock.ruptures, "déclinaison épuisée", "déclinaisons épuisées") : null,
                e.stock.bas ? `${e.stock.bas} sous le seuil d'alerte` : null].filter(Boolean).join(" · ")}
            </span>
          </div>
          <ul className="jd-pieces" role="list">
            {e.stock.pieces.map((p) => (
              <li key={p.sku}>
                <Link href={`${base}/produits/${p.produit_id}`} className="jd-piece">
                  <span className="jd-piece-nom">
                    <b>{p.produit}</b>
                    <span className="discret">{[p.declinaison, p.sku].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="ui-etats">
                    {arrivePar.has(p.sku) ? (
                      <span className="ui-etat ui-etat-bleu"><Icone nom="calendrier" taille={12} /> Arrive le {jourArrivageCourt(arrivePar.get(p.sku)!)}</span>
                    ) : null}
                    <span className={p.stock <= 0 ? "ui-etat ui-etat-rouge" : "ui-etat ui-etat-ambre"}>
                      {p.stock <= 0 ? "Épuisé" : `${p.stock} en stock`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="jd-stock-gestes">
            {/* La liste montre les plus urgentes ; le catalogue, toutes. */}
            {e.stock.ruptures + e.stock.bas > e.stock.pieces.length ? (
              <Link className="btn btn-second btn-petit" href={`${base}/produits?filtre=stock_bas`}>
                Toutes les {e.stock.ruptures + e.stock.bas} au catalogue <Icone nom="droite" taille={14} />
              </Link>
            ) : null}
            <Link className="btn btn-second btn-petit" href={`${base}/produits/reception`}>
              <Icone nom="colis" taille={14} /> Réceptionner une livraison
            </Link>
            <Link className="btn btn-second btn-petit" href={`${base}/produits/arrivages`}>
              <Icone nom="calendrier" taille={14} /> Annoncer un arrivage
            </Link>
          </div>
        </section>
      ) : null}

      {e.direction ? (
        <section className="carte jd-journee" aria-labelledby="jd-journee">
          <h2 id="jd-journee" className="carte-titre-icone"><Icone nom="graphique" /> La journée</h2>
          <dl className="jd-chiffres">
            <div>
              <dt>Reçues</dt>
              <dd>{e.journee.recues}</dd>
              {e.journee.recues_millimes !== null ? <dd className="aide"><Prix millimes={e.journee.recues_millimes} /></dd> : null}
            </div>
            <div>
              <dt>Livrées</dt>
              <dd>{e.journee.livrees}</dd>
              {e.journee.livrees_millimes !== null ? <dd className="aide"><Prix millimes={e.journee.livrees_millimes} /> encaissés</dd> : null}
            </div>
            <div>
              <dt>Refusées</dt>
              <dd>{e.journee.refusees}</dd>
            </div>
          </dl>
          {objectif ? (
            objectif.objectif ? (
              <Link className="jd-objectif" href={`${base}/tableau#objectif`}>
                <span className="jd-objectif-texte">
                  <b>Objectif {duMois(objectif.mois)} : {Math.round((objectif.livre / objectif.objectif) * 100)} %</b>
                  <span className="aide">
                    {enTnd(objectif.livre)} livrés sur {enTnd(objectif.objectif)}
                    {objectif.par_jour ? ` · ${enTnd(objectif.par_jour)} par jour pour l'atteindre` : " · atteint"}
                  </span>
                </span>
                <span className="jd-objectif-jauge" aria-hidden="true">
                  <span style={{ inlineSize: `${Math.min(100, (objectif.livre / objectif.objectif) * 100)}%` }} />
                </span>
              </Link>
            ) : (
              <Link className="btn-lien aide jd-objectif-fixer" href={`${base}/tableau#objectif`}>Fixer l&apos;objectif {duMois(objectif.mois)} →</Link>
            )
          ) : null}
          <Link className="btn-lien aide" href={`${base}/tableau`}>Le tableau de bord, sur 30 jours →</Link>
        </section>
      ) : null}

      {aJour.length ? (
        <section aria-labelledby="jd-a-jour">
          <h2 id="jd-a-jour" className="jd-titre jd-titre-discret">À jour</h2>
          <ul className="jd-grille jd-grille-calme" role="list">
            {aJour.map((x, i) => <Carte key={x.cle} tache={x} rang={i} />)}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Carte({ tache, rang }: { tache: Tache; rang: number }) {
  return (
    <li className="jd-carte" data-a-faire={tache.nombre > 0 && (!tache.enCours || tache.alerte) ? "" : undefined}
        data-en-cours={tache.nombre > 0 && tache.enCours && !tache.alerte ? "" : undefined} style={{ "--i": rang } as React.CSSProperties}>
      <Link href={tache.href} className="jd-carte-lien">
        <span className="jd-carte-icone"><Icone nom={tache.icone} taille={18} /></span>
        <span className="jd-carte-nombre">{tache.nombre}</span>
        <span className="jd-carte-titre">{tache.titre}</span>
        <span className="jd-carte-detail">{tache.detail}</span>
        <span className="jd-carte-fleche" aria-hidden="true"><Icone nom="droite" taille={16} /></span>
      </Link>
      {tache.action ? (
        <Link href={tache.action.href} className="jd-carte-action">{tache.action.libelle}</Link>
      ) : null}
    </li>
  );
}

/* Le prochain appel : qui, depuis quand, quoi, ce qu'on sait — et le geste. */
function ProchainAppel({ commande: c, base, boutique, maintenant }: { commande: Prochaine; base: string; boutique: string; maintenant: Date }) {
  const prenom = c.contact_nom.trim().split(/\s+/)[0] ?? c.contact_nom;
  const whatsapp = lienWhatsApp(
    c.contact_telephone,
    messageConfirmation({
      prenom, boutique, numero: c.numero, totalMillimes: c.total_millimes, articles: c.articles, ville: c.ville,
      retraitA: c.mode_livraison === "retrait" ? boutique : null,
    }),
  );
  const faits = [
    c.client && c.client.nb_commandes > 1 ? `${c.client.nb_commandes}\u00a0commandes chez vous` : "Nouveau client",
    c.client && c.client.nb_refus > 0 ? pluriel(c.client.nb_refus, "refus passé", "refus passés") : null,
    c.appels > 0 ? `Appelé ${c.appels}×${c.dernier_appel ? ` · ${(LIBELLES_RESULTAT[c.dernier_appel] ?? c.dernier_appel).toLowerCase()}` : ""}` : null,
  ].filter(Boolean) as string[];
  return (
    <section className="jd-prochain" aria-labelledby="jd-prochain-titre">
      <p className="jd-prochain-sur" id="jd-prochain-titre">
        <span className="jd-prochain-pouls" aria-hidden="true" />
        Le prochain appel · attend depuis {depuis(c.cree_le, maintenant)}
      </p>
      <div className="jd-prochain-corps">
        <span className="avatar jd-prochain-avatar" style={styleAvatar(c.contact_nom)} aria-hidden="true">{initiales(c.contact_nom)}</span>
        <div className="jd-prochain-qui">
          <strong>{c.contact_nom}</strong>
          <span>
            {telephoneLisible(c.contact_telephone)} · {c.mode_livraison === "retrait" ? "retrait en magasin" : lieu(c.ville, c.gouvernorat)}
          </span>
          <span className="jd-prochain-quoi">
            <b className="tabular-nums">{c.numero}</b> · {c.premier_article ?? pluriel(c.articles, "article", "articles")}
            {c.articles > 1 && c.premier_article ? ` et ${pluriel(c.articles - 1, "autre", "autres")}` : ""} · <Prix millimes={c.total_millimes} />
          </span>
          {faits.length ? <span className="jd-prochain-faits">{faits.join(" · ")}</span> : null}
        </div>
      </div>
      <div className="jd-prochain-gestes">
        <a className="btn btn-succes btn-grand jd-prochain-appel" href={lienAppel(c.contact_telephone)}>
          <Icone nom="telephone" /> Appeler {prenom}
        </a>
        <a className="btn btn-second btn-grand" href={whatsapp} target="_blank" rel="noopener noreferrer">
          <Icone nom="message" /> WhatsApp
        </a>
        <Link className="btn btn-fantome btn-grand" href={`${base}/commandes/${encodeURIComponent(c.numero)}`}>
          Ouvrir la commande <Icone nom="droite" taille={16} />
        </Link>
      </div>
    </section>
  );
}
