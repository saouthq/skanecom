import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { EnDirect } from "@/components/console/EnDirect";
import { Jauge, Mesure } from "@/components/console/JaugeEnvois";
import { Icone } from "@/components/console/Icone";
import { LIBELLES_FOURNISSEUR } from "@/lib/console/etat";
import { LIBELLES_STATUT } from "@/lib/console/libelles";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { lireEnvoi } from "@/lib/courriels/envoi";
import { lireSms } from "@/lib/sms/envoi";
import { formateMontant } from "@/lib/prix";
import {
  CANAUX, LIBELLES_DEPASSEMENT, NATURES, coutDepassement, moisHistorique, niveauQuota, nombre, nomMois, projection,
  type BoutiqueConso, type Canal, type DonneesConsommation, type FormuleQuotas, type Niveau,
} from "@/lib/console/consommation";

export const metadata: Metadata = { title: "Consommation" };

/* ============================================================================
   LA CONSOMMATION — ce que chaque boutique envoie (e-mails, SMS) et à
   combien elle a droit, relu en direct (migration …_console_consommation).
   En haut, la plateforme face au forfait de son fournisseur ; puis chaque
   boutique, la plus proche de son quota d'abord : une ligne s'ouvre sur
   son détail du mois, ses quotas, ses crédits. En bas, les quotas des
   formules et le forfait du fournisseur. Régler : super-administrateur ;
   le support lit. Rien ne bloque jamais une commande ni un code.
   ========================================================================== */

type Params = { ok?: string; erreur?: string; carte?: string; mois?: string };

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Tunis" });
const tnd = (m: number) => `${formateMontant(m)} TND`;
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const pluriel = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;

/** La part du quota consommée la plus haute d'une boutique (−1 : aucun quota). */
const pression = (b: BoutiqueConso) =>
  Math.max(...CANAUX.map(({ cle }) => (b[cle].quota === null ? -1 : b[cle].quota === 0 ? (b[cle].envoyes ? 99 : 0) : b[cle].envoyes / b[cle].quota!)));

