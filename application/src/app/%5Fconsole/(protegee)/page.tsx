import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { LIBELLES_STATUT } from "@/lib/console/libelles";
import { couleursDe, depuis, type LignePilotage, type Vigilance } from "@/lib/console/pilotage";
import { GROUPES_INFO_COURT, STATUTS_FILTRE, TRIS, filtreBoutiques, lisFiltres, parametres, trieBoutiques } from "@/lib/console/accueil";
import { chargeAccueil } from "@/lib/console/accueil-serveur";
import { formateMontant } from "@/lib/prix";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { Semaine, TuileBoutique } from "@/components/console/TuileBoutique";
import { SANS_FORMULE } from "@/lib/console/formules";

export const metadata: Metadata = { title: "Boutiques" };

type CodeApercu = { id: number; le: string; canal: "sms" | "email"; destinataire: string; code: string; sujet: string | null; courriel: boolean };

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });

/* LE POSTE DE PILOTAGE — toutes les boutiques d'un coup d'œil (lib/console/
   pilotage.ts, accueil.ts) : en tête, quatre chiffres ; puis « À surveiller »
   rangé — ce qui presse, chaque ligne mise à plus tard d'un geste ; les
   simples informations regroupées par genre, repliées ; ce qu'on a reporté,
   à part. Ensuite chaque boutique, à sa couleur, triée comme on le choisit ;
   en liste (?vue=liste), le même état en tableau ; « Exporter » emporte ce
   que montre le filtre. Sur l'aperçu en ligne seulement
   (supabase/apercu/codes-demo.sql), les codes de connexion que Supabase
   aurait envoyés par SMS ou par e-mail. */
const RETOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });

/** Mettre un signal à plus tard : jusqu'à demain, ou pour une semaine. Un
 *  menu qui se ferme comme les autres (Échap, clic dehors : FermeConfirmations). */
function PlusTard({ v, retour }: { v: Vigilance; retour: string }) {
  return (
    <details className="bt-confirmer pl-plus-tard">
      <summary className="btn btn-fantome btn-petit" aria-label={`Mettre à plus tard : ${v.boutique?.nom ?? "plateforme"}, ${v.texte}`}>
        <Icone nom="horloge" taille={14} /> <span className="pl-plus-tard-texte">Plus tard</span>
      </summary>
      <form action="/vigilance" method="post" className="bt-confirmer-panneau pl-plus-tard-menu">
        <input type="hidden" name="cle" value={v.cle} />
        <input type="hidden" name="niveau" value={v.niveau} />
        <input type="hidden" name="retour" value={retour} />
        <p className="aide">Le taire pour toute l&apos;équipe ; il revient seul, ou plus tôt s&apos;il s&apos;aggrave.</p>
        <button type="submit" name="jours" value="1" className="btn btn-second btn-petit">Jusqu&apos;à demain</button>
        <button type="submit" name="jours" value="7" className="btn btn-second btn-petit">Pendant une semaine</button>
      </form>
    </details>
  );
}

