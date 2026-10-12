import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone, type NomIcone } from "@/components/console/Icone";
import { dateJournal } from "@/lib/console/libelles";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { chronometre, configuration, hoteLocal, LIBELLES_FOURNISSEUR, taille, type DonneesEtat } from "@/lib/console/etat";
import { LIBELLES_GENRE, surveillanceMuette, type DonneesAlertes, type DonneesSurveillance, type IncidentLu } from "@/lib/console/surveillance";
import { duree } from "@/lib/courriels/alertes";
import { chargeAccueil } from "@/lib/console/accueil-serveur";
import { ilYa } from "@/lib/console/pilotage";
import { DepannagePlateforme, type DonneesMaintenance } from "@/components/console/Depannage";

export const metadata: Metadata = { title: "État technique" };

/* ============================================================================
   L'ÉTAT TECHNIQUE — ce qui fait tourner la plateforme, relu à chaque
   ouverture : la base, les e-mails, SkanFact, les fichiers, les domaines.
   Chaque carte dit son état d'un mot (en marche, à regarder, en panne, non
   branché), ses chiffres, et ce qu'il faut regarder, avec où aller. Un
   secret : « posé » ou « manque », jamais sa valeur.
   ========================================================================== */

type Niveau = "ok" | "attention" | "panne" | "neutre";
type Point = { texte: React.ReactNode; niveau: "attention" | "panne" };
type Carte = { id: string; titre: string; icone: NomIcone; niveau: Niveau; etat: string; faits: [string, React.ReactNode][]; points: Point[]; pied?: React.ReactNode };

const PASTILLE: Record<Niveau, string> = {
  ok: "ui-etat ui-etat-point ui-etat-vert",
  attention: "ui-etat ui-etat-point ui-etat-ambre",
  panne: "ui-etat ui-etat-point ui-etat-rouge",
  neutre: "ui-etat ui-etat-point",
};

const pluriel = (n: number, un: string, plusieurs: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? plusieurs : un}`;
const secondes = (ms: number) => (ms < 1000 ? `${ms.toLocaleString("fr-FR")} ms` : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`);
const pose = (oui: boolean) => (oui ? <span className="et-pose">posé</span> : <span className="et-manque">manque</span>);
/** Une erreur de l'application, regroupée (public.console_erreurs). */
type ErreurLue = {
  id: number; surface: string; genre: string; route: string | null; chemin: string | null; message: string; pile: string | null; digest: string | null;
  nombre: number; premiere_le: string; derniere_le: string; reglee_le: string | null; reglee_par: string | null;
  boutique: { id: string; nom: string; slug: string; demonstration: boolean } | null;
};
type DonneesErreurs = { erreurs: ErreurLue[]; ouvertes: number; reglees_7j: number; fois_24h: number };
const SURFACES: Record<string, string> = { vitrine: "Vitrine", backoffice: "Backoffice", console: "Console", serveur: "Serveur" };

const pire = (points: Point[], sinon: Niveau): Niveau =>
  points.some((p) => p.niveau === "panne") ? "panne" : points.length ? "attention" : sinon;