export default async function Consommation({ searchParams }: { searchParams: Promise<Params> }) {
  const { user, role } = await exigeAdmin();
  const p = await searchParams;
  const mois = /^\d{4}-\d{2}$/.test(p.mois ?? "") ? `${p.mois}-01` : null;
  const { data, error } = await clientService().rpc("console_consommation", { p_acteur: user.id, p_mois: mois });
  if (error) throw new Error(`Consommation illisible : ${error.message}`);
  const d = data as DonneesConsommation;
  const peutRegler = role === "super_admin";
  const formules = new Map(d.formules.map((f) => [f.code, f]));
  const message = (carte: string) => (p.carte === carte ? (p.erreur ? { erreur: p.erreur } : p.ok ? { ok: p.ok } : null) : null);
  const leMois = nomMois(d.mois);

  const clientes = d.boutiques.filter((b) => !b.demonstration)
    .sort((a, b) => pression(b) - pression(a) || (b.email.envoyes + b.sms.envoyes) - (a.email.envoyes + a.sms.envoyes) || a.nom.localeCompare(b.nom, "fr"));
  const demos = d.boutiques.filter((b) => b.demonstration).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const depassements = clientes.flatMap((b) => CANAUX.map(({ cle }) => ({
    b, canal: cle, niveau: niveauQuota(b[cle].envoyes, b[cle].quota), cout: coutDepassement(b[cle], cle, formules.get(b.formule ?? "")),
  }))).filter((x) => x.niveau === "depasse");
  const boutiquesAuDela = new Set(depassements.map((x) => x.b.id)).size;
  const proches = clientes.filter((b) => CANAUX.some(({ cle }) => ["proche", "atteint"].includes(niveauQuota(b[cle].envoyes, b[cle].quota)))).length;
  const aFacturer = depassements.reduce((n, x) => n + (x.cout ?? 0), 0);
  const sansPrix = depassements.some((x) => x.cout === null);
  const aucunQuota = d.formules.every((f) => f.emails === null && f.sms === null) && clientes.every((b) => b.email.quota === null && b.sms.quota === null);
  const refuses = d.totaux.email.refuses + d.totaux.sms.refuses;

  return (
    <>
      <EnTetePage
        titre="Consommation"
        description="Ce que chaque boutique envoie, e-mails et SMS, et à combien elle a droit. Compté à chaque envoi. Rien ne bloque jamais une commande ni un code."
        actions={
          <div className="cs-actions">
            {d.courant ? <EnDirect lue={HEURE.format(new Date())} /> : null}
            <form method="get" action="/consommation" className="cs-mois">
              <label htmlFor="cs-mois" className="sr-only">Mois affiché</label>
              <select id="cs-mois" className="entree" name="mois" data-envoi-auto defaultValue={d.mois.slice(0, 7)}>
                {d.mois_disponibles.map((m) => <option key={m} value={m.slice(0, 7)}>{majuscule(nomMois(m))}</option>)}
              </select>
              <noscript><button type="submit" className="btn btn-second btn-petit">Voir</button></noscript>
            </form>
          </div>
        }
      />

      <ul className="tbp-chiffres cs-chiffres" role="list">
        {CANAUX.map(({ cle, libelle }) => <ChiffreCanal key={cle} canal={cle} libelle={libelle} d={d} />)}
        <li className="carte" data-niveau={boutiquesAuDela ? "alerte" : proches ? "attention" : undefined}>
          <span className="tbp-libelle">Au-delà de leur quota</span>
          <b className="tbp-valeur">{boutiquesAuDela} <small>{boutiquesAuDela > 1 ? "boutiques" : "boutique"}</small></b>
          <span className="aide">
            {aucunQuota ? <>Aucun quota fixé : <Link href="#t-formules">les fixer par formule</Link>.</>
              : boutiquesAuDela ? (aFacturer ? `${tnd(aFacturer)} de dépassement à facturer${sansPrix ? ", et du dépassement sans prix" : ""}` : "Dépassement sans prix fixé : à décider")
              : proches ? `${pluriel(proches, "boutique", "boutiques")} à plus de 80 %` : "Toutes dans leur quota."}
          </span>
        </li>
        <li className="carte" data-niveau={refuses ? "attention" : undefined}>
          <span className="tbp-libelle">Refusés par le fournisseur</span>
          <b className="tbp-valeur">{nombre(refuses)}</b>
          <span className="aide">{refuses ? <Link href="/journal?vue=envois&echecs=1">Voir lesquels</Link> : "Aucun : tout est parti."}</span>
        </li>
      </ul>

      <section className="carte carte-plate cs-bloc" aria-labelledby="t-boutiques">
        <header className="cs-tete">
          <h2 id="t-boutiques">Par boutique</h2>
          <p className="aide">{majuscule(leMois)}, la plus proche de son quota d&apos;abord. Une ligne s&apos;ouvre sur son détail{peutRegler ? ", ses quotas et ses crédits" : ""}.</p>
        </header>
        {clientes.length === 0 && demos.length === 0 ? <p className="discret cs-vide">Aucune boutique pour l&apos;instant.</p> : (
          <ul className="cs-liste" role="list">
            {clientes.map((b) => <LigneBoutique key={b.id} b={b} d={d} f={formules.get(b.formule ?? "")} peutRegler={peutRegler} message={message(`b-${b.slug}`)} />)}
            {demos.length ? <li className="cs-intertitre" aria-hidden="true">Démonstrations — comptées dans le forfait, sans quota à vendre</li> : null}
            {demos.map((b) => <LigneBoutique key={b.id} b={b} d={d} f={formules.get(b.formule ?? "")} peutRegler={peutRegler} message={message(`b-${b.slug}`)} />)}
            <li className="cs-ligne cs-skanecom">
              <div className="cs-resume">
                <span className="cs-qui">
                  <span className="cs-nom">SkanEcom</span>
                  <span className="cs-formule">La console (mots de passe), et les envois d&apos;avant le comptage par boutique</span>
                </span>
                {CANAUX.map(({ cle, libelle }) => <Mesure key={cle} libelle={libelle} c={d.skanecom[cle]} d={d} />)}
                <span className="cs-chevron" aria-hidden="true" />
              </div>
            </li>
          </ul>
        )}
      </section>

      <QuotasFormules formules={d.formules} peutRegler={peutRegler} message={message("formules")} />
      <ForfaitFournisseur d={d} peutRegler={peutRegler} message={message("forfait")} />
    </>
  );
}