export default async function Tableau({ searchParams }: { searchParams: Promise<{ vue?: string; q?: string; statut?: string; formule?: string; type?: string; tri?: string; ok?: string; erreur?: string; carte?: string }> }) {
  const { user } = await exigeAdmin();
  const p = await searchParams;
  const enListe = p.vue === "liste";
  const [{ boutiques, formules, signaux, pressants, infos, reportes, maintenant }, { data: codesApercu }] = await Promise.all([
    chargeAccueil(user.id),
    // Absente hors de l'aperçu : l'erreur la cache, rien d'autre.
    clientService().rpc("console_codes_apercu"),
  ]);
  const f = lisFiltres(p, formules.formules.map((x) => x.code));
  const nomsFormules = new Map(formules.formules.map((x) => [x.code, x.nom]));
  const formuleDe = new Map(formules.boutiques.map((x) => [x.id, x.formule ? nomsFormules.get(x.formule) ?? x.formule : null]));
  const codeFormuleDe = new Map(formules.boutiques.map((x) => [x.id, x.formule]));
  const codes = Array.isArray(codesApercu) ? (codesApercu as CodeApercu[]) : null;
  const filtree = f.q !== "" || f.statut !== "" || f.formule !== "" || f.type !== "";
  const visibles = trieBoutiques(filtreBoutiques(boutiques, f, codeFormuleDe), f.tri, signaux);
  const fermees = boutiques.filter((b) => b.statut === "fermee").length;
  const lienVue = (liste: boolean) => `/${parametres(f, liste ? { vue: "liste" } : {})}`;
  const ici = lienVue(enListe);
  const hoteConsole = (await headers()).get("host");
  const messageVigilance = p.carte === "vigilance" ? (p.erreur ? { erreur: p.erreur } : p.ok ? { ok: p.ok } : null) : null;

  // La synthèse ne compte que les clientes : les boutiques de démonstration vendent pour de faux.
  const clientes = boutiques.filter((b) => !b.demonstration && b.statut !== "fermee");
  const demos = boutiques.filter((b) => b.demonstration && b.statut !== "fermee");
  const ouvertes = clientes.filter((b) => b.statut === "active").length;
  const enPreparation = clientes.filter((b) => b.statut === "en_preparation").length;
  const publies = clientes.reduce((n, b) => n + b.publies, 0);
  const semaine = clientes.reduce((n, b) => n + b.commandes.semaine, 0);
  const aConfirmer = clientes.reduce((n, b) => n + b.commandes.a_confirmer, 0);
  const encaisse = clientes.reduce((n, b) => n + b.commandes.encaisse_semaine, 0);
  const nInfos = infos.reduce((n, g) => n + g.signaux.length, 0);
  const tuiles = (liste: LignePilotage[]) => (
    <div className="pl-grille">
      {liste.map((b) => <TuileBoutique key={b.id} b={b} maintenant={maintenant} hoteConsole={hoteConsole} formule={formuleDe.get(b.id) ?? SANS_FORMULE} />)}
    </div>
  );
  const clientesVisibles = visibles.filter((b) => !b.demonstration);
  const demosVisibles = visibles.filter((b) => b.demonstration);

  return (
    <>
      <EnTetePage
        titre="Boutiques"
        description="Ce qui demande un regard, puis chacune de vos boutiques."
        actions={
          <>
            <nav className="segments pl-vues" aria-label="Affichage des boutiques">
              <Link href={lienVue(false)} aria-current={enListe ? undefined : "page"}><Icone nom="apercu" taille={14} /> Tuiles</Link>
              <Link href={lienVue(true)} aria-current={enListe ? "page" : undefined}><Icone nom="liste" taille={14} /> Liste</Link>
            </nav>
            <Link href="/nouvelle-boutique" className="btn btn-primaire"><Icone nom="plus" /> Nouvelle boutique</Link>
          </>
        }
      />

      {boutiques.length === 0 ? (
        <div className="vide">
          <span className="vide-icone"><Icone nom="boutique" taille={20} /></span>
          <strong>Aucune boutique pour l&apos;instant</strong>
          <p>Créez la première : son domaine, son gabarit, puis sa marque et son catalogue.</p>
          <Link href="/nouvelle-boutique" className="btn btn-primaire mt-3"><Icone nom="plus" /> Nouvelle boutique</Link>
        </div>
      ) : (
        <>
          {/* Quatre chiffres, les clientes seules (les démonstrations vendent pour de faux). */}
          <ul className="tbp-chiffres pl-synthese" role="list" aria-label="La plateforme en chiffres">
            <li className="carte">
              <span className="tbp-libelle">Clientes</span>
              <b className="tbp-valeur">{clientes.length}</b>
              <span className="tbp-evolution discret">
                {ouvertes} ouverte{ouvertes > 1 ? "s" : ""}{enPreparation ? ` · ${enPreparation} en préparation` : ""}{demos.length ? ` · ${demos.length} de démonstration à part` : ""}
              </span>
            </li>
            <li className="carte">
              <span className="tbp-libelle">Commandes sur 7 jours</span>
              <b className="tbp-valeur">{semaine}</b>
              <span className="tbp-evolution discret">{aConfirmer ? `${aConfirmer} à confirmer en ce moment` : "rien à confirmer en ce moment"}</span>
            </li>
            <li className="carte">
              <span className="tbp-libelle">Encaissé sur 7 jours</span>
              <b className="tbp-valeur">{formateMontant(encaisse)} <small>TND</small></b>
              <span className="tbp-evolution discret">clientes seules</span>
            </li>
            <li className="carte">
              <span className="tbp-libelle">Produits en vitrine</span>
              <b className="tbp-valeur">{publies}</b>
              <span className="tbp-evolution discret"><Link href="/tableau" className="btn-lien">Le tableau de bord</Link></span>
            </li>
          </ul>

          <section className="pl-vigilance" aria-labelledby="t-vigilance">
            <h2 id="t-vigilance" className="pl-vigilance-titre">
              À surveiller{pressants.length ? <span className="pl-compte tabular-nums" data-urgent={pressants.some((v) => v.niveau === "urgent") ? "" : undefined}>{pressants.length}</span> : null}
            </h2>
            {messageVigilance ? (
              "erreur" in messageVigilance
                ? <p className="message message-erreur pl-vigilance-retour" role="alert">{messageVigilance.erreur}</p>
                : <p className="message message-succes pl-vigilance-retour" role="status">{messageVigilance.ok}</p>
            ) : null}
            {pressants.length ? (
              <ul className="pl-vigilance-liste" role="list">
                {pressants.map((v) => (
                  <li key={v.cle} data-niveau={v.niveau}>
                    {/* Toute la ligne mène au signal (le lien s'étire sur elle) ; « Plus tard » passe au-dessus. */}
                    <Link href={v.href} className="pl-vigilance-lien">
                      <span className="pl-point" aria-hidden="true" />
                      <span><b>{v.boutique?.nom ?? "Plateforme"}</b> : {v.texte}</span>
                    </Link>
                    <PlusTard v={v} retour={ici} />
                    <Icone nom="droite" taille={14} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pl-vigilance-calme">
                <Icone nom="succes" taille={16} /> Rien ne presse : aucune commande en souffrance, aucun refus inquiétant, aucun accès ouvert.
              </p>
            )}
            {infos.length ? (
              <details className="pl-repli pl-infos">
                <summary>
                  <Icone nom="bas" taille={14} />
                  <span><b>{nInfos} information{nInfos > 1 ? "s" : ""}</b> · {infos.map((g) => `${GROUPES_INFO_COURT[g.type] ?? g.type} (${g.signaux.length})`).join(", ")}</span>
                </summary>
                <ul role="list">
                  {infos.map((g) => (
                    <li key={g.type}>
                      <span className="pl-infos-titre">{g.titre || g.signaux[0].texte}</span>
                      <span className="pl-puces">
                        {g.signaux.map((v) => (
                          <Link key={v.cle} href={v.href} className="pl-puce" title={`${v.boutique?.nom ?? "Plateforme"} : ${v.texte}`}>
                            {v.boutique?.nom ?? "Plateforme"}{v.court ? <small>{v.court}</small> : null}
                          </Link>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {reportes.length ? (
              <details className="pl-repli pl-reportes">
                <summary>
                  <Icone nom="bas" taille={14} />
                  <span><b>{reportes.length} mis à plus tard</b> · ils reviendront seuls</span>
                </summary>
                <ul role="list">
                  {reportes.map((v) => (
                    <li key={v.cle} data-niveau={v.niveau}>
                      <span className="pl-point" aria-hidden="true" />
                      <span>
                        <b>{v.boutique?.nom ?? "Plateforme"}</b> : {v.texte}
                        <small className="discret"> · revient {RETOUR.format(new Date(v.jusqua))}{v.par ? `, reporté par ${v.par}` : ""}</small>
                      </span>
                      <form action="/vigilance" method="post">
                        <input type="hidden" name="cle" value={v.cle} />
                        <input type="hidden" name="retour" value={ici} />
                        <button type="submit" name="geste" value="reprendre" className="btn btn-second btn-petit">Reprendre</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>

          <form action="/" method="get" className="pl-filtres" role="search" aria-label="Chercher une boutique">
            {enListe ? <input type="hidden" name="vue" value="liste" /> : null}
            <label className="sr-only" htmlFor="pl-q">Nom, identifiant ou domaine</label>
            <span className="pl-filtres-q">
              <Icone nom="recherche" taille={16} />
              <input id="pl-q" name="q" type="search" className="entree" defaultValue={f.q} placeholder="Nom ou domaine" autoComplete="off" />
            </span>
            <label className="sr-only" htmlFor="pl-statut">Statut</label>
            <select id="pl-statut" name="statut" className="entree" defaultValue={f.statut} data-envoi-auto>
              {STATUTS_FILTRE.map((x) => <option key={x.cle} value={x.cle}>{x.titre}{x.cle === "fermee" && fermees ? ` (${fermees})` : ""}</option>)}
            </select>
            <label className="sr-only" htmlFor="pl-formule">Formule</label>
            <select id="pl-formule" name="formule" className="entree" defaultValue={f.formule} data-envoi-auto>
              <option value="">Toute formule</option>
              {formules.formules.map((x) => <option key={x.code} value={x.code}>{x.nom}</option>)}
              <option value="sur-mesure">{SANS_FORMULE}</option>
            </select>
            <label className="sr-only" htmlFor="pl-type">Clientes ou démonstrations</label>
            <select id="pl-type" name="type" className="entree" defaultValue={f.type} data-envoi-auto>
              <option value="">Clientes et démos</option>
              <option value="clientes">Clientes</option>
              <option value="demos">Démos</option>
            </select>
            <label className="sr-only" htmlFor="pl-tri">Trier</label>
            <select id="pl-tri" name="tri" className="entree" defaultValue={f.tri} data-envoi-auto>
              {TRIS.map((x) => <option key={x.cle} value={x.cle}>{x.cle ? `Tri : ${x.titre.toLowerCase()}` : x.titre}</option>)}
            </select>
            <button type="submit" className="btn btn-second">Filtrer</button>
          </form>
          <div className="pl-filtres-pied">
            <span className="pl-filtres-compte">
              {filtree ? <>{visibles.length} sur {boutiques.length} · <Link href={enListe ? "/?vue=liste" : "/"} className="btn-lien">Tout voir</Link></>
                : <>{visibles.length} boutique{visibles.length > 1 ? "s" : ""}{fermees ? <span className="discret"> · {fermees} fermée{fermees > 1 ? "s" : ""} à part</span> : null}</>}
            </span>
            <a href={`/export/boutiques${parametres(f)}`} className="btn-lien pl-exporter" download><Icone nom="telecharger" taille={14} /> Exporter la liste (CSV)</a>
          </div>

          {visibles.length === 0 ? (
            <p className="message">Aucune boutique pour ce filtre. <Link href={enListe ? "/?vue=liste" : "/"}>Tout voir</Link></p>
          ) : enListe ? (
            <div className="carte carte-plate defile">
              <table className="tableau">
                <thead>
                  <tr><th>Boutique</th><th>Domaine</th><th>Statut</th><th>Formule</th><th>Mise en place</th><th className="text-end">À confirmer</th><th>7 jours</th><th className="text-end">Produits</th><th aria-label="Ouvrir" /></tr>
                </thead>
                <tbody>
                  {[...clientesVisibles, ...demosVisibles].map((b) => (
                    <tr key={b.id} className="ligne-lien">
                      <td>
                        <span className="cellule-titre">
                          <span className="initiale" style={{ background: couleursDe(b).accent, color: "#fff" }} aria-hidden="true">{b.nom.trim().charAt(0).toUpperCase()}</span>
                          <span>
                            <Link href={`/boutiques/${b.slug}`} className="ligne-cible">{b.nom}</Link>
                            <small>{b.slug}{b.demonstration ? " · démonstration" : ""}</small>
                          </span>
                        </span>
                      </td>
                      <td className="discret">{b.hote ?? "—"}</td>
                      <td><span className={`statut statut-${b.statut}`}>{LIBELLES_STATUT[b.statut] ?? b.statut}</span></td>
                      <td className={formuleDe.get(b.id) ? "whitespace-nowrap" : "discret whitespace-nowrap"}>{formuleDe.get(b.id) ?? SANS_FORMULE}</td>
                      <td>
                        <span className="mp-mini" title={`${b.mise_en_place.faites} étapes faites sur ${b.mise_en_place.total}`}>
                          <span className="mp-barre" aria-hidden="true">
                            <span style={{ inlineSize: `${(b.mise_en_place.faites / Math.max(1, b.mise_en_place.total)) * 100}%` }} />
                          </span>
                          <span className="tabular-nums">{b.mise_en_place.faites}/{b.mise_en_place.total}</span>
                        </span>
                      </td>
                      <td className="tabular-nums text-end">
                        {b.commandes.a_confirmer ? (
                          <span title={b.commandes.attente_depuis ? `La plus ancienne attend depuis ${depuis(b.commandes.attente_depuis, maintenant)}` : undefined}>
                            {b.commandes.a_confirmer}
                          </span>
                        ) : <span className="discret">—</span>}
                      </td>
                      <td><span className="pl-semaine-cellule" style={{ "--pl-accent": couleursDe(b).accent } as React.CSSProperties}><Semaine jours={b.jours} /> <span className="tabular-nums">{b.commandes.semaine}</span></span></td>
                      <td className="tabular-nums text-end">{b.produits}</td>
                      <td className="text-end discret"><Icone nom="droite" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : clientesVisibles.length && demosVisibles.length ? (
            <>
              <h2 className="pl-groupe">Clientes <span className="pl-compte tabular-nums">{clientesVisibles.length}</span></h2>
              {tuiles(clientesVisibles)}
              <h2 className="pl-groupe">Démonstrations <span className="pl-compte tabular-nums">{demosVisibles.length}</span></h2>
              <p className="aide pl-groupe-aide">Montrées aux prospects : leurs commandes ne comptent ni dans les chiffres ni dans « À surveiller ».</p>
              {tuiles(demosVisibles)}
            </>
          ) : (
            tuiles(visibles)
          )}
        </>
      )}

      {codes ? (
        <section className="carte mt-6" aria-labelledby="codes-apercu">
          <div className="carte-tete">
            <h2 id="codes-apercu" className="carte-titre-icone"><Icone nom="cle" /> Codes de connexion de l&apos;aperçu</h2>
            <Link href="/" className="btn-lien aide">Actualiser</Link>
          </div>
          <p className="aide">
            Sur l&apos;aperçu, aucun SMS ni e-mail ne part : le code demandé sur une vitrine s&apos;affiche ici, une heure,
            avec l&apos;e-mail tel qu&apos;il serait arrivé.
          </p>
          {codes.length === 0 ? (
            <p className="aide mt-3">Aucun code demandé dans la dernière heure.</p>
          ) : (
            <div className="defile mt-3">
              <table className="tableau">
                <thead><tr><th>À</th><th>Par</th><th>Pour</th><th className="text-end">Code</th><th aria-label="E-mail" /></tr></thead>
                <tbody>
                  {codes.map((c, i) => (
                    <tr key={`${c.le}-${i}`}>
                      <td className="tabular-nums discret">{HEURE.format(new Date(c.le))}</td>
                      <td>{c.canal === "sms" ? "SMS" : "E-mail"}</td>
                      <td>{c.destinataire}</td>
                      <td className="text-end"><b className="tabular-nums codes-apercu-code">{c.code || "—"}</b></td>
                      <td className="text-end">
                        {c.courriel ? <Link href={`/courriels/recu/${c.id}`} className="btn-lien aide">Voir l&apos;e-mail</Link> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
