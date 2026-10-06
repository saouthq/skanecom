import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { GROUPES_DROITS, SANS_FORMULE } from "@/lib/console/formules";
import { jourLisible, joursDepuis, montant } from "@/lib/console/skanfact";
import { quand } from "@/lib/gestion/libelles";
import { DIRECTION } from "@/lib/gestion/tableau";
import { formateMontant } from "@/lib/prix";

export const metadata: Metadata = { title: "Abonnement" };

type Abonnement = {
  formule: { code: string; nom: string; description: string | null } | null;
  prix: number | null;
  personnalisee: boolean;
  demonstration: boolean;
  contact: string | null;
  droits: { code: string; groupe: string; libelle: string; description: string | null; ouvert: boolean; requise: string | null }[];
  facturation: {
    raison_sociale: string;
    lue_le: string | null;
    soldes: { devise: string; reste: string; echu: string; facturesAPayer: number; facturesEchues: number }[];
    retard: { depuis: string; jours: number; numero: string | null } | null;
    dernier_reglement: { date: string; montant: string; devise: string; facture: string | null } | null;
    factures: { numero: string | null; date: string; echeance: string | null; devise: string; net: string; reste: string; objet: string | null }[];
  } | null;
  envois: { mois: string; email: { envoyes: number; quota: number | null }; sms: { envoyes: number; quota: number | null } };
};

const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" });
const nombre = (n: number) => n.toLocaleString("fr-FR");

/* ============================================================================
   L'ABONNEMENT DU COMMERÇANT (migration …_gestion_abonnement) — ce qu'il
   paie à SkanEcom, en lecture : sa formule (ou « sur mesure »), son prix,
   ce qu'elle ouvre et ce qui vient avec une formule supérieure ; ses
   factures SkanEcom à payer, telles que la console les a lues dans SkanFact ;
   ses envois du mois face à ce qui est compris. Rien ne se paie ni ne se
   saisit ici : aucune carte n'est demandée sur SkanEcom.
   La direction de la boutique.
   ========================================================================== */