const NIVEAU_CARTE: Partial<Record<Niveau, string>> = { proche: "attention", atteint: "attention", depasse: "alerte" };

function ChiffreCanal({ canal, libelle, d }: { canal: Canal; libelle: string; d: DonneesConsommation }) {
  const t = d.totaux[canal];
  const forfait = d.forfaits[canal];
  const jour = d.aujourdhui[canal];
  const niveauMois = forfait?.mois ? niveauQuota(t.envoyes, forfait.mois) : "libre";
  const niveauJour = d.courant && forfait?.jour ? niveauQuota(jour, forfait.jour) : "libre";
  const pire = (["depasse", "atteint", "proche"] as Niveau[]).find((n) => n === niveauMois || n === niveauJour);
  const fin = forfait?.mois ? projection(t.envoyes, d) : null;
  return (
    <li className="carte" data-niveau={pire ? NIVEAU_CARTE[pire] : undefined}>
      <span className="tbp-libelle">{libelle} · {nomMois(d.mois)}</span>
      <b className="tbp-valeur">{nombre(t.envoyes)}{forfait?.mois ? <small> sur {nombre(forfait.mois)}</small> : null}</b>
      {forfait?.mois ? <Jauge envoyes={t.envoyes} quota={forfait.mois} libelle={`${libelle} du mois, au forfait du fournisseur`} /> : null}
      <span className="aide">
        {!forfait ? <>Forfait du fournisseur non renseigné · <Link href="#t-forfait">le renseigner</Link></> : (
          <>
            {forfait.fournisseur ?? "Forfait"}
            {d.courant && forfait.jour ? ` · aujourd'hui ${nombre(jour)} sur ${nombre(forfait.jour)}` : ""}
            {fin !== null && forfait.mois && fin > forfait.mois ? ` · ≈\u00a0${nombre(fin)} à la fin du mois` : ""}
          </>
        )}
      </span>
    </li>
  );
}

