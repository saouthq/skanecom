import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { boutiqueDe } from "@/lib/console/equipe-serveur";
import { dateJournal, deNom } from "@/lib/console/libelles";
import {
  accueilSkanFact, chercherClients, configSkanFact, contratsDuClient, jourLisible, joursDepuis, lienEcran, montant, relire,
  type ClientSkanFact, type FactureAPayer, type Lecture, type SituationSkanFact,
} from "@/lib/console/skanfact";
import { Icone, type NomIcone } from "@/components/console/Icone";
import { AbonnementSkanFact, type ValeursAbonnement } from "@/components/console/AbonnementSkanFact";
import { titreBoutique } from "@/lib/console/titre-boutique";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: await titreBoutique(params, "Facturation") };
}

type Facturation = {
  lien: { client: string; raison_sociale: string; identifiant: string | null; lie_le: string; lie_par: string | null; contrat: string | null } | null;
  situation: SituationSkanFact | null;
  factures: FactureAPayer[] | null;
  lue_le: string | null;
  matricule: string | null;
  dernier_avis: { evenement: string; recu_le: string } | null;
};

const EVENEMENTS: Record<string, string> = {
  "facture.emise": "facture émise",
  "facture.reglee": "facture réglée",
  "reglement.enregistre": "règlement enregistré",
};

const REGLES: { icone: NomIcone; texte: string }[] = [
  { icone: "oeil", texte: "La console lit les factures et tient l'abonnement ; émettre à la main, signer, envoyer à la TTN et encaisser se font dans SkanFact." },
  { icone: "cloche", texte: "Un règlement ou une facture saisis dans SkanFact arrivent ici par son avis, sans attendre." },
  { icone: "bouclier", texte: "Un lien vers SkanFact ne donne aucun droit : chacun s'y connecte avec son propre compte." },
];

/* La facturation d'une boutique cliente (cadrage 06, D20) : ses factures se
   font dans SkanFact, au nom de son client ; la console relie la boutique à
   ce client (retrouvé par son matricule), puis lit sa situation et ses
   factures à payer, à chaque visite. SkanFact injoignable : la dernière
   lecture, avec son heure. */
