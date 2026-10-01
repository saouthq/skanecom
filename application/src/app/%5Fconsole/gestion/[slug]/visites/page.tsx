import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Compteur } from "@/components/console/Compteur";
import { Icone } from "@/components/console/Icone";
import { LienCampagne } from "@/components/console/LienCampagne";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { cadreDeGestion } from "@/lib/gestion/pages";
import { adresseVitrine } from "@/lib/console/libelles";
import { DIRECTION, delta, pourcent } from "@/lib/gestion/tableau";
import { ETAPES, nomPage, nomSource, plusGrandePerte, type Parcours, type Visites } from "@/lib/gestion/visites";

export const metadata: Metadata = { title: "Visites" };

/* ============================================================================
   LES VISITES DE LA VITRINE (réglage vitrine.statistiques) — « combien de
   gens passent, d'où ils viennent, et combien commandent ». Sur 7, 30 ou
   90 jours, comparés à la période d'avant : les visiteurs, les pages vues,
   les commandes et la conversion ; le jour par jour ; jusqu'où vont les
   visiteurs (une fiche, le panier, la commande) ; les sources, les
   appareils ; les campagnes et le lien qui les porte ; les produits et les
   pages les plus vus.

   Sans cookie ni donnée personnelle (…_visites_vitrine.sql) : un visiteur
   n'est reconnu que le temps d'une journée. Pour la direction ; la base
   revérifie le rôle.
   ========================================================================== */

const PERIODES = [7, 30, 90] as const;
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const JOUR_LONG = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const NOMBRE = new Intl.NumberFormat("fr-FR");
const CONVERSION = new Intl.NumberFormat("fr-FR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const APPAREILS = [
  { cle: "telephone", nom: "Téléphone" },
  { cle: "ordinateur", nom: "Ordinateur" },
  { cle: "tablette", nom: "Tablette" },
] as const;

function Evolution({ maintenant, avant, points = false }: { maintenant: number | null | undefined; avant: number | null | undefined; points?: boolean }) {
  const d = delta(maintenant, avant, points);
  if (!d) return null;
  return (
    <span className={`tb-evolution ${d.sens === 0 ? "tb-neutre" : d.sens > 0 ? "tb-bon" : "tb-mauvais"}`}>
      {d.sens > 0 ? "▲" : d.sens < 0 ? "▼" : "="} {d.texte} <span className="discret">vs période précédente</span>
    </span>
  );
}

