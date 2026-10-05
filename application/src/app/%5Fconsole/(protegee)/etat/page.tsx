import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone, type NomIcone } from "@/components/console/Icone";
import { dateJournal } from "@/lib/console/libelles";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { chronometre, configuration, hoteLocal, LIBELLES_FOURNISSEUR, taille, type DonneesEtat } from "@/lib/console/etat";

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
const pose = (oui: boolean) => (oui ? <span className="et-pose">posé</span> : <span className="et-manque">manque</span>);
const pire = (points: Point[], sinon: Niveau): Niveau =>
  points.some((p) => p.niveau === "panne") ? "panne" : points.length ? "attention" : sinon;

export default async function EtatTechnique({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string; carte?: string }> }) {
  const { user } = await exigeAdmin();
  const v = await searchParams;
  const service = clientService();
  const [{ data, error }, duree] = await chronometre(() => service.rpc("console_etat_technique", { p_acteur: user.id }));
  if (error) throw new Error(`État technique illisible : ${error.message}`);
  const e = data as DonneesEtat;
  const c = await configuration();

  // ---- La base -------------------------------------------------------------
  const partConnexions = e.base.connexions_max ? e.base.connexions / e.base.connexions_max : 0;
  const pointsBase: Point[] = [];
  if (partConnexions >= 0.8) pointsBase.push({ niveau: "attention", texte: `${e.base.connexions} connexions ouvertes sur ${e.base.connexions_max} : près de la limite.` });
  if (duree > 1500) pointsBase.push({ niveau: "attention", texte: `La base a mis ${(duree / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s à répondre.` });
  const base: Carte = {
    id: "base", titre: "Base de données", icone: "modules",
    niveau: pire(pointsBase, "ok"), etat: pointsBase.length ? "À regarder" : "Répond",
    faits: [
      ["Répond en", `${duree.toLocaleString("fr-FR")} ms`],
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
  const aRegarder = [...cartes, { id: "domaines", titre: "Domaines", points: pointsDomaines }].flatMap((x) => x.points.map((p) => ({ ...p, carte: x.id, titre: x.titre })));
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