export default async function PageAbonnement({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { boutique } = await exigeMembre(slug);
  if (!DIRECTION.includes(boutique.role)) notFound();
  const { data, error } = await (await clientSession()).rpc("gestion_abonnement", { p_boutique_id: boutique.boutique_id });
  if (error) throw new Error(`Abonnement illisible : ${error.message}`);
  const a = data as Abonnement;
  const maintenant = new Date();
  const ouverts = a.droits.filter((d) => d.ouvert).length;
  const f = a.facturation;
  const ecrire = (sujet: string) => (a.contact ? `mailto:${a.contact}?subject=${encodeURIComponent(`${sujet} — ${boutique.nom}`)}` : null);
  const moisLu = MOIS.format(new Date(`${a.envois.mois}T00:00:00Z`));
  // « Envois d'octobre », « Envois de mai ».
  const duMois = `${/^[aeiouéâ]/i.test(moisLu) ? "d'" : "de "}${moisLu}`;

  return (
    <>
      <EnTetePage
        avant={<Link href={`/gestion/${slug}/reglages`}><Icone nom="retour" taille={14} /> Réglages</Link>}
        titre="Abonnement"
        description="Votre formule SkanEcom, ce qu'elle ouvre, et vos factures à payer. Aucune carte bancaire n'est demandée sur SkanEcom."
      />
      <div className="grille-2 ab-grille">
        {/* Ce qui est à payer d'abord (téléphone, lecture) ; sur grand écran, à droite. */}
        <div className="pile ab-col-factures">
          <section className="carte" aria-labelledby="t-ab-factures">
            <div className="carte-tete">
              <div>
                <h2 id="t-ab-factures" className="carte-titre-icone"><Icone nom="fichier" /> Factures à payer</h2>
                <p>
                  {a.demonstration ? "Une boutique de démonstration n'est pas facturée."
                    : !f ? "Vos factures SkanEcom paraîtront ici, dès que SkanEcom aura relié votre boutique à sa facturation."
                    : f.lue_le ? `Au nom de ${f.raison_sociale} · situation lue ${quand(f.lue_le, maintenant)}.`
                    : `Au nom de ${f.raison_sociale} · pas encore lue.`}
                </p>
              </div>
            </div>
            {f && f.lue_le ? (
              <div className="pile">
                {f.soldes.length === 0 ? (
                  <p className="fa-ajour"><span className="ui-etat ui-etat-point ui-etat-vert">À jour</span> Rien à payer.</p>
                ) : (
                  f.soldes.map((d) => (
                    <dl key={d.devise} className="chiffres-cles fa-chiffres ab-chiffres">
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
                {f.retard ? (
                  <p className="fa-retard">
                    <Icone nom="alerte" taille={16} />
                    <span>En retard depuis <b>{f.retard.jours} jour{f.retard.jours > 1 ? "s" : ""}</b> : <span className="whitespace-nowrap">{f.retard.numero ?? "une facture"}</span>, échue le {jourLisible(f.retard.depuis)}.</span>
                  </p>
                ) : null}
                {f.factures.length ? (
                  <ul className="ab-factures" role="list" aria-label="Factures à payer">
                    {f.factures.map((x, k) => {
                      const j = x.echeance ? joursDepuis(x.echeance, maintenant.getTime()) : null;
                      return (
                        <li key={`${x.numero ?? "sans"}-${k}`} className="ab-facture">
                          <span className="ab-facture-tete">
                            <b className="fa-numero">{x.numero ?? "Sans numéro"}</b>
                            <b className="tabular-nums whitespace-nowrap">{montant(x.reste, x.devise)}</b>
                          </span>
                          <span className="ab-facture-detail discret">
                            {x.objet ? `${x.objet} · ` : ""}émise le {jourLisible(x.date)}
                            {x.reste !== x.net ? ` · reste sur ${montant(x.net, x.devise)}` : ""}
                          </span>
                          <span className="ab-facture-echeance">
                            <span className="discret">Échéance le <span className="tabular-nums">{jourLisible(x.echeance)}</span></span>
                            {j === null ? null : j > 0 ? (
                              <span className="ui-etat ui-etat-point ui-etat-rouge">échue depuis {j} j</span>
                            ) : j === 0 ? (
                              <span className="ui-etat ui-etat-point ui-etat-ambre">échoit aujourd&apos;hui</span>
                            ) : (
                              <span className="discret">dans {-j} j</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {f.dernier_reglement ? (
                  <p className="aide">
                    Dernier règlement : <b className="tabular-nums">{montant(f.dernier_reglement.montant, f.dernier_reglement.devise)}</b> le {jourLisible(f.dernier_reglement.date)}
                    {f.dernier_reglement.facture ? `, sur ${f.dernier_reglement.facture}` : ""}.
                  </p>
                ) : null}
              </div>
            ) : null}
            {f ? (
              <div className="carte-pied ab-pied">
                <p className="aide">Pour régler une facture, en recevoir une copie ou poser une question, écrivez à SkanEcom.</p>
                {ecrire("Facture") ? (
                  <a href={ecrire("Facture")!} className="btn btn-second btn-petit"><Icone nom="courriel" taille={14} /> Écrire à SkanEcom</a>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="carte" aria-labelledby="t-ab-envois">
            <div className="carte-tete">
              <div>
                <h2 id="t-ab-envois" className="carte-titre-icone"><Icone nom="message" /> Envois {duMois}</h2>
                <p>Les e-mails et les SMS partis pour votre boutique : codes de connexion, suivi des commandes, lettre.</p>
              </div>
            </div>
            <ul className="ab-envois" role="list">
              {([["email", "E-mails", a.envois.email], ["sms", "SMS", a.envois.sms]] as const).map(([cle, titre, e]) => {
                const part = e.quota ? Math.min(100, Math.round((e.envoyes / e.quota) * 100)) : null;
                return (
                  <li key={cle} className="ab-envoi" data-plein={part !== null && part >= 90 ? "" : undefined}>
                    <span className="ab-envoi-tete">
                      <b>{titre}</b>
                      <span className="tabular-nums">
                        {nombre(e.envoyes)}{e.quota !== null ? <span className="discret"> sur {nombre(e.quota)} compris</span> : <span className="discret"> envoyé{e.envoyes > 1 ? "s" : ""}, sans limite fixée</span>}
                      </span>
                    </span>
                    {part !== null ? (
                      <span className="ab-jauge" role="meter" aria-label={`${titre} : ${part} % de ce qui est compris`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={part}>
                        <span style={{ inlineSize: `${part}%` }} />
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="pile ab-col-formule">
          <section className="carte" aria-labelledby="t-ab-formule">
            <div className="carte-tete">
              <div>
                <h2 id="t-ab-formule" className="carte-titre-icone"><Icone nom="cle" /> Votre formule</h2>
                <p>
                  {!a.droits.length || ouverts === a.droits.length
                    ? `Toutes les fonctions sont ouvertes à ${boutique.nom}.`
                    : `${ouverts} fonction${ouverts > 1 ? "s" : ""} sur ${a.droits.length} ouverte${ouverts > 1 ? "s" : ""} à ${boutique.nom} ; les autres viennent avec une formule supérieure.`}
                </p>
              </div>
            </div>
            <div className="ab-formule">
              <p className="ab-formule-nom">
                <b>{a.formule?.nom ?? SANS_FORMULE}</b>
                {a.personnalisee ? <span className="ui-etat ui-etat-point ui-etat-bleu">ajustée pour votre boutique</span> : null}
              </p>
              {a.prix !== null ? (
                <p className="ab-formule-prix"><b className="tabular-nums">{formateMontant(a.prix)} TND</b> <span className="discret">par mois</span></p>
              ) : null}
              {a.formule?.description ? <p className="aide">{a.formule.description}</p> : null}
            </div>
            {GROUPES_DROITS.map((g) => {
              const droits = a.droits.filter((d) => d.groupe === g.cle);
              if (!droits.length) return null;
              return (
                <div key={g.cle} className="ab-groupe">
                  <h3 className="ab-groupe-titre">{g.titre}</h3>
                  <ul className="ab-droits" role="list">
                    {droits.map((d) => (
                      <li key={d.code} className="ab-droit" data-ouvert={d.ouvert ? "" : undefined}>
                        <Icone nom={d.ouvert ? "coche" : "cle"} taille={14} />
                        <span>
                          {d.libelle}
                          {d.ouvert ? null : <span className="ab-droit-requise">{d.requise ? `Formule ${d.requise}` : "Hors formule"}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <div className="carte-pied ab-pied">
              <p className="aide">SkanEcom change la formule, ou ouvre une fonction, sur demande.</p>
              {ecrire("Formule") ? (
                <a href={ecrire("Formule")!} className="btn btn-second btn-petit"><Icone nom="courriel" taille={14} /> Écrire à SkanEcom</a>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