export default async function PageVisites({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ jours?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  if (!DIRECTION.includes(boutique.role)) redirect(`/gestion/${slug}`);
  const jours = PERIODES.find((p) => String(p) === recherche.jours) ?? 30;
  const sb = await clientSession();
  const [{ data, error }, { data: dp, error: ep }, cadre, hoteConsole] = await Promise.all([
    sb.rpc("gestion_visites", { p_boutique_id: boutique.boutique_id, p_jours: jours }),
    sb.rpc("gestion_visites_parcours", { p_boutique_id: boutique.boutique_id, p_jours: jours }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
  ]);
  if (error || ep) throw new Error(`Visites illisibles : ${(error ?? ep)?.message}`);
  const v = data as Visites;
  const parcours = dp as Parcours;
  const hote = cadre?.boutique.hote_principal ?? null;
  const vitrine = hote ? adresseVitrine(hote, hoteConsole) : null;
  const baseEntonnoir = Math.max(1, parcours.entonnoir.visiteurs);
  const perte = plusGrandePerte(parcours.entonnoir);
  const c = v.courante;
  const p = v.precedente;
  if (!v.actif && c.visiteurs === 0 && p.visiteurs === 0) notFound();
  const max = Math.max(1, ...v.par_jour.map((j) => j.visiteurs));
  // Les sources, par nom (google.com et google.tn : Google), les plus nombreuses d'abord.
  const sources = [...v.sources.reduce((m, s) => m.set(nomSource(s.source), (m.get(nomSource(s.source)) ?? 0) + s.visiteurs), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  const totalSources = sources.reduce((n, [, x]) => n + x, 0) || 1;
  const totalAppareils = (v.appareils.telephone + v.appareils.tablette + v.appareils.ordinateur) || 1;
  const maxProduit = Math.max(1, ...v.produits.map((x) => x.vues));

  return (
    <>
      <EnTetePage
        titre="Visites"
        description={`Du ${JOUR.format(new Date(v.du))} au ${JOUR.format(new Date(v.au))} : qui passe sur la vitrine, d'où, sur quel appareil, et combien commandent.`}
        actions={
          <nav className="segments tb-periodes" aria-label="Période">
            {PERIODES.map((n) => (
              <Link key={n} href={`/gestion/${slug}/visites?jours=${n}`} aria-current={n === jours ? "page" : undefined}>
                {n} jours
              </Link>
            ))}
          </nav>
        }
      />

      {!v.actif ? (
        <p className="message">
          La mesure d&apos;audience est coupée : plus rien n&apos;est compté. Les chiffres d&apos;avant restent ici.{" "}
          <Link href={`/gestion/${slug}/reglages#t-vitrine`}>La rallumer</Link>
        </p>
      ) : null}

      {c.visiteurs === 0 ? (
        <div className="vide bo-vide">
          <span className="vide-icone"><Icone nom="oeil" taille={20} /></span>
          <strong>Pas encore de visite comptée sur la période</strong>
          <p>Les chiffres s&apos;affichent dès la première page vue de la vitrine. Essayez une période plus longue.</p>
        </div>
      ) : (
        <div className="pile">
          {/* ---------------- Les quatre chiffres ---------------- */}
          <section className="tb-chiffres" aria-label="Les chiffres de la période">
            <article className="carte tb-chiffre tb-chiffre-fort">
              <p className="tb-libelle">Visiteurs</p>
              <p className="tb-valeur"><Compteur valeur={c.visiteurs} /></p>
              <p className="tb-detail">un visiteur compte une fois par jour</p>
              <Evolution maintenant={c.visiteurs} avant={p.visiteurs} />
            </article>
            <article className="carte tb-chiffre">
              <p className="tb-libelle">Pages vues</p>
              <p className="tb-valeur"><Compteur valeur={c.vues} /></p>
              <p className="tb-detail">{c.pages_par_visite != null ? `${String(c.pages_par_visite).replace(".", ",")} page${c.pages_par_visite >= 2 ? "s" : ""} par visite` : "—"}</p>
              <Evolution maintenant={c.vues} avant={p.vues} />
            </article>
            <article className="carte tb-chiffre">
              <p className="tb-libelle">Commandes</p>
              <p className="tb-valeur"><Compteur valeur={c.commandes} /></p>
              <p className="tb-detail"><Link href={`/gestion/${slug}/tableau?jours=${jours}`}>passées sur la vitrine</Link></p>
              <Evolution maintenant={c.commandes} avant={p.commandes} />
            </article>
            <article className="carte tb-chiffre">
              <p className="tb-libelle">Conversion</p>
              <p className="tb-valeur">{c.conversion != null ? CONVERSION.format(c.conversion) : pourcent(null)}</p>
              <p className="tb-detail">des visiteurs commandent</p>
              <Evolution maintenant={c.conversion} avant={p.conversion} points />
            </article>
          </section>

          {/* ---------------- Jour par jour ---------------- */}
          <section className="carte" aria-labelledby="vi-jours">
            <div className="carte-tete">
              <div>
                <h2 id="vi-jours" className="carte-titre-icone"><Icone nom="graphique" /> Jour par jour</h2>
                <p>Les visiteurs de chaque jour ; un point, les jours où l&apos;on a commandé.</p>
              </div>
            </div>
            <ol className="tb-barres vi-barres" data-jours={jours} aria-label="Visiteurs par jour">
              {v.par_jour.map((j, i) => (
                <li key={j.jour} style={{ "--i": i } as React.CSSProperties}
                  title={`${JOUR_LONG.format(new Date(j.jour))} : ${j.visiteurs} visiteur${j.visiteurs > 1 ? "s" : ""}, ${j.vues} page${j.vues > 1 ? "s" : ""} vue${j.vues > 1 ? "s" : ""}${j.commandes ? `, ${j.commandes} commande${j.commandes > 1 ? "s" : ""}` : ""}`}>
                  <span className="tb-barre vi-barre" style={{ blockSize: `${(j.visiteurs / max) * 100}%` }}>
                    {j.commandes ? <span className="vi-commande" aria-hidden="true" /> : null}
                  </span>
                  <span className="sr-only">
                    {JOUR_LONG.format(new Date(j.jour))} : {j.visiteurs} visiteurs, {j.vues} pages vues{j.commandes ? `, ${j.commandes} commandes` : ""}
                  </span>
                </li>
              ))}
            </ol>
            <p className="tb-axe" aria-hidden="true">
              <span>{JOUR.format(new Date(v.du))}</span>
              <span>{JOUR.format(new Date(v.au))}</span>
            </p>
          </section>

          {/* ---------------- Le chemin vers la commande ---------------- */}
          <section className="carte" aria-labelledby="vi-entonnoir">
            <div className="carte-tete">
              <div>
                <h2 id="vi-entonnoir" className="carte-titre-icone"><Icone nom="panier" /> Le chemin vers la commande</h2>
                <p>Jusqu&apos;où vont les visiteurs de la période : où l&apos;on perd le plus de monde, c&apos;est là qu&apos;il faut regarder.</p>
              </div>
            </div>
            <ol className="vi-entonnoir" role="list">
              {ETAPES.map((e, i) => {
                const n = parcours.entonnoir[e.cle];
                const avant = i > 0 ? parcours.entonnoir[ETAPES[i - 1].cle] : null;
                return (
                  <li key={e.cle} style={{ "--part": `${(n / baseEntonnoir) * 100}%` } as React.CSSProperties}>
                    <span className="vi-etape-nom">{e.nom}</span>
                    <span className="vi-etape-barre" aria-hidden="true"><span /></span>
                    <span className="vi-etape-n">{NOMBRE.format(n)}</span>
                    <span className="vi-etape-part">
                      {i === 0 ? "" : avant ? `${pourcent(n / avant)} de l'étape d'avant` : "—"}
                    </span>
                  </li>
                );
              })}
            </ol>
            {perte ? (
              <p className="aide vi-perte">
                <Icone nom="alerte" taille={14} />
                <span>C&apos;est entre « {perte.de} » et « {perte.a} » qu&apos;on perd le plus de monde : {pourcent(perte.part)} s&apos;arrêtent là.</span>
              </p>
            ) : null}
          </section>

          <div className="grille-2 tb-grille">
            {/* ---------------- Les sources ---------------- */}
            <section className="carte" aria-labelledby="vi-sources">
              <div className="carte-tete">
                <div>
                  <h2 id="vi-sources" className="carte-titre-icone"><Icone nom="lien" /> D&apos;où ils viennent</h2>
                  <p>Le site d&apos;où arrive chaque visiteur. « Direct » : l&apos;adresse tapée, ou un lien envoyé par WhatsApp ou SMS.</p>
                </div>
              </div>
              <ul className="tb-origines vi-sources" role="list">
                {sources.map(([nom, n]) => (
                  <li key={nom}>
                    <span className="tb-origine-nom">{nom}</span>
                    <span className="tb-jauge vi-jauge" aria-hidden="true"><span style={{ inlineSize: `${(n / totalSources) * 100}%` }} /></span>
                    <span className="tb-origine-n">{NOMBRE.format(n)}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* ---------------- Les appareils ---------------- */}
            <section className="carte" aria-labelledby="vi-appareils">
              <div className="carte-tete">
                <div>
                  <h2 id="vi-appareils" className="carte-titre-icone"><Icone nom="telephone" /> Sur quel appareil</h2>
                  <p>Pour savoir où soigner d&apos;abord la vitrine.</p>
                </div>
              </div>
              <ul className="tb-origines vi-appareils" role="list">
                {APPAREILS.map((a) => (
                  <li key={a.cle}>
                    <span className="tb-origine-nom">{a.nom}</span>
                    <span className="tb-jauge vi-jauge" aria-hidden="true"><span style={{ inlineSize: `${(v.appareils[a.cle] / totalAppareils) * 100}%` }} /></span>
                    <span className="tb-origine-n vi-part">{pourcent(v.appareils[a.cle] / totalAppareils)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* ---------------- Les campagnes ---------------- */}
          <section className="carte" aria-labelledby="vi-campagnes">
            <div className="carte-tete">
              <div>
                <h2 id="vi-campagnes" className="carte-titre-icone"><Icone nom="etiquette" /> Les campagnes</h2>
                <p>Les visites venues d&apos;un lien de campagne, et ce qu&apos;elles ont vendu. Composez ce lien ci-dessous, pour chaque publication.</p>
              </div>
            </div>
            {parcours.campagnes.length === 0 ? (
              <p className="discret tb-rien">Aucune visite venue d&apos;un lien de campagne sur la période.</p>
            ) : (
              <div className="vi-campagnes-cadre">
                <table className="vi-campagnes">
                  <thead>
                    <tr><th scope="col">Campagne</th><th scope="col">Visiteurs</th><th scope="col">Panier</th><th scope="col">Commandes</th><th scope="col">Conversion</th></tr>
                  </thead>
                  <tbody>
                    {parcours.campagnes.map((x) => (
                      <tr key={x.campagne}>
                        <th scope="row">
                          <span className="vi-campagne-nom">{x.campagne}</span>
                          <span className="discret">{nomSource(x.source)} · {x.premier === x.dernier ? JOUR.format(new Date(x.premier)) : `${JOUR.format(new Date(x.premier))} – ${JOUR.format(new Date(x.dernier))}`}</span>
                        </th>
                        <td data-libelle="Visiteurs">{NOMBRE.format(x.visiteurs)}</td>
                        <td data-libelle="Panier">{NOMBRE.format(x.panier)}</td>
                        <td data-libelle="Commandes">{NOMBRE.format(x.commandes)}</td>
                        <td data-libelle="Conversion">{CONVERSION.format(x.commandes / Math.max(1, x.visiteurs))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {vitrine ? (
              <details className="vi-composer" open={parcours.campagnes.length === 0 || undefined}>
                <summary className="btn btn-second btn-petit"><Icone nom="lien" taille={14} /> Composer un lien de campagne</summary>
                <LienCampagne vitrine={vitrine} />
              </details>
            ) : null}
          </section>

          <div className="grille-2 tb-grille">
            {/* ---------------- Les produits les plus vus ---------------- */}
            <section className="carte" aria-labelledby="vi-produits">
              <div className="carte-tete">
                <div>
                  <h2 id="vi-produits" className="carte-titre-icone"><Icone nom="colis" /> Les fiches les plus vues</h2>
                  <p>Ce qui attire ; à comparer avec <Link href={`/gestion/${slug}/tableau?jours=${jours}`}>ce qui se vend</Link>.</p>
                </div>
              </div>
              {v.produits.length === 0 ? (
                <p className="discret tb-rien">Aucune fiche vue sur la période.</p>
              ) : (
                <ol className="tb-produits vi-produits" role="list">
                  {v.produits.map((x, i) => (
                    <li key={x.slug}>
                      <span className="tb-rang">{i + 1}</span>
                      <span className="tb-produit-nom">{x.nom}</span>
                      <span className="vi-produit-jauge" aria-hidden="true"><span style={{ inlineSize: `${(x.vues / maxProduit) * 100}%` }} /></span>
                      <span className="tb-produit-q">{NOMBRE.format(x.vues)} vue{x.vues > 1 ? "s" : ""}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ---------------- Les pages ---------------- */}
            <section className="carte" aria-labelledby="vi-pages">
              <div className="carte-tete">
                <div>
                  <h2 id="vi-pages" className="carte-titre-icone"><Icone nom="apercu" /> Les pages</h2>
                  <p>Les plus vues ; et la page par laquelle on entre le plus souvent.</p>
                </div>
              </div>
              <ol className="tb-produits vi-pages" role="list">
                {v.pages.map((x, i) => (
                  <li key={x.chemin}>
                    <span className="tb-rang">{i + 1}</span>
                    <span className="tb-produit-nom" title={x.chemin}>{nomPage(x.chemin, x.nom)}</span>
                    <span className="tb-produit-q">{NOMBRE.format(x.vues)}</span>
                  </li>
                ))}
              </ol>
              {v.entrees[0] ? (
                <p className="aide vi-entree">
                  <Icone nom="droite" taille={14} /> On entre surtout par <b>{nomPage(v.entrees[0].chemin, v.pages.find((x) => x.chemin === v.entrees[0].chemin)?.nom ?? null)}</b> ({NOMBRE.format(v.entrees[0].visiteurs)} visiteurs).
                </p>
              ) : null}
            </section>
          </div>

          <p className="aide vi-methode">
            <Icone nom="bouclier" taille={14} />{" "}
            <span>
              Compté sans cookie ni donnée personnelle : un visiteur n&apos;est reconnu que le temps d&apos;une journée, par une empreinte qui
              devient illisible le surlendemain. Les robots ne comptent pas, ni les navigateurs qui demandent à ne pas être suivis.
              La conversion rapporte les commandes passées sur la vitrine aux visiteurs.
            </span>
          </p>
        </div>
      )}
    </>
  );
}