function LigneBoutique({ b, d, f, peutRegler, message }: {
  b: BoutiqueConso; d: DonneesConsommation; f: FormuleQuotas | undefined; peutRegler: boolean; message: { ok: string } | { erreur: string } | null;
}) {
  const historique = moisHistorique(d.mois);
  const etat = [b.formule_nom ?? "Sur mesure", b.statut !== "active" ? LIBELLES_STATUT[b.statut] ?? b.statut : null].filter(Boolean).join(" · ");
  return (
    <li className="cs-ligne" data-demo={b.demonstration || undefined}>
      <details className="cs-details" id={`t-b-${b.slug}`} open={message ? true : undefined}>
        <summary className="cs-resume">
          <span className="cs-qui">
            <span className="cs-nom">{b.nom}</span>
            <span className="cs-formule">{etat}{b.depassement === "codes_par_email" ? " · codes par e-mail au-delà" : ""}</span>
          </span>
          {CANAUX.map(({ cle, libelle }) => <Mesure key={cle} libelle={libelle} c={b[cle]} d={d} />)}
          <span className="cs-chevron"><span className="sr-only">{peutRegler ? "Régler" : "Détail"}</span><Icone nom="selecteur" taille={16} /></span>
        </summary>
        <div className="cs-panneau">
          {message ? (
            "erreur" in message
              ? <p className="message message-erreur" role="alert">{message.erreur}</p>
              : <p className="message message-succes" role="status">{message.ok}</p>
          ) : null}
          <div className="cs-panneau-grille">
            <section className="cs-detail" aria-label={`Le détail de ${nomMois(d.mois)}`}>
              {CANAUX.map(({ cle, libelle }) => {
                const c = b[cle];
                const max = Math.max(1, ...c.historique, c.quota ?? 0);
                return (
                  <div key={cle} className="cs-detail-canal">
                    <h3>{libelle}</h3>
                    <ul className="cs-natures" role="list">
                      {NATURES.filter((n) => c.par_nature[n.cle]).map((n) => (
                        <li key={n.cle}><span>{n.libelle}</span><b>{nombre(c.par_nature[n.cle] ?? 0)}</b></li>
                      ))}
                      {c.refuses ? <li className="cs-refuses"><span>Refusés (hors quota)</span><b>{nombre(c.refuses)}</b></li> : null}
                      {!c.envoyes && !c.refuses ? <li className="discret">Rien ce mois-ci.</li> : null}
                    </ul>
                    {c.quota !== null ? (
                      <p className="aide">
                        Quota : {nombre(c.quota)}
                        {c.credits ? ` (dont ${nombre(c.credits)} de crédit)` : ""}
                        {" — "}{(cle === "sms" ? b.exception.sms : b.exception.emails) !== null ? "exception de la boutique" : `formule ${b.formule_nom}`}
                      </p>
                    ) : null}
                    <ol className="cs-histo" role="list" aria-label={`${libelle}, six derniers mois`}>
                      {c.historique.map((n, i) => (
                        <li key={i} title={`${historique[i]} : ${nombre(n)}`}>
                          <span className="cs-histo-barre" style={{ blockSize: `${Math.round((n / max) * 100)}%` }} />
                          <span className="cs-histo-mois">{historique[i]}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </section>

            {peutRegler ? (
              <form action="/consommation/boutique" method="post" className="cs-form">
                <h3>Quotas de la boutique</h3>
                <input type="hidden" name="boutique_id" value={b.id} />
                <input type="hidden" name="slug" value={b.slug} />
                <div className="cs-champs">
                  {CANAUX.map(({ cle, libelle }) => {
                    const deFormule = cle === "sms" ? f?.sms : f?.emails;
                    const exception = cle === "sms" ? b.exception.sms : b.exception.emails;
                    return (
                      <div key={cle} className="champ">
                        <label htmlFor={`q-${cle}-${b.slug}`}>{libelle} par mois</label>
                        <input id={`q-${cle}-${b.slug}`} name={cle === "sms" ? "sms" : "emails"} inputMode="numeric" autoComplete="off"
                          defaultValue={exception === null ? "" : nombre(exception)} placeholder={deFormule != null ? nombre(deFormule) : "Sans limite"} aria-describedby={`q-${cle}-${b.slug}-aide`} />
                        <span className="aide" id={`q-${cle}-${b.slug}-aide`}>
                          Vide : {f ? (deFormule != null ? `${nombre(deFormule)}, ceux de ${f.nom}` : `${f.nom} n'en fixe pas`) : "sur mesure, sans limite"}.
                        </span>
                      </div>
                    );
                  })}
                </div>
                <fieldset className="cs-depassement">
                  <legend>Au dépassement</legend>
                  {(Object.keys(LIBELLES_DEPASSEMENT) as BoutiqueConso["depassement"][]).map((cle) => (
                    <label key={cle} className="cs-choix">
                      <input type="radio" name="depassement" value={cle} defaultChecked={b.depassement === cle} />
                      <span><b>{LIBELLES_DEPASSEMENT[cle].court}</b><span className="aide">{LIBELLES_DEPASSEMENT[cle].long}</span></span>
                    </label>
                  ))}
                </fieldset>
                <button type="submit" className="btn btn-primaire btn-petit">Enregistrer les quotas</button>
              </form>
            ) : null}

            {peutRegler && d.courant ? (
              <div className="cs-form">
                <h3>Un crédit pour {nomMois(d.mois)}</h3>
                <p className="aide">S&apos;ajoute au quota, ce mois-ci seulement : une promotion, un mois chargé.</p>
                <form action="/consommation/credit" method="post" className="cs-credit">
                  <input type="hidden" name="boutique_id" value={b.id} />
                  <input type="hidden" name="slug" value={b.slug} />
                  <div className="champ">
                    <label htmlFor={`c-n-${b.slug}`}>Combien</label>
                    <input id={`c-n-${b.slug}`} name="quantite" inputMode="numeric" required autoComplete="off" placeholder="500" />
                  </div>
                  <div className="champ">
                    <label htmlFor={`c-c-${b.slug}`}>De quoi</label>
                    <select id={`c-c-${b.slug}`} name="canal" defaultValue="email">
                      <option value="email">E-mails</option>
                      <option value="sms">SMS</option>
                    </select>
                  </div>
                  <div className="champ cs-motif">
                    <label htmlFor={`c-m-${b.slug}`}>Pourquoi <span className="discret">(facultatif)</span></label>
                    <input id={`c-m-${b.slug}`} name="motif" maxLength={200} autoComplete="off" placeholder="Soldes d'octobre" />
                  </div>
                  <button type="submit" className="btn btn-second btn-petit"><Icone nom="plus" taille={14} /> Ajouter</button>
                </form>
                {b.credits.length ? (
                  <ul className="cs-credits" role="list">
                    {b.credits.map((k) => (
                      <li key={k.id}>
                        <span><b>+{nombre(k.quantite)} {k.canal === "sms" ? "SMS" : "e-mails"}</b>{k.motif ? ` · ${k.motif}` : ""}{k.par ? <span className="discret"> · {k.par}</span> : null}</span>
                        <form action="/consommation/credit/retirer" method="post">
                          <input type="hidden" name="id" value={k.id} />
                          <input type="hidden" name="slug" value={b.slug} />
                          <button type="submit" className="btn btn-fantome btn-petit" aria-label={`Retirer le crédit de ${nombre(k.quantite)} ${k.canal === "sms" ? "SMS" : "e-mails"}`}>Retirer</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
          <Link href={`/boutiques/${b.slug}`} className="cs-fiche">Ouvrir la fiche de {b.nom} <Icone nom="externe" taille={13} /></Link>
        </div>
      </details>
    </li>
  );
}

function QuotasFormules({ formules, peutRegler, message }: { formules: FormuleQuotas[]; peutRegler: boolean; message: { ok: string } | { erreur: string } | null }) {
  const champ = (f: FormuleQuotas, nom: string, valeur: string, libelle: string, placeholder: string, unite?: string) => (
    <label className="cs-cellule">
      <input className="entree" name={`${nom}__${f.code}`} inputMode={unite ? "decimal" : "numeric"} autoComplete="off" defaultValue={valeur} placeholder={placeholder} aria-label={`${libelle}, ${f.nom}`} />
      {unite ? <span>{unite}</span> : null}
    </label>
  );
  const lu = (n: number | null, prix = false) => (n === null ? <span className="discret">{prix ? "Prix à fixer" : "Sans limite"}</span> : prix ? tnd(n) : nombre(n));
  const corps = (
    <div className="defile">
      <table className="tableau cs-tableau">
        <thead>
          <tr>
            <th scope="col">Formule</th><th scope="col">E-mails par mois</th><th scope="col">SMS par mois</th>
            <th scope="col">Un SMS au-delà</th><th scope="col">1 000 e-mails au-delà</th><th scope="col" className="cs-n">Boutiques</th>
          </tr>
        </thead>
        <tbody>
          {formules.map((f) => (
            <tr key={f.code}>
              <th scope="row">{f.nom}{peutRegler ? <input type="hidden" name="codes" value={f.code} /> : null}</th>
              <td>{peutRegler ? champ(f, "emails", f.emails === null ? "" : nombre(f.emails), "E-mails par mois", "Sans limite") : lu(f.emails)}</td>
              <td>{peutRegler ? champ(f, "sms", f.sms === null ? "" : nombre(f.sms), "SMS par mois", "Sans limite") : lu(f.sms)}</td>
              <td>{peutRegler ? champ(f, "prix_sms", f.prix_sms === null ? "" : formateMontant(f.prix_sms), "Prix d'un SMS au-delà", "À fixer", "TND") : lu(f.prix_sms, true)}</td>
              <td>{peutRegler ? champ(f, "prix_emails", f.prix_emails === null ? "" : formateMontant(f.prix_emails), "Prix de 1 000 e-mails au-delà", "À fixer", "TND") : lu(f.prix_emails, true)}</td>
              <td className="cs-n">{f.boutiques}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section className="carte carte-plate cs-bloc" id="t-formules" aria-labelledby="h-formules">
      <header className="cs-tete">
        <h2 id="h-formules">Les quotas des formules</h2>
        <p className="aide">
          Ce que chaque formule comprend par mois. Vide : pas encore décidé, rien n&apos;est limité. Un prix au-delà chiffre le dépassement
          (ici et dans <Link href="/revenus">Revenus</Link>) ; rien n&apos;est facturé tout seul. Une boutique peut avoir son exception (sa ligne, plus haut).
        </p>
      </header>
      {message ? ("erreur" in message
        ? <p className="message message-erreur" role="alert">{message.erreur}</p>
        : <p className="message message-succes" role="status">{message.ok}</p>) : null}
      {formules.length === 0 ? <p className="discret cs-vide">Aucune formule : <Link href="/formules">en créer une</Link>.</p>
        : peutRegler ? (
          <form action="/consommation/formules" method="post" className="cs-formules">
            {corps}
            <div className="cs-pied"><button type="submit" className="btn btn-primaire btn-petit">Enregistrer les quotas des formules</button></div>
          </form>
        ) : <>{corps}<p className="aide cs-pied">Seul un super-administrateur fixe les quotas.</p></>}
    </section>
  );
}

function ForfaitFournisseur({ d, peutRegler, message }: { d: DonneesConsommation; peutRegler: boolean; message: { ok: string } | { erreur: string } | null }) {
  const configures: Record<Canal, string | null> = {
    email: LIBELLES_FOURNISSEUR[lireEnvoi(process.env.COURRIELS_ENVOI ?? "").fournisseur] ?? null,
    sms: ({ twilio: "Twilio", relais: "Relais local", aucun: "Aucun" } as Record<string, string>)[lireSms(process.env.SMS_ENVOI ?? "").fournisseur] ?? null,
  };
  return (
    <section className="carte carte-plate cs-bloc" id="t-forfait" aria-labelledby="h-forfait">
      <header className="cs-tete">
        <h2 id="h-forfait">Le forfait du fournisseur</h2>
        <p className="aide">
          Ce que l&apos;abonnement de SkanEcom chez son fournisseur permet : au-delà, il refuse les envois, toutes boutiques confondues.
          La console prévient à 80 %. Pour mémoire, Resend gratuit : 3 000 e-mails par mois, 100 par jour.
        </p>
      </header>
      {message ? ("erreur" in message
        ? <p className="message message-erreur" role="alert">{message.erreur}</p>
        : <p className="message message-succes" role="status">{message.ok}</p>) : null}
      <div className="cs-forfaits">
        {CANAUX.map(({ cle, libelle }) => {
          const f = d.forfaits[cle];
          return peutRegler ? (
            <form key={cle} action="/consommation/forfait" method="post" className="cs-forfait">
              <h3>{libelle}{configures[cle] ? <span className="discret"> · branché : {configures[cle]}</span> : null}</h3>
              <input type="hidden" name="canal" value={cle} />
              <div className="champ">
                <label htmlFor={`f-n-${cle}`}>Fournisseur</label>
                <input id={`f-n-${cle}`} name="fournisseur" maxLength={40} autoComplete="off" defaultValue={f?.fournisseur ?? ""} placeholder={cle === "sms" ? "Twilio" : "Resend"} />
              </div>
              <div className="champ">
                <label htmlFor={`f-m-${cle}`}>Par mois</label>
                <input id={`f-m-${cle}`} name="mois" inputMode="numeric" autoComplete="off" defaultValue={f?.mois ? nombre(f.mois) : ""} placeholder="—" />
              </div>
              <div className="champ">
                <label htmlFor={`f-j-${cle}`}>Par jour <span className="discret">(facultatif)</span></label>
                <input id={`f-j-${cle}`} name="jour" inputMode="numeric" autoComplete="off" defaultValue={f?.jour ? nombre(f.jour) : ""} placeholder="—" />
              </div>
              <button type="submit" className="btn btn-second btn-petit">Enregistrer</button>
            </form>
          ) : (
            <div key={cle} className="cs-forfait">
              <h3>{libelle}</h3>
              <p>{f ? `${f.fournisseur ?? "Forfait"} : ${nombre(f.mois ?? 0)} par mois${f.jour ? `, ${nombre(f.jour)} par jour` : ""}` : <span className="discret">Non renseigné</span>}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
