import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { LIBELLES_STATUT } from "@/lib/console/libelles";
import { couleursDe, depuis, vigilances, type LignePilotage } from "@/lib/console/pilotage";
import { configSkanFact } from "@/lib/console/skanfact";
import { formateMontant } from "@/lib/prix";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { Semaine, TuileBoutique } from "@/components/console/TuileBoutique";

export const metadata: Metadata = { title: "Boutiques" };

type CodeApercu = { id: number; le: string; canal: "sms" | "email"; destinataire: string; code: string; sujet: string | null; courriel: boolean };

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });

/* LE POSTE DE PILOTAGE — toutes les boutiques d'un coup d'œil (lib/console/
   pilotage.ts) : chacune à sa couleur, avec sa photo et son monogramme, sa
   semaine, ce qui attend, sa mise en place ; en tête, ce qui demande un
   regard. En liste (?vue=liste), le même état en tableau. Sur l'aperçu en
   ligne seulement (supabase/apercu/codes-demo.sql), les codes de connexion
   que Supabase aurait envoyés par SMS ou par e-mail. */
export default async function Tableau({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  await exigeAdmin();
  const { vue } = await searchParams;
  const enListe = vue === "liste";
  const service = clientService();
  const [{ data, error }, { data: codesApercu }] = await Promise.all([
    service.rpc("console_pilotage"),
    // Absente hors de l'aperçu : l'erreur la cache, rien d'autre.
    service.rpc("console_codes_apercu"),
  ]);
  const codes = Array.isArray(codesApercu) ? (codesApercu as CodeApercu[]) : null;
  if (error) throw new Error(`Boutiques illisibles : ${error.message}`);
  const boutiques = (data ?? []) as LignePilotage[];
  const hoteConsole = (await headers()).get("host");
  const maintenant = new Date().getTime();
  const aSurveiller = vigilances(boutiques, maintenant, { skanfact: configSkanFact() !== null });

  // La synthèse ne compte que les clientes : les boutiques de démonstration vendent pour de faux.
  const clientes = boutiques.filter((b) => !b.demonstration);
  const demos = boutiques.filter((b) => b.demonstration);
  const ouvertes = clientes.filter((b) => b.statut === "active").length;
  const enPreparation = clientes.filter((b) => b.statut === "en_preparation").length;
  const publies = clientes.reduce((n, b) => n + b.publies, 0);
  const semaine = clientes.reduce((n, b) => n + b.commandes.semaine, 0);
  const encaisse = clientes.reduce((n, b) => n + b.commandes.encaisse_semaine, 0);
  const tuiles = (liste: LignePilotage[]) => (
    <div className="pl-grille">
      {liste.map((b) => <TuileBoutique key={b.id} b={b} maintenant={maintenant} hoteConsole={hoteConsole} />)}
    </div>
  );

  return (
    <>
      <EnTetePage
        titre="Boutiques"
        description={
          <span className="pl-synthese ligne-points">
            <span><b className="tabular-nums">{clientes.length}</b> cliente{clientes.length > 1 ? "s" : ""}, <b className="tabular-nums">{ouvertes}</b> ouverte{ouvertes > 1 ? "s" : ""}{enPreparation ? <>, <b className="tabular-nums">{enPreparation}</b> en préparation</> : null}{demos.length ? <> · <b className="tabular-nums">{demos.length}</b> de démonstration</> : null}</span>
            <span><b className="tabular-nums">{publies}</b> produit{publies > 1 ? "s" : ""} en vitrine</span>
            <span><b className="tabular-nums">{semaine}</b> commande{semaine > 1 ? "s" : ""} en 7 jours</span>
            <span><b className="tabular-nums">{formateMontant(encaisse)}</b> TND encaissés{demos.length ? " (clientes seules)" : ""}</span>
          </span>
        }
        actions={
          <>
            <nav className="segments pl-vues" aria-label="Affichage des boutiques">
              <Link href="/" aria-current={enListe ? undefined : "page"}><Icone nom="apercu" taille={14} /> Tuiles</Link>
              <Link href="/?vue=liste" aria-current={enListe ? "page" : undefined}><Icone nom="liste" taille={14} /> Liste</Link>
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
          <section className="pl-vigilance" aria-labelledby="t-vigilance">
            <h2 id="t-vigilance" className="pl-vigilance-titre">
              À surveiller{aSurveiller.length ? <span className="pl-compte tabular-nums">{aSurveiller.length}</span> : null}
            </h2>
            {aSurveiller.length ? (
              <ul className="pl-vigilance-liste" role="list">
                {aSurveiller.map((v) => (
                  <li key={v.cle} data-niveau={v.niveau}>
                    <Link href={v.href}>
                      <span className="pl-point" aria-hidden="true" />
                      <span><b>{v.boutique.nom}</b> : {v.texte}</span>
                      <Icone nom="droite" taille={14} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pl-vigilance-calme">Rien ne presse : aucune commande n&apos;attend depuis plus de deux heures, aucune boutique en préparation.</p>
            )}
          </section>

          {enListe ? (
            <div className="carte carte-plate defile">
              <table className="tableau">
                <thead>
                  <tr><th>Boutique</th><th>Domaine</th><th>Statut</th><th>Mise en place</th><th className="text-end">À confirmer</th><th>7 jours</th><th className="text-end">Produits</th><th aria-label="Ouvrir" /></tr>
                </thead>
                <tbody>
                  {boutiques.map((b) => (
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
          ) : clientes.length && demos.length ? (
            <>
              <h2 className="pl-groupe">Clientes <span className="pl-compte tabular-nums">{clientes.length}</span></h2>
              {tuiles(clientes)}
              <h2 className="pl-groupe">Démonstrations <span className="pl-compte tabular-nums">{demos.length}</span></h2>
              <p className="aide pl-groupe-aide">Montrées aux prospects : leurs commandes ne comptent pas dans la synthèse ni dans « À surveiller ».</p>
              {tuiles(demos)}
            </>
          ) : (
            tuiles(boutiques)
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
