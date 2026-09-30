import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { adresseVitrine } from "@/lib/console/libelles";
import { quand } from "@/lib/gestion/libelles";
import { cadreDeGestion, modelesDePages, pagesAutomatiques, PEUT_ECRIRE, type PageGestion } from "@/lib/gestion/pages";
import { resumePage } from "@/lib/pages";

export const metadata: Metadata = { title: "Pages" };

/* ============================================================================
   LES PAGES DE LA BOUTIQUE — ce qu'elle raconte en dehors du catalogue :
   qui elle est, ses réponses aux questions, sa livraison. Les siennes, dans
   l'ordre du pied de page (publiées ou en brouillon) ; les modèles qu'elle
   n'a pas encore écrits, composés de ses réglages ; et les pages qu'elle a
   d'office (conditions de vente, contact…), avec ce qui les nourrit.
   Propriétaire et administrateur écrivent ; la direction lit.
   ========================================================================== */
export default async function Pages({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const [{ data, error }, cadre, hoteConsole] = await Promise.all([
    sb.rpc("gestion_pages", { p_boutique_id: boutique.boutique_id }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
  ]);
  if (error) throw new Error(`Pages illisibles : ${error.message}`);
  const pages = data as PageGestion[];
  const ecrit = PEUT_ECRIRE.includes(boutique.role);
  const base = `/gestion/${slug}/pages`;
  const action = `${base}/action`;
  const hote = cadre?.boutique.hote_principal ?? null;
  const vitrine = hote ? adresseVitrine(hote, hoteConsole) : null;
  const affichee = hote ? hote.replace(/^www\./, "") : null;
  const pris = new Set(pages.map((p) => p.slug));
  const modeles = cadre ? modelesDePages(cadre).filter((m) => !pris.has(m.slug)) : [];
  const automatiques = pagesAutomatiques(cadre, slug);
  const maintenant = new Date();
  const publiees = pages.filter((p) => p.publie).length;

  return (
    <>
      <EnTetePage
        titre="Pages de la boutique"
        description="Ce que la boutique raconte en dehors du catalogue : qui vous êtes, vos réponses aux questions, votre livraison. Publiées, elles ont leur adresse et leur lien au pied de chaque page."
        actions={ecrit ? (
          <Link className="btn btn-primaire" href={`${base}/nouvelle`}><Icone nom="plus" /> Nouvelle page</Link>
        ) : undefined}
      />

      {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
      {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

      <div className="pile">
        {pages.length > 0 ? (
          <section className="carte" aria-labelledby="t-pages">
            <div className="carte-tete">
              <div>
                <h2 id="t-pages" className="carte-titre-icone"><Icone nom="note" /> Vos pages</h2>
                <p>
                  {publiees} publiée{publiees > 1 ? "s" : ""} sur {pages.length}
                  {pages.length > 1 ? " · dans l'ordre du pied de page" : ""}
                </p>
              </div>
            </div>
            <ol className="pg-liste" role="list">
              {pages.map((p, i) => {
                const resume = resumePage(p.corps_fr);
                return (
                  <li key={p.id} id={`page-${p.id}`} className="pg-ligne ligne-lien">
                    <span className="pg-icone" aria-hidden="true"><Icone nom={p.genre === "questions" ? "message" : "note"} taille={16} /></span>
                    <div className="pg-texte">
                      <Link className="pg-titre ligne-cible" href={`${base}/${p.id}`}>{p.titre_fr}</Link>
                      <span className="pg-adresse">/{p.slug}{p.genre === "questions" ? " · questions-réponses" : ""}</span>
                      {resume ? <span className="pg-resume">{resume}</span> : <span className="pg-resume discret">Pas encore de texte.</span>}
                    </div>
                    <div className="pg-etat">
                      <span className={p.publie ? "ui-etat ui-etat-vert ui-etat-point" : "ui-etat ui-etat-point"}>{p.publie ? "Publiée" : "Brouillon"}</span>
                      {p.publie && p.dans_pied ? <span className="aide">Au pied de page</span> : null}
                      <span className="aide" title={p.modifiee_par ?? undefined}>{quand(p.modifiee_le, maintenant)}</span>
                    </div>
                    <div className="pg-gestes">
                      {p.publie && vitrine ? (
                        <a className="btn-icone" href={`${vitrine}/${p.slug}`} target="_blank" rel="noopener" aria-label={`Voir « ${p.titre_fr} » sur la boutique`} title="Voir sur la boutique">
                          <Icone nom="externe" taille={16} />
                        </a>
                      ) : null}
                      {ecrit && pages.length > 1 ? (
                        <>
                          <form action={action} method="post">
                            <input type="hidden" name="geste" value="monter" />
                            <input type="hidden" name="id" value={p.id} />
                            <button className="btn-icone" disabled={i === 0} aria-label={`Monter « ${p.titre_fr} »`} title="Monter"><Icone nom="haut" taille={16} /></button>
                          </form>
                          <form action={action} method="post">
                            <input type="hidden" name="geste" value="descendre" />
                            <input type="hidden" name="id" value={p.id} />
                            <button className="btn-icone" disabled={i === pages.length - 1} aria-label={`Descendre « ${p.titre_fr} »`} title="Descendre"><Icone nom="bas" taille={16} /></button>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : (
          <div className="vide">
            <span className="vide-icone"><Icone nom="note" taille={20} /></span>
            <strong>Aucune page pour l&apos;instant</strong>
            <p>
              {ecrit
                ? "Partez d'un modèle ci-dessous : il est déjà composé de vos réglages (paiement, délais, retours). Relisez, ajustez, publiez."
                : "Le propriétaire ou l'administrateur de la boutique les écrit."}
            </p>
          </div>
        )}

        {ecrit && modeles.length > 0 ? (
          <section className="carte" aria-labelledby="t-modeles">
            <div className="carte-tete">
              <div>
                <h2 id="t-modeles" className="carte-titre-icone"><Icone nom="crayon" /> Pour commencer</h2>
                <p>Des pages que les clients cherchent, déjà écrites d&apos;après vos réglages. Rien ne paraît avant que vous publiiez.</p>
              </div>
            </div>
            <ul className="pg-modeles" role="list">
              {modeles.map((m) => (
                <li key={m.cle}>
                  <Link className="pg-modele" href={`${base}/nouvelle?modele=${m.cle}`}>
                    <span className="pg-modele-titre">{m.titre} <Icone nom="droite" taille={14} /></span>
                    <span className="aide">{m.resume}</span>
                    <span className="pg-adresse">/{m.slug}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link className="pg-modele pg-modele-vierge" href={`${base}/nouvelle`}>
                  <span className="pg-modele-titre">Une page vierge <Icone nom="droite" taille={14} /></span>
                  <span className="aide">Votre histoire, un guide des tailles, l&apos;entretien de vos articles…</span>
                </Link>
              </li>
            </ul>
          </section>
        ) : null}

        <section className="carte" aria-labelledby="t-automatiques">
          <div className="carte-tete">
            <div>
              <h2 id="t-automatiques" className="carte-titre-icone"><Icone nom="reglages" /> Les pages que la boutique a d&apos;office</h2>
              <p>Composées de vos réglages : on ne les écrit pas, on règle ce qui les nourrit. Elles changent avec eux.</p>
            </div>
          </div>
          <ul className="pg-auto" role="list">
            {automatiques.map((x) => (
              <li key={x.chemin} className="pg-auto-ligne">
                <div className="pg-texte">
                  <span className="pg-titre">{x.titre}</span>
                  <span className="pg-adresse">{affichee ? `${affichee}${x.chemin}` : x.chemin}</span>
                  <span className="pg-resume">{x.source}</span>
                </div>
                <div className="pg-gestes">
                  {x.reglages ? <Link className="btn btn-second btn-petit" href={x.reglages}>Réglages</Link> : null}
                  {vitrine ? (
                    <a className="btn-icone" href={`${vitrine}${x.chemin}`} target="_blank" rel="noopener" aria-label={`Voir « ${x.titre} » sur la boutique`} title="Voir sur la boutique">
                      <Icone nom="externe" taille={16} />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