export default async function EtatTechnique({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string; carte?: string; erreurs?: string; reglees?: string; boutique?: string }> }) {
  const { user, role } = await exigeAdmin();
  const v = await searchParams;
  const service = clientService();
  // Les erreurs d'une boutique seulement (?erreurs=<boutique>) : la liste des boutiques est déjà lue pour la navigation.
  const { boutiques: toutes } = await chargeAccueil(user.id);
  const filtreErreurs = v.erreurs ? toutes.find((b) => b.slug === v.erreurs) ?? null : null;
  const [[{ data, error }, dureeBase], { data: dataSurv, error: errSurv }, { data: dataAlertes, error: errAlertes }, { data: dataErreurs, error: errErreurs }, { data: dataPause }] = await Promise.all([
    chronometre(() => service.rpc("console_etat_technique", { p_acteur: user.id })),
    service.rpc("console_surveillance", { p_acteur: user.id }),
    service.rpc("console_alertes", { p_acteur: user.id }),
    service.rpc("console_erreurs", { p_acteur: user.id, p_boutique_id: filtreErreurs?.id ?? null, p_reglees: v.reglees === "1" }),
    service.rpc("console_maintenance", { p_acteur: user.id }),
  ]);
  if (error) throw new Error(`État technique illisible : ${error.message}`);
  if (errSurv) throw new Error(`Surveillance illisible : ${errSurv.message}`);
  if (errAlertes) throw new Error(`Alertes illisibles : ${errAlertes.message}`);
  const e = data as DonneesEtat;
  const sv = dataSurv as DonneesSurveillance;
  const al = dataAlertes as DonneesAlertes;
  if (errErreurs) throw new Error(`Erreurs de l'application illisibles : ${errErreurs.message}`);
  const er = dataErreurs as DonneesErreurs;
  const pause = (dataPause ?? { plateforme: null, boutiques: [] }) as DonneesMaintenance;
  const maintenant = new Date().getTime();
  const superAdmin = role === "super_admin";
  const c = await configuration();

  // ---- La surveillance (chaque heure) --------------------------------------
  const dernier = sv.dernier;
  const muette = surveillanceMuette(sv);
  const defauts = (dernier?.releves ?? []).filter((r) => !r.ok || r.lent);
  const pointsSurveillance: Point[] = defauts.map((r) => ({
    niveau: !r.ok && r.genre === "page" ? "panne" : "attention",
    texte: <><b>{LIBELLES_GENRE[r.genre]}</b>{r.slug ? <> · <Link href={`/boutiques/${r.slug}`}>{r.boutique}</Link></> : null}
      {r.genre === "page" || r.genre === "domaine_envoi" ? <> · <span className="et-cible">{r.cible}</span></> : null} — {r.detail ?? "ne répond pas"}</>,
  }));
  if (muette) pointsSurveillance.push({ niveau: "attention", texte: <>Le passage de l&apos;heure ne tourne plus : le dernier date du {dateJournal(sv.derniere_heure!)}. Le déclencheur planifié du Worker est à regarder.</> });
  const niveauSurveillance = pire(pointsSurveillance, dernier ? "ok" : "neutre");

  // ---- Les alertes par e-mail ----------------------------------------------
  const ouverts = al.incidents.filter((i) => !i.clos_le);
  const pointsAlertes: Point[] = [];
  if (!al.actives) pointsAlertes.push({ niveau: "attention", texte: "Coupées : une panne ne prévient personne tant qu'on n'ouvre pas la console." });
  const enEchec = al.incidents.find((i) => i.alerte_erreur && !(i.clos_le ? i.alerte_cloture_le : i.alerte_ouverture_le));
  if (al.actives && enEchec) pointsAlertes.push({ niveau: "attention", texte: <>Une alerte n&apos;est pas partie : « {enEchec.alerte_erreur} ». Elle se retente à chaque passage.</> });
  const niveauAlertes: Niveau = pointsAlertes.length ? "attention" : "ok";
  const etatSurveillance = !dernier ? "Pas encore passée" : pointsSurveillance.some((p) => p.niveau === "panne") ? "En panne"
    : pointsSurveillance.length ? "À regarder" : "Tout répond";
  const dispo = sv.disponibilite;

  // ---- Les erreurs de l'application -----------------------------------------
  const recentes = er.erreurs.filter((x) => !x.reglee_le && maintenant - new Date(x.derniere_le).getTime() < 24 * 3600_000);
  const pointsErreurs: Point[] = recentes.length
    ? [{ niveau: "attention", texte: `${pluriel(recentes.length, "erreur ouverte vue", "erreurs ouvertes vues")} ces 24 heures${filtreErreurs ? ` pour ${filtreErreurs.nom}` : ""}.` }]
    : [];
  const niveauErreurs: Niveau = recentes.length ? "attention" : "ok";
  const etatErreurs = recentes.length ? "À regarder" : er.ouvertes ? "Rien ces 24 h" : "Aucune";
  // ---- Le dépannage ---------------------------------------------------------
  const pointsDepannage: Point[] = [
    ...(pause.plateforme ? [{ niveau: "panne" as const, texte: `Toute la plateforme est en maintenance depuis le ${dateJournal(pause.plateforme.depuis)} : chaque vitrine montre la page d'attente.` }] : []),
    ...pause.boutiques.map((b) => ({ niveau: "attention" as const, texte: `${b.nom} est en maintenance depuis le ${dateJournal(b.depuis)}.` })),
  ];

  // ---- La base -------------------------------------------------------------
  const partConnexions = e.base.connexions_max ? e.base.connexions / e.base.connexions_max : 0;
  const pointsBase: Point[] = [];
  if (partConnexions >= 0.8) pointsBase.push({ niveau: "attention", texte: `${e.base.connexions} connexions ouvertes sur ${e.base.connexions_max} : près de la limite.` });
  if (dureeBase > 1500) pointsBase.push({ niveau: "attention", texte: `La base a mis ${(dureeBase / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s à répondre.` });
  const base: Carte = {
    id: "base", titre: "Base de données", icone: "modules",
    niveau: pire(pointsBase, "ok"), etat: pointsBase.length ? "À regarder" : "Répond",
    faits: [
      ["Répond en", `${dureeBase.toLocaleString("fr-FR")} ms`],
      ["Taille", taille(e.base.taille)],
      ["Connexions", `${e.base.connexions} sur ${e.base.connexions_max}`],
      ["PostgreSQL", e.base.version],
      ["Dernière migration", e.base.migration ?? <span className="discret">non notée (base locale)</span>],
    ],
    points: pointsBase,
  };

  // ---- Les e-mails ---------------------------------------------------------
  const reel = c.courriels.fournisseur === "resend" || c.courriels.fournisseur === "brevo";
  const cc = e.courriels_commandes;
  const pointsCourriels: Point[] = [];
  if (c.courriels.fournisseur === "aucun") pointsCourriels.push({ niveau: "panne", texte: "Aucun fournisseur : aucun e-mail ne part (le secret COURRIELS_ENVOI manque)." });
  else if (!["resend", "brevo", "apercu", "relais"].includes(c.courriels.fournisseur)) pointsCourriels.push({ niveau: "panne", texte: `Fournisseur inconnu (« ${c.courriels.fournisseur} ») : aucun e-mail ne part.` });
  if (!c.courriels.crochet) pointsCourriels.push({ niveau: reel ? "panne" : "attention", texte: "Le secret du crochet de Supabase Auth manque : les codes de connexion par e-mail ne partent pas." });
  if (e.envois.refuses) {
    pointsCourriels.push({
      niveau: "attention",
      texte: <>{pluriel(e.envois.refuses, "envoi refusé", "envois refusés")} sur 7 jours{e.envois.dernier_refus?.raison ? <> — le dernier : « {e.envois.dernier_refus.raison} »</> : null}. <Link href="/journal?vue=envois&echecs=1">Voir les refus</Link></>,
    });
  }
  if (cc.en_retard) pointsCourriels.push({ niveau: "attention", texte: <>{pluriel(cc.en_retard, "e-mail de commande retenté", "e-mails de commande retentés")}{cc.derniere_erreur ? <> — « {cc.derniere_erreur} »</> : null}.</> });
  if (cc.refuses) pointsCourriels.push({ niveau: "attention", texte: `${pluriel(cc.refuses, "e-mail de commande abandonné", "e-mails de commande abandonnés")} après cinq essais, sur 7 jours.` });
  const courriels: Carte = {
    id: "courriels", titre: "E-mails", icone: "courriel",
    niveau: pire(pointsCourriels, reel ? "ok" : "neutre"),
    etat: pointsCourriels.some((p) => p.niveau === "panne") ? "En panne" : pointsCourriels.length ? "À regarder" : reel ? "En marche" : c.courriels.fournisseur === "apercu" ? "Aperçu" : "Local",
    faits: [
      ["Fournisseur", LIBELLES_FOURNISSEUR[c.courriels.fournisseur] ?? c.courriels.fournisseur],
      ...(c.courriels.expediteur ? [["Expéditeur", c.courriels.expediteur] as [string, React.ReactNode]] : []),
      ["Crochet de Supabase Auth", pose(c.courriels.crochet)],
      ["Sur 7 jours", <>{pluriel(e.envois.partis, "parti", "partis")}, {e.envois.refuses ? <b className="et-manque">{pluriel(e.envois.refuses, "refusé", "refusés")}</b> : "aucun refus"}</>],
      ["Dernier parti", e.envois.dernier_parti ? dateJournal(e.envois.dernier_parti) : <span className="discret">aucun</span>],
      ["File des commandes", cc.a_envoyer ? `${pluriel(cc.a_envoyer, "à envoyer", "à envoyer")}${cc.plus_ancien ? `, depuis ${dateJournal(cc.plus_ancien)}` : ""}` : "vide"],
      ...(cc.sans_adresse ? [["Sans adresse (7 jours)", pluriel(cc.sans_adresse, "client", "clients")] as [string, React.ReactNode]] : []),
    ],
    points: pointsCourriels,
    pied: <><Link href="/journal?vue=envois" className="btn-lien">Journal des envois</Link><Link href="/courriels" className="btn-lien">Les modèles</Link></>,
  };

  // ---- SkanFact ------------------------------------------------------------
  const s = e.skanfact;
  const branche = Boolean(c.skanfact.hote);
  const pointsSkanFact: Point[] = [];
  if (branche) {
    if (!c.skanfact.partenaire) pointsSkanFact.push({ niveau: "attention", texte: "Le secret de partenaire manque : « Connecter SkanFact » ne marche pas pour les commerçants." });
    if (!c.skanfact.chiffre) pointsSkanFact.push({ niveau: "panne", texte: "Le chiffrement des clés manque : les boutiques ne peuvent ni se connecter ni facturer." });
  }
  if (s.refuses) {
    pointsSkanFact.push({
      niveau: "attention",
      texte: <>{pluriel(s.refuses, "envoi refusé par SkanFact", "envois refusés par SkanFact")}, à corriger par le commerçant :{" "}
        {s.boutiques_refus.map((b, i) => <span key={b.slug}>{i ? ", " : ""}<Link href={`/boutiques/${b.slug}`}>{b.nom}</Link> ({b.n})</span>)}.</>,
    });
  }
  if (s.en_retard) pointsSkanFact.push({ niveau: "attention", texte: `${pluriel(s.en_retard, "envoi retenté", "envois retentés")} : SkanFact n'a pas répondu.` });
  if (s.coupures_en_retard) pointsSkanFact.push({ niveau: "attention", texte: `${pluriel(s.coupures_en_retard, "clé quittée", "clés quittées")} pas encore coupée${s.coupures_en_retard > 1 ? "s" : ""} dans SkanFact (retenté).` });
  const skanfact: Carte = {
    id: "skanfact", titre: "SkanFact", icone: "billet",
    niveau: pire(pointsSkanFact, branche ? "ok" : "neutre"),
    etat: pointsSkanFact.some((p) => p.niveau === "panne") ? "En panne" : pointsSkanFact.length ? "À regarder" : branche ? "Branché" : "Non branché",
    faits: [
      ["Adresse", c.skanfact.hote ?? <span className="discret">non branché</span>],
      ["Lecture des factures SkanEcom", pose(c.skanfact.lecture)],
      ["Secret de partenaire", pose(c.skanfact.partenaire)],
      ["Chiffrement des clés", pose(c.skanfact.chiffre)],
      ["Secret des avis", pose(c.skanfact.avis)],
      ["Boutiques connectées", s.coupees ? `${s.connectees} (et ${pluriel(s.coupees, "coupée", "coupées")})` : String(s.connectees)],
      ["Envois en attente", s.a_envoyer ? `${s.a_envoyer}${s.plus_ancien ? `, depuis ${dateJournal(s.plus_ancien)}` : ""}` : "aucun"],
    ],
    points: pointsSkanFact,
  };

  // ---- Les fichiers --------------------------------------------------------
  const pointsFichiers: Point[] = c.fichiers.mode === "manque"
    ? [{ niveau: "panne", texte: "La liaison R2 FICHIERS manque au Worker : aucune photo ne peut être déposée." }]
    : [];
  const fichiers: Carte = {
    id: "fichiers", titre: "Fichiers et photos", icone: "photo",
    niveau: pire(pointsFichiers, c.fichiers.mode === "r2" ? "ok" : "neutre"),
    etat: c.fichiers.mode === "r2" ? "En marche" : c.fichiers.mode === "local" ? "Local" : "En panne",
    faits: [
      ["Dépôt", c.fichiers.mode === "r2" ? "Cloudflare R2" : c.fichiers.mode === "local" ? "Relais local" : <span className="et-manque">aucun</span>],
      ["Adresse publique", c.fichiers.public ?? <span className="et-manque">manque</span>],
    ],
    points: pointsFichiers,
  };

  // ---- Les domaines --------------------------------------------------------
  const enLigne = e.domaines.filter((d) => !hoteLocal(d.hote));
  // Ceux en ligne d'abord (la base les range déjà : en erreur, jamais vérifiés, valables) ; les locaux, à la fin.
  const domaines = [...enLigne, ...e.domaines.filter((d) => hoteLocal(d.hote))];
  const enErreur = enLigne.filter((d) => d.statut === "erreur");
  const aVerifier = enLigne.filter((d) => d.statut === "en_attente");
  const pointsDomaines: Point[] = [];
  if (enErreur.length) pointsDomaines.push({ niveau: "panne", texte: `${pluriel(enErreur.length, "domaine sans certificat valable", "domaines sans certificat valable")} : la vitrine n'y ouvre pas.` });
  if (aVerifier.length) pointsDomaines.push({ niveau: "attention", texte: `${pluriel(aVerifier.length, "domaine jamais vérifié", "domaines jamais vérifiés")}.` });
  const niveauDomaines = pire(pointsDomaines, enLigne.length ? "ok" : "neutre");
  const etatDomaines = enErreur.length ? "En panne" : aVerifier.length ? "À vérifier" : enLigne.length ? "Valables" : "Local";

  const cartes = [base, courriels, skanfact, fichiers];
  const aRegarder = [{ id: "surveillance", titre: "Surveillance", points: pointsSurveillance }, { id: "alertes", titre: "Alertes", points: pointsAlertes }, { id: "erreurs", titre: "Erreurs", points: pointsErreurs }, { id: "depannage", titre: "Dépannage", points: pointsDepannage }, ...cartes, { id: "domaines", titre: "Domaines", points: pointsDomaines }].flatMap((x) => x.points.map((p) => ({ ...p, carte: x.id, titre: x.titre })));
  // Le verdict renvoie à chaque carte concernée, une fois, avec son nombre de points.
  const parCarte = [...new Set(aRegarder.map((p) => p.carte))].map((id) => {
    const points = aRegarder.filter((p) => p.carte === id);
    return { id, titre: points[0].titre, n: points.length, panne: points.some((p) => p.niveau === "panne") };
  });
  const message = (carte: string) => (v.carte === carte && v.ok ? <p className="message message-succes" role="status">{v.ok}</p>
    : v.carte === carte && v.erreur ? <p className="message message-erreur" role="alert">{v.erreur}</p> : null);

  return (
    <>
      <EnTetePage
        titre="État technique"
        description="Ce qui fait tourner la plateforme : ce qui répond, ce qui est branché, ce qui attend. Relu à chaque ouverture."
        actions={<Link href="/etat" className="btn btn-second btn-petit"><Icone nom="horloge" taille={14} /> Relire</Link>}
      />
      <div className="et-verdict carte" data-niveau={aRegarder.some((p) => p.niveau === "panne") ? "panne" : aRegarder.length ? "attention" : "ok"} role="status">
        <Icone nom={aRegarder.length ? "alerte" : "succes"} taille={20} />
        <div>
          <p className="et-verdict-titre">
            {aRegarder.length ? pluriel(aRegarder.length, "point à regarder", "points à regarder") : "Tout répond."}
          </p>
          <p className="discret">Relu le {dateJournal(e.le)}.</p>
          {aRegarder.length ? (
            <ul className="et-verdict-liste">
              {parCarte.map((x) => (
                <li key={x.id} data-niveau={x.panne ? "panne" : "attention"}><a href={`#t-${x.id}`}>{x.titre}</a>{x.n > 1 ? <span className="discret"> ({x.n})</span> : null}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="et-grille">
        <section className="carte et-carte et-large" aria-labelledby="t-surveillance" data-niveau={niveauSurveillance}>
          <header className="et-tete">
            <h2 id="t-surveillance" className="carte-titre-icone"><Icone nom="jauge" /> Surveillance des vitrines</h2>
            <span className={PASTILLE[niveauSurveillance]}>{etatSurveillance}</span>
          </header>
          {message("surveillance")}
          <dl className="et-faits">
            <div>
              <dt>Dernier passage</dt>
              <dd>{dernier ? <>{dateJournal(dernier.debut)} <span className="discret">· {dernier.declencheur === "heure" ? "celui de l'heure" : "demandé depuis la console"}</span></> : <span className="discret">aucun</span>}</dd>
            </div>
            {dernier ? (
              <div>
                <dt>Vérifié</dt>
                <dd>{pluriel(dernier.verifies, "point", "points")}, {defauts.length ? <b className="et-manque">{pluriel(defauts.length, "défaut", "défauts")}</b> : "aucun défaut"}</dd>
              </div>
            ) : null}
            <div>
              <dt>Chaque heure</dt>
              <dd>{!sv.derniere_heure ? <span className="discret">pas encore passée : le Worker en ligne la lance</span>
                : muette ? <span className="et-manque">muette depuis le {dateJournal(sv.derniere_heure)}</span>
                : <span className="et-pose">en marche</span>}</dd>
            </div>
          </dl>
          {pointsSurveillance.length ? (
            <ul className="et-points">
              {pointsSurveillance.map((p, i) => <li key={i} data-niveau={p.niveau}><Icone nom="alerte" taille={14} /> <span>{p.texte}</span></li>)}
            </ul>
          ) : null}
          {sv.passages.length > 1 ? (
            <div className="et-passages">
              <p className="aide">Les {sv.passages.length} derniers passages, du plus ancien au plus récent</p>
              <ol aria-label={`${pluriel(sv.passages.filter((p) => p.defauts === 0).length, "passage sans défaut", "passages sans défaut")} sur ${sv.passages.length}`}>
                {[...sv.passages].reverse().map((p) => (
                  <li key={p.debut} data-niveau={p.pannes ? "panne" : p.defauts ? "attention" : "ok"}
                    title={`${dateJournal(p.debut)} : ${p.pannes ? pluriel(p.pannes, "vitrine en panne", "vitrines en panne") : p.defauts ? pluriel(p.defauts, "défaut", "défauts") : "tout répond"}`} />
                ))}
              </ol>
            </div>
          ) : null}
          {dispo.length ? (
            <>
              <h3 className="et-sous-titre">Disponibilité sur 24 heures</h3>
              <ul className="et-domaines">
                {dispo.map((d) => {
                  const part = d.releves ? d.ok / d.releves : 0;
                  const n: Niveau = part === 1 ? "ok" : part >= 0.9 ? "attention" : "panne";
                  return (
                    <li key={d.cible}>
                      <div className="et-domaine">
                        <span className="et-hote">{d.cible}</span>
                        <span className="discret"><Link href={`/boutiques/${d.slug}`}>{d.boutique}</Link> · {pluriel(d.releves, "relevé", "relevés")}</span>
                      </div>
                      <div className="et-domaine-etat">
                        <span className={PASTILLE[n]}>{(part * 100).toLocaleString("fr-FR", { maximumFractionDigits: part === 1 ? 0 : 1 })} %</span>
                        {d.duree_mediane !== null ? <span className="aide">répond en {secondes(d.duree_mediane)}</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          <div className="et-pied">
            <form action="/etat/surveillance" method="post">
              <button type="submit" className="btn btn-second btn-petit">Vérifier maintenant</button>
            </form>
            <p className="aide">
              Chaque heure, d&apos;elle-même : l&apos;accueil de chaque vitrine ouverte (et son certificat), les files d&apos;e-mails
              et de SkanFact, et une fois par jour le domaine d&apos;envoi propre à une boutique. Gardé 14 jours.
            </p>
          </div>
        </section>

        <section className="carte et-carte et-large" aria-labelledby="t-alertes" data-niveau={niveauAlertes}>
          <header className="et-tete">
            <h2 id="t-alertes" className="carte-titre-icone"><Icone nom="courriel" /> Alertes par e-mail</h2>
            <span className={PASTILLE[niveauAlertes]}>{al.actives ? "Allumées" : "Coupées"}</span>
          </header>
          {message("alertes")}
          <p className="aide et-alertes-regle">
            Quand la surveillance relève une panne — une vitrine qui ne répond pas deux passages de suite, des e-mails de commande
            ou des factures SkanFact qui s&apos;entassent, un domaine d&apos;envoi qui perd sa vérification —, un e-mail part
            une fois, puis une fois quand c&apos;est rétabli. Jamais à chaque passage.
          </p>
          <dl className="et-faits">
            <div><dt>À qui</dt><dd>{al.destinataires.length ? al.destinataires.join(", ") : <span className="discret">personne</span>}</dd></div>
            <div><dt>Incidents ouverts</dt><dd>{ouverts.length ? <b className="et-manque">{ouverts.length}</b> : "aucun"}</dd></div>
            {al.modifie_le ? <div><dt>Réglé le</dt><dd>{dateJournal(al.modifie_le)}</dd></div> : null}
          </dl>
          {pointsAlertes.length && v.carte !== "alertes" ? (
            <ul className="et-points">
              {pointsAlertes.map((p, i) => <li key={i} data-niveau={p.niveau}><Icone nom="alerte" taille={14} /> <span>{p.texte}</span></li>)}
            </ul>
          ) : null}
          {superAdmin ? (
            <form action="/etat/alertes" method="post" className="formulaire et-alertes-form">
              <fieldset className="choix">
                <legend className="sr-only">Alertes de la surveillance</legend>
                <label className="choix-carte">
                  <input type="radio" name="actives" value="" defaultChecked={!al.actives} />
                  <span><b>Coupées</b><span className="aide">Les incidents se suivent ici seulement.</span></span>
                </label>
                <label className="choix-carte">
                  <input type="radio" name="actives" value="oui" defaultChecked={al.actives} />
                  <span><b>Prévenir par e-mail</b><span className="aide">À l&apos;ouverture d&apos;un incident, puis à son rétablissement.</span></span>
                </label>
              </fieldset>
              <div className="champ">
                <label htmlFor="al-destinataires">Adresses à prévenir</label>
                <textarea id="al-destinataires" name="destinataires" rows={2} maxLength={1100} autoComplete="off" spellCheck={false}
                  defaultValue={(al.destinataires.length ? al.destinataires : [user.email ?? ""]).join("\n")} aria-describedby="al-destinataires-aide" />
                <p className="aide" id="al-destinataires-aide">Une à cinq, une par ligne. Une boîte que vous lisez au téléphone.</p>
              </div>
              <div className="et-alertes-actions">
                <button type="submit" className="btn btn-primaire">Enregistrer</button>
              </div>
            </form>
          ) : <p className="aide">Un super-administrateur les règle.</p>}
          {al.destinataires.length ? (
            <form action="/etat/alertes/essai" method="post" className="et-pied">
              <button type="submit" className="btn btn-second btn-petit">Envoyer un essai</button>
              <p className="aide">Une alerte d&apos;exemple, sous « [Essai] », aux adresses ci-dessus : pour voir qu&apos;elle arrive.</p>
            </form>
          ) : null}
          {al.incidents.length ? (
            <>
              <h3 className="et-sous-titre">Incidents, ouverts puis des 14 derniers jours</h3>
              <ul className="et-domaines et-incidents">
                {al.incidents.map((i) => <Incident key={i.id} i={i} />)}
              </ul>
            </>
          ) : <p className="discret et-incidents-vide">Aucun incident ces 14 derniers jours.</p>}
        </section>

        <DepannagePlateforme m={pause} boutiques={toutes.filter((b) => b.statut !== "fermee").map((b) => ({ id: b.id, slug: b.slug, nom: b.nom, demonstration: b.demonstration }))}
          choisie={v.boutique ?? null} superAdmin={superAdmin} message={message("depannage")} />

        <section className="carte et-carte et-large" aria-labelledby="t-erreurs" data-niveau={niveauErreurs}>
          <header className="et-tete">
            <h2 id="t-erreurs" className="carte-titre-icone"><Icone nom="alerte" /> Erreurs de l&apos;application</h2>
            <span className={PASTILLE[niveauErreurs]}>{etatErreurs}</span>
          </header>
          {message("erreurs")}
          <p className="aide et-alertes-regle">
            Chaque page ou route qui casse — vitrine, backoffice, console — se note ici d&apos;elle-même, regroupée : la même erreur
            au même endroit est une ligne, qui compte ses fois. Dix en une heure pour une boutique ouvrent un incident, et l&apos;alerte
            part si elle est allumée. Gardé 30 jours.
          </p>
          <dl className="et-faits">
            <div><dt>Ouvertes</dt><dd>{er.ouvertes ? <b className="et-manque">{pluriel(er.ouvertes, "erreur", "erreurs")}</b> : "aucune"}</dd></div>
            <div><dt>Ces 24 heures</dt><dd>{er.fois_24h ? pluriel(er.fois_24h, "fois", "fois") : "rien"}</dd></div>
            <div><dt>Réglées (7 jours)</dt><dd>{er.reglees_7j ? pluriel(er.reglees_7j, "erreur", "erreurs") : "aucune"}</dd></div>
          </dl>
          {filtreErreurs ? (
            <p className="er-filtre">
              Celles de <Link href={`/boutiques/${filtreErreurs.slug}`}>{filtreErreurs.nom}</Link> ·{" "}
              <Link href={`/etat${v.reglees ? "?reglees=1" : ""}#t-erreurs`}>toutes les boutiques</Link>
            </p>
          ) : null}
          {er.erreurs.length ? (
            <ul className="er-liste" role="list">
              {er.erreurs.map((x) => (
                <li key={x.id} data-reglee={x.reglee_le ? "" : undefined}>
                  <div className="er-tete">
                    <span className="ui-etat">{SURFACES[x.surface] ?? x.surface}{x.genre === "navigateur" ? " · navigateur" : ""}</span>
                    {x.boutique ? <Link href={`/etat?erreurs=${x.boutique.slug}#t-erreurs`} className="er-boutique">{x.boutique.nom}</Link> : <span className="discret">Plateforme</span>}
                    <span className="er-fois" title={`${pluriel(x.nombre, "fois", "fois")} depuis le ${dateJournal(x.premiere_le)}`}>× {x.nombre.toLocaleString("fr-FR")}</span>
                    <span className="aide er-quand">{x.reglee_le ? <>réglée le {dateJournal(x.reglee_le)}{x.reglee_par ? ` par ${x.reglee_par}` : ""}</> : <>{ilYa(x.derniere_le, maintenant)}</>}</span>
                  </div>
                  <p className="er-message">{x.message}</p>
                  <p className="aide er-ou">
                    {[
                      x.route ? <code key="r">{x.route}</code> : null,
                      x.chemin && x.chemin !== x.route ? <span key="c" className="et-cible">{x.chemin}</span> : null,
                      <span key="d">{x.nombre > 1 ? `depuis le ${dateJournal(x.premiere_le)}` : `le ${dateJournal(x.premiere_le)}`}</span>,
                      x.digest ? <span key="g">référence <code>{x.digest}</code></span> : null,
                    ].filter(Boolean).map((morceau, i) => <span key={i}>{i ? " · " : ""}{morceau}</span>)}
                  </p>
                  {x.pile ? (
                    <details className="er-pile">
                      <summary>La pile</summary>
                      <pre>{x.pile}</pre>
                    </details>
                  ) : null}
                  {!x.reglee_le ? (
                    <form action="/etat/erreurs" method="post" className="er-regler">
                      <input type="hidden" name="id" value={x.id} />
                      {filtreErreurs ? <input type="hidden" name="filtre" value={filtreErreurs.slug} /> : null}
                      <button type="submit" className="btn btn-second btn-petit"><Icone nom="coche" taille={14} /> Réglée</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className="discret er-vide">{v.reglees ? "Aucune erreur ces sept derniers jours." : "Aucune erreur ouverte : tout s'affiche."}</p>}
          <div className="et-pied">
            {er.ouvertes > 1 ? (
              <form action="/etat/erreurs" method="post">
                {filtreErreurs ? <><input type="hidden" name="boutique_id" value={filtreErreurs.id} /><input type="hidden" name="filtre" value={filtreErreurs.slug} /></> : null}
                <button type="submit" className="btn btn-second btn-petit">Tout marquer réglé{filtreErreurs ? ` pour ${filtreErreurs.nom}` : ""}</button>
              </form>
            ) : null}
            {superAdmin ? (
              <Link className="btn btn-second btn-petit" href="/etat/erreurs/essai" prefetch={false}>Provoquer une erreur d&apos;essai</Link>
            ) : null}
            <Link className="btn-lien aide" href={`/etat?${new URLSearchParams({ ...(filtreErreurs ? { erreurs: filtreErreurs.slug } : {}), ...(v.reglees ? {} : { reglees: "1" }) })}#t-erreurs`}>
              {v.reglees ? "Cacher les réglées" : "Voir aussi les réglées"}
            </Link>
          </div>
        </section>

        {cartes.map((x) => (
          <section key={x.id} className="carte et-carte" aria-labelledby={`t-${x.id}`} data-niveau={x.niveau}>
            <header className="et-tete">
              <h2 id={`t-${x.id}`} className="carte-titre-icone"><Icone nom={x.icone} /> {x.titre}</h2>
              <span className={PASTILLE[x.niveau]}>{x.etat}</span>
            </header>
            {message(x.id)}
            <dl className="et-faits">
              {x.faits.map(([dt, dd]) => <div key={dt}><dt>{dt}</dt><dd>{dd}</dd></div>)}
            </dl>
            {x.points.length ? (
              <ul className="et-points">
                {x.points.map((p, i) => <li key={i} data-niveau={p.niveau}><Icone nom="alerte" taille={14} /> <span>{p.texte}</span></li>)}
              </ul>
            ) : null}
            {x.pied ? <div className="et-pied">{x.pied}</div> : null}
          </section>
        ))}

        <section className="carte et-carte et-large" aria-labelledby="t-domaines" data-niveau={niveauDomaines}>
          <header className="et-tete">
            <h2 id="t-domaines" className="carte-titre-icone"><Icone nom="domaine" /> Domaines et certificats</h2>
            <span className={PASTILLE[niveauDomaines]}>{etatDomaines}</span>
          </header>
          {message("domaines")}
          {/* Juste après une vérification, son message dit déjà ce qu'il y a à savoir. */}
          {pointsDomaines.length && v.carte !== "domaines" ? (
            <ul className="et-points">
              {pointsDomaines.map((p, i) => <li key={i} data-niveau={p.niveau}><Icone nom="alerte" taille={14} /> <span>{p.texte}</span></li>)}
            </ul>
          ) : null}
          {domaines.length === 0 ? <p className="discret">Aucun domaine.</p> : (
            <ul className="et-domaines">
              {domaines.map((d) => {
                const local = hoteLocal(d.hote);
                const n: Niveau = local ? "neutre" : d.statut === "actif" ? "ok" : d.statut === "erreur" ? "panne" : "attention";
                return (
                  <li key={d.hote}>
                    <div className="et-domaine">
                      <span className="et-hote">{d.hote}</span>
                      <span className="discret">
                        <Link href={`/boutiques/${d.boutique.slug}`}>{d.boutique.nom}</Link>
                        {d.principal ? " · principal" : ""}{d.boutique.demonstration ? " · démonstration" : ""}
                      </span>
                      {!local && d.erreur ? <span className="aide et-manque">{d.erreur}</span> : null}
                    </div>
                    <div className="et-domaine-etat">
                      <span className={PASTILLE[n]}>
                        {local ? "Local" : d.statut === "actif" ? "Certificat valable" : d.statut === "erreur" ? "Erreur" : "Jamais vérifié"}
                      </span>
                      {!local && d.verifie_le ? <span className="aide">{dateJournal(d.verifie_le)}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="et-pied">
            {enLigne.length ? (
              <form action="/etat/domaines" method="post">
                <button type="submit" className="btn btn-second btn-petit">
                  Vérifier {enLigne.length > 1 ? `les ${enLigne.length} domaines` : "le domaine"} maintenant
                </button>
              </form>
            ) : <p className="aide">Les domaines en « .localhost » ne se vérifient pas : il n&apos;y a pas de certificat en local.</p>}
          </div>
        </section>
      </div>
      <p className="aide et-note">
        Les SMS de connexion partent par Supabase Auth : leur fournisseur se règle dans Supabase, et le journal des envois ne les voit pas encore.
      </p>
    </>
  );
}

const QUOI_INCIDENT: Record<IncidentLu["genre"], string> = {
  page: "Vitrine sans réponse", courriels: "E-mails de commande en attente", skanfact: "Envois à SkanFact en attente", domaine_envoi: "Domaine d'envoi non vérifié",
  erreurs: "Erreurs de l'application en série",
};

/** Un incident : quoi, où, depuis quand (ou combien de temps), et s'il a été annoncé. */
function Incident({ i }: { i: IncidentLu }) {
  const ouvert = !i.clos_le;
  const annonce = ouvert
    ? i.alerte_ouverture_le ? `annoncé le ${dateJournal(i.alerte_ouverture_le)}` : i.echecs < i.seuil ? "pas encore annoncé (un raté isolé n'alerte pas)" : i.alerte_erreur ? `e-mail refusé : ${i.alerte_erreur}` : "à annoncer"
    : i.alerte_cloture_le ? "rétablissement annoncé" : i.alerte_ouverture_le ? "rétablissement à annoncer" : "jamais annoncé (rétabli avant l'alerte)";
  return (
    <li>
      <div className="et-domaine">
        <span className="et-hote">{QUOI_INCIDENT[i.genre]}{i.genre === "page" || i.genre === "domaine_envoi" ? <> · {i.cible}</> : null}</span>
        <span className="discret">
          {i.boutique ? <Link href={`/boutiques/${i.boutique.slug}`}>{i.boutique.nom}</Link> : "Plateforme"}
          {i.detail ? <> · {i.detail}</> : null}
        </span>
        <span className="aide">{annonce}</span>
      </div>
      <div className="et-domaine-etat">
        <span className={PASTILLE[ouvert ? (i.genre === "page" ? "panne" : "attention") : "ok"]}>{ouvert ? "En cours" : "Rétabli"}</span>
        <span className="aide">{ouvert ? `depuis le ${dateJournal(i.ouvert_le)}` : `${duree(i.ouvert_le, i.clos_le!)} · le ${dateJournal(i.ouvert_le)}`}</span>
      </div>
    </li>
  );
}
