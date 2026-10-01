import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Compteur } from "@/components/console/Compteur";
import { Icone } from "@/components/console/Icone";
import { BoutonCopier } from "@/components/console/BoutonCopier";
import { RaccourciRecherche } from "@/components/console/Raccourcis";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { DIRECTION } from "@/lib/gestion/tableau";
import { PEUT_RETIRER, type EcranLettre } from "@/lib/gestion/lettre";
import { nomPage } from "@/lib/gestion/visites";

export const metadata: Metadata = { title: "Lettre" };

/* ============================================================================
   LA LETTRE D'INFORMATION (réglage vitrine.lettre) — ceux qui ont coché
   l'accord au pied de la vitrine puis confirmé par le lien reçu : combien,
   depuis quand, semaine par semaine ; la liste, une recherche ; les
   adresses à copier, l'export (avec la preuve de l'accord) ; retirer une
   adresse à la demande de la personne (elle est effacée). Pour la
   direction ; la base revérifie le rôle.
   ========================================================================== */

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Tunis" });
const SEMAINE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function PageLettre({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; ok?: string; erreur?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  if (!DIRECTION.includes(boutique.role)) redirect(`/gestion/${slug}`);
  const q = (recherche.q ?? "").trim().slice(0, 80);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_lettre", { p_boutique_id: boutique.boutique_id, p_recherche: q || null });
  if (error) throw new Error(`Lettre illisible : ${error.message}`);
  const l = data as EcranLettre;
  const c = l.compteurs;
  if (!l.actif && c.inscrits === 0) notFound();
  const peutRetirer = PEUT_RETIRER.includes(boutique.role);
  const base = `/gestion/${slug}/lettre`;
  const action = `${base}/action`;
  const max = Math.max(1, ...l.semaines.map((s) => s.inscrits));

  return (
    <>
      <EnTetePage
        titre="Lettre"
        description="Ceux qui ont accepté de recevoir la lettre de la boutique, au pied de la vitrine, et l'ont confirmé par le lien reçu par e-mail."
        actions={
          <form role="search" method="get" action={base} className="bo-recherche">
            <label htmlFor="q" className="sr-only">Chercher une adresse</label>
            <span className="bo-recherche-champ">
              <Icone nom="recherche" />
              <input id="q" name="q" type="search" className="entree" defaultValue={q} placeholder="Une adresse e-mail" autoComplete="off" />
              <kbd className="bo-recherche-touche" aria-hidden="true">/</kbd>
            </span>
            <RaccourciRecherche cible="q" />
            <button type="submit" className="btn btn-second">Chercher</button>
          </form>
        }
      />

      {recherche.ok ? <p className="message message-succes mb-4" role="status">{recherche.ok}</p> : null}
      {recherche.erreur ? <p className="message message-erreur mb-4" role="alert">{recherche.erreur}</p> : null}
      {!l.actif ? (
        <p className="message mb-4">
          La lettre est coupée : le pied de page ne propose plus l&apos;inscription. Les inscrits restent ici.{" "}
          <Link href={`/gestion/${slug}/reglages#t-vitrine`}>La rallumer</Link>
        </p>
      ) : null}

      <div className="pile">
        {/* ---------------- Les quatre chiffres ---------------- */}
        <section className="tb-chiffres lt-chiffres" aria-label="Les inscrits">
          <article className="carte tb-chiffre tb-chiffre-fort">
            <p className="tb-libelle">Inscrits</p>
            <p className="tb-valeur"><Compteur valeur={c.inscrits} /></p>
            <p className="tb-detail">accord coché, puis confirmé par e-mail</p>
          </article>
          <article className="carte tb-chiffre">
            <p className="tb-libelle">Nouveaux</p>
            <p className="tb-valeur"><Compteur valeur={c.nouveaux_30j} /></p>
            <p className="tb-detail">ces 30 derniers jours</p>
          </article>
          <article className="carte tb-chiffre">
            <p className="tb-libelle">À confirmer</p>
            <p className="tb-valeur"><Compteur valeur={c.a_confirmer} /></p>
            <p className="tb-detail">l&apos;e-mail est parti ; effacés après 7 jours sans clic</p>
          </article>
          <article className="carte tb-chiffre">
            <p className="tb-libelle">Désinscrits</p>
            <p className="tb-valeur"><Compteur valeur={c.desinscrits_30j} /></p>
            <p className="tb-detail">ces 30 derniers jours, adresses effacées</p>
          </article>
        </section>

        {/* ---------------- Semaine par semaine ---------------- */}
        <section className="carte" aria-labelledby="lt-semaines">
          <div className="carte-tete">
            <div>
              <h2 id="lt-semaines" className="carte-titre-icone"><Icone nom="graphique" /> Semaine par semaine</h2>
              <p>Les inscriptions confirmées des douze dernières semaines.</p>
            </div>
          </div>
          <ol className="tb-barres lt-barres" aria-label="Inscriptions par semaine">
            {l.semaines.map((s, i) => (
              <li key={s.semaine} style={{ "--i": i } as React.CSSProperties}
                title={`Semaine du ${SEMAINE.format(new Date(s.semaine))} : ${s.inscrits} inscription${s.inscrits > 1 ? "s" : ""}${s.desinscrits ? `, ${s.desinscrits} départ${s.desinscrits > 1 ? "s" : ""}` : ""}`}>
                <span className="tb-barre lt-barre" style={{ blockSize: `${(s.inscrits / max) * 100}%` }} />
                <span className="sr-only">
                  Semaine du {SEMAINE.format(new Date(s.semaine))} : {s.inscrits} inscriptions{s.desinscrits ? `, ${s.desinscrits} départs` : ""}
                </span>
              </li>
            ))}
          </ol>
          <p className="tb-axe" aria-hidden="true">
            <span>{l.semaines[0] ? SEMAINE.format(new Date(l.semaines[0].semaine)) : ""}</span>
            <span>Cette semaine</span>
          </p>
        </section>

        {/* ---------------- Les inscrits ---------------- */}
        <section className="carte" aria-labelledby="lt-liste">
          <div className="carte-tete">
            <div>
              <h2 id="lt-liste" className="carte-titre-icone"><Icone nom="courriel" /> Les inscrits</h2>
              <p>
                {q
                  ? `${l.trouves} adresse${l.trouves > 1 ? "s" : ""} pour « ${q} ».`
                  : "Les plus récents d'abord, avec la page où ils se sont inscrits."}
                {l.trouves > l.abonnes.length ? ` Les ${l.abonnes.length} plus récentes ici ; toutes dans l'export.` : ""}
              </p>
            </div>
            {l.abonnes.length ? (
              <div className="lt-outils">
                <BoutonCopier texte={l.abonnes.map((a) => a.email).join(", ")} libelle={`Copier ${l.abonnes.length > 1 ? `les ${l.abonnes.length} adresses` : "l'adresse"}`} classe="btn btn-second btn-petit" />
                {peutRetirer ? (
                  <a className="btn btn-second btn-petit" href={`/gestion/${slug}/export/lettre`} download>
                    <Icone nom="fichier" taille={14} /> Exporter (CSV)
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
          {l.abonnes.length === 0 ? (
            <div className="vide bo-vide">
              <span className="vide-icone"><Icone nom={q ? "recherche" : "courriel"} taille={20} /></span>
              <strong>{q ? "Aucun résultat" : "Pas encore d'inscrit"}</strong>
              <p>{q ? `Aucune adresse inscrite ne contient « ${q} ».` : "Les inscriptions confirmées s'affichent ici, les plus récentes d'abord."}</p>
            </div>
          ) : (
            <ul className="lt-liste" role="list">
              {l.abonnes.map((a) => (
                <li key={a.id} className="lt-ligne">
                  <span className="lt-email">{a.email}</span>
                  <span className="lt-quand">inscrit le {JOUR.format(new Date(a.inscrit_le))}</span>
                  <span className="lt-depuis discret" title="La page où l'inscription a été faite">{a.page ? `via ${nomPage(a.page)}` : ""}</span>
                  {peutRetirer ? (
                    <details className="ft-retirer lt-retirer">
                      <summary className="btn btn-fantome btn-petit" aria-label={`Retirer ${a.email}`}>Retirer…</summary>
                      <form action={action} method="post" className="ft-confirmer">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="q" value={q} />
                        <p>Son adresse sera effacée, comme s&apos;il s&apos;était désinscrit.</p>
                        <button type="submit" className="btn btn-danger btn-petit">Oui, retirer</button>
                      </form>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="aide vi-methode">
          <Icone nom="bouclier" taille={14} />{" "}
          <span>
            Chaque inscrit a coché l&apos;accord au pied de la vitrine, puis confirmé d&apos;un clic dans l&apos;e-mail reçu : la phrase
            acceptée et sa date sont dans l&apos;export. Le même lien le désinscrit, à tout moment ; une adresse désinscrite ou retirée est
            effacée.
          </span>
        </p>
      </div>
    </>
  );
}