export default async function PageFacturation({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string; ok?: string; identifiant?: string } & ValeursAbonnement>;
}) {
  const { role } = await exigeAdmin();
  // Relier, délier, l'abonnement engagent le client : le super-administrateur seul (la base le redit).
  const superAdmin = role === "super_admin";
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const boutique = await boutiqueDe(slug);
  if (!boutique) notFound();
  const { data, error } = await clientService().rpc("console_facturation", { p_boutique_id: boutique.id });
  if (error) throw new Error(`Facturation illisible : ${error.message}`);
  const f = data as Facturation;
  const config = configSkanFact();
  const base = `/boutiques/${slug}/facturation`;
  const demonstration = boutique.demonstration === true;
  const hote = (await headers()).get("host");

  const bandeaux = (
    <>
      {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
      {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
    </>
  );

  if (!config) {
    return (
      <div className="pile">
        {bandeaux}
        <div className="vide">
          <span className="vide-icone"><Icone nom="billet" taille={20} /></span>
          <strong>SkanFact n&apos;est pas branché sur cette console</strong>
          <p>
            Les factures des clients se font dans SkanFact ; la console les lit avec une clé de l&apos;entreprise SkanEcom.
            Il manque ses secrets : <code>SKANFACT_URL</code>, <code>SKANFACT_ENTREPRISE</code> et <code>SKANFACT_CLE</code> (une clé qui n&apos;a
            que le geste « voir les pièces de vente »).
          </p>
        </div>
      </div>
    );
  }

  if (!f.lien && demonstration) {
    return (
      <div className="pile">
        {bandeaux}
        <div className="vide">
          <span className="vide-icone"><Icone nom="apercu" taille={20} /></span>
          <strong>Une boutique de démonstration n&apos;a pas de client à facturer</strong>
          <p>Si {boutique.nom} devient une vraie cliente, dites-le sur sa vue d&apos;ensemble ; elle se reliera ensuite à son client SkanFact.</p>
          <Link href={`/boutiques/${slug}#t-demonstration`} className="btn btn-second">Ouvrir sa vue d&apos;ensemble</Link>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------ pas encore reliée */
  if (!f.lien) {
    const cherche = (messages.identifiant ?? "").trim().slice(0, 40);
    const recherche: Lecture<ClientSkanFact[]> | null = cherche ? await chercherClients(config, cherche) : null;
    return (
      <div className="pile">
        {bandeaux}
        <section className="carte" aria-labelledby="t-fa-relier">
          <div className="carte-tete">
            <div>
              <h2 id="t-fa-relier" className="carte-titre-icone"><Icone nom="lien" /> Relier {boutique.nom} à son client SkanFact</h2>
              <p>
                Ses factures se font dans SkanFact, au nom de son client. Retrouvez-le par son matricule fiscal : la console lira
                ensuite ce qu&apos;il doit, ce qui est échu et son dernier règlement.
              </p>
            </div>
          </div>
          <form action={base} method="get" className="fa-recherche" role="search" aria-label="Chercher un client dans SkanFact">
            <div className="champ">
              <label htmlFor="fa-identifiant">Matricule fiscal du client</label>
              <input id="fa-identifiant" name="identifiant" required maxLength={40} autoComplete="off" spellCheck={false}
                defaultValue={cherche || f.matricule || ""} placeholder="1234567A/M/000" />
              <p className="aide">
                {f.matricule && !cherche
                  ? "Celui que la boutique a déclaré dans ses mentions légales. Les espaces et les majuscules ne comptent pas."
                  : "Les espaces et les majuscules ne comptent pas."}
              </p>
            </div>
            <button type="submit" className="btn btn-primaire"><Icone nom="recherche" taille={16} /> Chercher dans SkanFact</button>
          </form>

          {recherche && !recherche.ok ? (
            <p className="message message-erreur" role="alert">{recherche.raison}.</p>
          ) : null}
          {recherche && recherche.ok && recherche.donnees.length === 0 ? (
            <div className="fa-aucun" role="status">
              <p><b>Aucun client de l&apos;entreprise SkanEcom n&apos;a le matricule « {cherche} » dans SkanFact.</b></p>
              <p className="aide">Créez-le dans SkanFact, avec ce matricule, puis cherchez à nouveau.</p>
              <a className="btn btn-second" href={accueilSkanFact(config)} target="_blank" rel="noopener">
                Ouvrir SkanFact <Icone nom="externe" taille={14} />
              </a>
            </div>
          ) : null}
          {recherche && recherche.ok && recherche.donnees.length > 0 ? (
            <ul className="fa-clients" role="list" aria-label="Clients trouvés dans SkanFact">
              {recherche.donnees.map((c) => {
                const fiche = lienEcran(config, c.ecran);
                return (
                  <li key={c.id} className="fa-client">
                    <span className="initiale" aria-hidden="true">{c.raison_sociale.trim().charAt(0).toUpperCase()}</span>
                    <span className="fa-client-nom">
                      <b>{c.raison_sociale}</b>
                      <span className="discret">{[c.identifiant, c.pays, c.devise].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="fa-client-gestes">
                      {fiche ? (
                        <a href={fiche} target="_blank" rel="noopener" className="btn btn-fantome"
                          aria-label={`Voir la fiche de ${c.raison_sociale} dans SkanFact (nouvel onglet)`}>
                          Voir <Icone nom="externe" taille={14} />
                        </a>
                      ) : null}
                      {superAdmin ? (
                        <form action={`${base}/lier`} method="post">
                          <input type="hidden" name="client" value={c.id} />
                          <button type="submit" className="btn btn-primaire">Relier à ce client</button>
                        </form>
                      ) : <span className="aide">Un super-administrateur le relie.</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
        <Regles config={config} hote={hote} avis={f.dernier_avis} />
      </div>
    );
  }

  /* ------------------------------------------------ reliée : la lecture */
  const lien = f.lien;
  const [lecture, contrats] = await Promise.all([relire(config, boutique.id, lien.client), contratsDuClient(config, lien.client)]);
  const situation = lecture.ok ? lecture.donnees.situation : f.situation;
  const factures = lecture.ok ? lecture.donnees.factures : (f.factures ?? []);
  const instant = new Date();
  const lueLe = lecture.ok ? instant.toISOString() : f.lue_le;
  const maintenant = instant.getTime();
  const fiche = lienEcran(config, situation?.client.ecran);

  return (
    <div className="pile">
      {bandeaux}
      {!lecture.ok ? (
        <p className="message message-erreur" role="alert">
          {lecture.statut === 404
            ? `« ${lien.raison_sociale} » n'est plus un client de l'entreprise SkanEcom dans SkanFact : reliez la boutique à son client actuel.`
            : `${lecture.raison}.`}{" "}
          {f.lue_le ? `Ci-dessous, la situation lue le ${dateJournal(f.lue_le)}.` : "Aucune situation n'a encore été lue."}
        </p>
      ) : null}

      <div className="grille-2">
        <div className="pile">
          <section className="carte" aria-labelledby="t-fa-situation">
            <div className="carte-tete">
              <div>
                <h2 id="t-fa-situation" className="carte-titre-icone"><Icone nom="billet" /> Situation</h2>
                <p>
                  {lueLe ? <>Lue dans SkanFact le {dateJournal(lueLe)}{situation?.au ? <>, arrêtée au {jourLisible(situation.au)}</> : null}.</> : "Pas encore lue."}{" "}
                  <Link href={base} className="fa-relire">Relire</Link>
                </p>
              </div>
            </div>
            {situation ? <Soldes situation={situation} config={config} /> : null}
          </section>

          <section className="carte" aria-labelledby="t-fa-factures">
            <div className="carte-tete">
              <div>
                <h2 id="t-fa-factures" className="carte-titre-icone"><Icone nom="fichier" /> Factures à payer</h2>
                <p>
                  {factures.length === 0
                    ? "Aucune : tout ce que SkanFact a facturé à ce client est réglé."
                    : `${factures.length} facture${factures.length > 1 ? "s" : ""}, la plus récente en haut.`}
                </p>
              </div>
            </div>
            {factures.length ? (
              <div className="defile">
                <table className="tableau fa-factures">
                  <thead>
                    <tr><th>Facture</th><th>Échéance</th><th className="fa-num">Reste à payer</th></tr>
                  </thead>
                  <tbody>
                    {factures.map((x) => {
                      const ecran = lienEcran(config, x.ecran);
                      const j = x.echeance ? joursDepuis(x.echeance, maintenant) : null;
                      return (
                        <tr key={x.id}>
                          <td>
                            {ecran ? (
                              <a href={ecran} target="_blank" rel="noopener" className="fa-numero"
                                aria-label={`${x.numero ?? "La facture"}, à ouvrir dans SkanFact (nouvel onglet)`}>
                                {x.numero ?? "Sans numéro"} <Icone nom="externe" taille={12} />
                              </a>
                            ) : (
                              <b className="fa-numero">{x.numero ?? "Sans numéro"}</b>
                            )}
                            <span className="fa-detail discret">{x.objet ? `${x.objet} · ` : ""}émise le {jourLisible(x.datePiece)}</span>
                          </td>
                          <td className="whitespace-nowrap">
                            <span className="tabular-nums">{jourLisible(x.echeance)}</span>
                            {j === null ? null : j > 0 ? (
                              <span className="fa-detail"><span className="ui-etat ui-etat-point ui-etat-rouge">échue depuis {j} j</span></span>
                            ) : j === 0 ? (
                              <span className="fa-detail"><span className="ui-etat ui-etat-point ui-etat-ambre">échoit aujourd&apos;hui</span></span>
                            ) : (
                              <span className="fa-detail discret">dans {-j} j</span>
                            )}
                          </td>
                          <td className="fa-num">
                            <b className="tabular-nums whitespace-nowrap">{montant(x.reste, x.devise)}</b>
                            {x.reste !== x.netAPayer ? <span className="fa-detail discret tabular-nums whitespace-nowrap">sur {montant(x.netAPayer, x.devise)}</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>

        <div className="pile">
          <section className="carte" aria-labelledby="t-fa-client">
            <div className="carte-tete">
              <div>
                <h2 id="t-fa-client" className="carte-titre-icone"><Icone nom="personne" /> Client SkanFact</h2>
                <p>Les factures {deNom(boutique.nom)} sont faites à son nom.</p>
              </div>
            </div>
            <dl className="liste-def fa-fiche">
              <div><dt>Raison sociale</dt><dd>{situation?.client.raisonSociale ?? lien.raison_sociale}</dd></div>
              <div><dt>Matricule</dt><dd className="tabular-nums">{situation?.client.identifiant ?? lien.identifiant ?? "—"}</dd></div>
              <div><dt>Relié le</dt><dd className="tabular-nums">{dateJournal(lien.lie_le)}{lien.lie_par ? <span className="discret"> · {lien.lie_par}</span> : null}</dd></div>
            </dl>
            <div className="carte-pied fa-pied">
              {fiche ? (
                <a href={fiche} target="_blank" rel="noopener" className="btn btn-second">
                  Sa fiche dans SkanFact <Icone nom="externe" taille={14} />
                </a>
              ) : null}
              {superAdmin ? <details className="fa-delier">
                <summary className="btn btn-fantome">Délier</summary>
                <form action={`${base}/delier`} method="post" className="pile">
                  <p className="aide">La console oubliera ce client et sa situation. Dans SkanFact, rien ne change : ni le client, ni ses factures.</p>
                  <button type="submit" className="btn btn-danger">Délier ce client</button>
                </form>
              </details> : null}
            </div>
          </section>
          {superAdmin ? (
            <AbonnementSkanFact base={base} config={config} nom={boutique.nom} suivi={lien.contrat} contrats={contrats} maintenant={instant}
              valeurs={{ objet: messages.objet, designation: messages.designation, prix: messages.prix, tva: messages.tva, periode: messages.periode,
                prochaine: messages.prochaine, emettre_seul: messages.emettre_seul }} />
          ) : <p className="message">L&apos;abonnement de {boutique.nom} se tient dans SkanFact, par un super-administrateur.</p>}
          <Regles config={config} hote={hote} avis={f.dernier_avis} />
        </div>
      </div>
    </div>
  );
}

/** Ce qui reste à payer, par devise ; le retard ; le dernier règlement. */
function Soldes({ situation: s, config }: { situation: SituationSkanFact; config: NonNullable<ReturnType<typeof configSkanFact>> }) {
  const retard = s.retard;
  const ecranRetard = lienEcran(config, retard?.ecran);
  return (
    <div className="pile fa-soldes">
      {s.soldes.length === 0 ? (
        <p className="fa-ajour"><span className="ui-etat ui-etat-point ui-etat-vert">À jour</span> Rien à payer.</p>
      ) : (
        s.soldes.map((d) => (
          <dl key={d.devise} className="chiffres-cles fa-chiffres">
            <div className="chiffre-cle">
              <dt>Reste à payer</dt>
              <dd>{montant(d.reste, d.devise)}</dd>
              <p className="aide">{d.facturesAPayer} facture{d.facturesAPayer > 1 ? "s" : ""}</p>
            </div>
            <div className={`chiffre-cle${d.facturesEchues ? " fa-echu" : ""}`}>
              <dt>Dont échu</dt>
              <dd>{montant(d.echu, d.devise)}</dd>
              <p className="aide">{d.facturesEchues ? `${d.facturesEchues} facture${d.facturesEchues > 1 ? "s" : ""} échue${d.facturesEchues > 1 ? "s" : ""}` : "rien d'échu"}</p>
            </div>
          </dl>
        ))
      )}
      {retard ? (
        <p className="fa-retard">
          <Icone nom="alerte" taille={16} />
          <span>
            En retard depuis <b>{retard.jours} jour{retard.jours > 1 ? "s" : ""}</b> : {ecranRetard
              ? <a href={ecranRetard} target="_blank" rel="noopener">{retard.numero ?? "la facture"}</a>
              : (retard.numero ?? "une facture")}, échue le {jourLisible(retard.depuis)}.
          </span>
        </p>
      ) : null}
      <p className="aide">
        {s.dernierReglement
          ? <>Dernier règlement : <b className="tabular-nums">{montant(s.dernierReglement.montant, s.dernierReglement.devise)}</b> le {jourLisible(s.dernierReglement.date)}{s.dernierReglement.facture ? `, sur ${s.dernierReglement.facture}` : ""}.</>
          : "Aucun règlement enregistré dans SkanFact."}
      </p>
    </div>
  );
}

/** Ce que fait la console, et si les avis de SkanFact arrivent. */
function Regles({ config, hote, avis }: {
  config: NonNullable<ReturnType<typeof configSkanFact>>;
  hote: string | null;
  avis: Facturation["dernier_avis"];
}) {
  return (
    <section className="carte" aria-labelledby="t-fa-regles">
      <div className="carte-tete">
        <div>
          <h2 id="t-fa-regles" className="carte-titre-icone"><Icone nom="fichier" /> Les factures se font dans SkanFact</h2>
        </div>
      </div>
      <ul className="sp-regles" role="list">
        {REGLES.map((r) => (
          <li key={r.icone}>
            <span className="sp-regle-icone" aria-hidden="true"><Icone nom={r.icone} taille={16} /></span>
            <span>{r.texte}</span>
          </li>
        ))}
      </ul>
      <p className="aide fa-avis">
        {avis
          ? <>Dernier avis reçu de SkanFact : {EVENEMENTS[avis.evenement] ?? avis.evenement}, le {dateJournal(avis.recu_le)}.</>
          : <>Aucun avis reçu de SkanFact pour l&apos;instant. L&apos;abonnement se fait une fois, dans SkanFact, vers cette adresse :
              <code className="code-secret fa-adresse">https://{hote ?? "console"}/crochets/skanfact</code></>}
      </p>
      <div className="carte-pied">
        <a className="btn btn-second btn-bloc" href={accueilSkanFact(config)} target="_blank" rel="noopener">
          Ouvrir SkanFact <Icone nom="externe" taille={14} />
        </a>
      </div>
    </section>
  );
}
