import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { REGLES, type Emplacement } from "@/lib/console/images-marque";
import { ETAPES_MISE_EN_PLACE, type CleEtape, type MiseEnPlace as DonneesMiseEnPlace } from "@/lib/console/mise-en-place";
import { clientService } from "@/lib/console/service";
import { MODES_SUPPORT, type ModeSupport } from "@/lib/console/support";
import { exigeAdmin } from "@/lib/console/session";
import { LIBELLES_MODULES, LIBELLES_STATUT, LIBELLES_THEME, adresseVitrine, dateJournal } from "@/lib/console/libelles";
import { equipeDe } from "@/lib/console/equipe-serveur";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";
import { formateMontant } from "@/lib/prix";
import { ACTIONS } from "@/lib/console/journal";
import { SANS_FORMULE, type DonneesFormules } from "@/lib/console/formules";
import { initiales, styleAvatar } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { MiseEnPlace } from "@/components/console/MiseEnPlace";
import { ChoixMetier } from "@/components/console/ChoixMetier";
import type { Metier } from "@/lib/console/metiers";
import { titreBoutique } from "@/lib/console/titre-boutique";
import { depuis, vigilances, type LignePilotage, type Sante } from "@/lib/console/pilotage";
import { configSkanFact } from "@/lib/console/skanfact";

/** Ce que rend public.console_tableau pour une boutique, sur la période. */
type Activite = { id: string; recues: number; livrees: number; refusees: number; chiffre: number; precedent: { recues: number; chiffre: number } };

type Fiche = {
  boutique: { id: string; slug: string; nom: string; statut: string; langue_defaut: string; created_at: string; demonstration: boolean };
  domaines: { hote: string; type: string; principal: boolean; statut_certificat: string }[];
  theme: { code: string; version: number; updated_at: string } | null;
  compteurs: { produits: number; publies: number; variantes: number; categories: number };
  journal: { at: string; action: string; cible: string | null; acteur: string | null }[];
};

const CERTIFICAT: Record<string, { texte: string; classe: string }> = {
  actif: { texte: "Actif", classe: "ui-etat ui-etat-point ui-etat-vert" },
  erreur: { texte: "En erreur", classe: "ui-etat ui-etat-point ui-etat-rouge" },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: await titreBoutique(params) };
}

/* La vue d'ensemble d'une boutique : ses domaines, son équipe, sa marque,
   son catalogue et le journal de tout ce que la console y a fait. */
export default async function FicheBoutique({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string; cree?: string; ok?: string; metier?: string; modele?: string; carte?: string }>;
}) {
  const { user, role } = await exigeAdmin();
  // Le support aide sans engager : formule, statut, retrait d'un domaine restent au super-administrateur.
  const superAdmin = role === "super_admin";
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { data, error } = await clientService().rpc("console_boutique", { p_slug: slug });
  if (error) throw new Error(`Boutique illisible : ${error.message}`);
  if (!data) notFound();
  const f = data as Fiche;
  const b = f.boutique;
  const hoteConsole = (await headers()).get("host");
  // Une boutique vide peut recevoir le préréglage d'un métier.
  const vide = f.compteurs.categories === 0 && f.compteurs.produits === 0;
  const [equipe, { data: miseEnPlace }, { data: dm }, { data: df }, { data: dn }, { data: dp }, { data: dsa }, { data: dt }] = await Promise.all([
    equipeDe(b.id),
    clientService().rpc("console_mise_en_place", { p_boutique_id: b.id }),
    vide ? clientService().rpc("console_metiers", { p_acteur: user.id }) : Promise.resolve({ data: null }),
    clientService().rpc("console_formules", { p_acteur: user.id }),
    clientService().rpc("console_notes", { p_acteur: user.id, p_boutique_id: b.id }),
    // L'activité et la santé de la boutique : les mêmes chiffres et les mêmes signaux que l'accueil et le tableau de bord.
    clientService().rpc("console_pilotage"),
    clientService().rpc("console_sante", { p_acteur: user.id }),
    clientService().rpc("console_tableau", { p_acteur: user.id, p_jours: 30 }),
  ]);
  const maintenant = new Date().getTime();
  const ligne = ((dp ?? []) as LignePilotage[]).find((x) => x.id === b.id) ?? null;
  const sante = ((dsa ?? []) as Sante[]).find((x) => x.id === b.id) ?? null;
  const activite = (((dt ?? { boutiques: [] }) as { boutiques: Activite[] }).boutiques).find((x) => x.id === b.id) ?? null;
  const signaux = ligne ? vigilances([ligne], maintenant, { skanfact: configSkanFact() !== null, sante: sante ? [sante] : [] }) : [];
  const clos = activite ? activite.livrees + activite.refusees : 0;
  const notes = (dn ?? []) as { id: number; texte: string; epinglee: boolean; le: string; auteur: string | null; vous: boolean }[];
  const formules = (df ?? { formules: [], droits: [], boutiques: [] }) as DonneesFormules;
  const codeFormule = formules.boutiques.find((x) => x.id === b.id)?.formule ?? null;
  const formule = formules.formules.find((x) => x.code === codeFormule) ?? null;
  const metiers = (dm ?? []) as Metier[];
  const actifs = equipe.filter((m) => m.actif);
  const enAttente = actifs.filter((m) => m.en_attente).length;
  // Le retour d'un geste fait dans une carte s'affiche dans cette carte.
  const retour = (carte: string) => messages.carte !== carte ? null : messages.erreur
    ? <p className="message message-erreur bt-retour" role="alert">{messages.erreur}</p>
    : messages.ok ? <p className="message message-succes bt-retour" role="status">{messages.ok}</p> : null;

  return (
    <div className="pile">
      {messages.cree ? (
        <p className="message message-succes" role="status">
          {messages.modele
            ? `Boutique créée, en préparation, avec l'apparence, les réglages, la livraison et les rayons de ${messages.modele}. Posez son logo et ses images, importez son catalogue, invitez son propriétaire, puis ouvrez-la.`
            : messages.metier
            ? "Boutique créée, en préparation, avec les rayons, les caractéristiques, la palette et l'accueil de son métier. Réglez sa marque, importez son catalogue, invitez son propriétaire, puis ouvrez-la."
            : "Boutique créée, en préparation. Réglez sa marque, importez son catalogue, invitez son propriétaire, puis ouvrez-la."}
        </p>
      ) : null}
      {messages.ok && !messages.carte ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
      {messages.erreur && !messages.carte ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

      {miseEnPlace ? <MiseEnPlace slug={b.slug} boutiqueId={b.id} donnees={miseEnPlace as DonneesMiseEnPlace} /> : null}

      <div className="grille-2">
        <div className="pile">
          <section className="carte" aria-labelledby="t-domaines">
            <div className="carte-tete">
              <div>
                <h2 id="t-domaines" className="carte-titre-icone"><Icone nom="domaine" /> Domaines</h2>
                <p>Les adresses qui mènent à la vitrine. Le principal sert aux liens et au référencement.</p>
              </div>
            </div>
            {retour("domaines")}
            <div className="defile">
              <table className="tableau">
                <thead><tr><th>Domaine</th><th>Rôle</th><th>Certificat</th><th aria-label="Gestes" /></tr></thead>
                <tbody>
                  {f.domaines.map((d) => (
                    <tr key={d.hote}>
                      <td>
                        <a href={adresseVitrine(d.hote, hoteConsole)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5">
                          {d.hote} <Icone nom="externe" taille={12} className="discret" />
                        </a>
                      </td>
                      <td>{d.principal ? <span className="ui-etat">Principal</span> : <span className="discret">Secondaire</span>}</td>
                      <td>
                        <span className={CERTIFICAT[d.statut_certificat]?.classe ?? "ui-etat ui-etat-point ui-etat-ambre"}>
                          {CERTIFICAT[d.statut_certificat]?.texte ?? "En attente"}
                        </span>
                      </td>
                      <td className="text-end">
                        {d.principal ? null : (
                          <form action={`/boutiques/${b.slug}/domaines`} method="post" className="bt-domaine-gestes">
                            <input type="hidden" name="boutique_id" value={b.id} />
                            <input type="hidden" name="hote" value={d.hote} />
                            <button type="submit" name="geste" value="principal" className="btn-lien" aria-label={`Rendre ${d.hote} principal`}>Rendre principal</button>
                            {d.type === "personnalise" && superAdmin ? (
                              <button type="submit" name="geste" value="retirer" className="btn-lien bt-retirer" aria-label={`Retirer le domaine ${d.hote}`}>Retirer</button>
                            ) : null}
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form action={`/boutiques/${b.slug}/domaines`} method="post" className="carte-pied">
              <input type="hidden" name="boutique_id" value={b.id} />
              <div className="champ flex-1 min-w-[14rem]">
                <label htmlFor="hote" className="sr-only">Ajouter un domaine</label>
                <input id="hote" name="hote" required placeholder="www.maboutique.tn" />
              </div>
              <label className="opt"><input type="checkbox" name="principal" value="1" /> Principal</label>
              <button type="submit" className="btn btn-second"><Icone nom="plus" /> Ajouter un domaine</button>
            </form>
          </section>

          <section className="carte" aria-labelledby="t-notes" id="notes">
            <div className="carte-tete">
              <div>
                <h2 id="t-notes" className="carte-titre-icone"><Icone nom="note" /> Suivi</h2>
                <p>Ce que SkanEcom retient de ce client : appels, demandes, promesses. Visible de la seule console.</p>
              </div>
            </div>
            {retour("notes")}
            <form action={`/boutiques/${b.slug}/notes`} method="post" className="bt-note-neuve">
              <input type="hidden" name="boutique_id" value={b.id} />
              <input type="hidden" name="geste" value="ajouter" />
              <label className="sr-only" htmlFor="bt-note">Une note sur {b.nom}</label>
              <textarea id="bt-note" className="entree" name="texte" rows={2} maxLength={2000} required placeholder="Ex. Appelé le 12/10 : veut le retrait en magasin à Sousse." />
              <div className="bt-note-actions">
                <label className="bt-note-epingle"><input type="checkbox" name="epinglee" value="1" /> Épingler en tête</label>
                <button type="submit" className="btn btn-second btn-petit">Garder la note</button>
              </div>
            </form>
            {notes.length ? (
              <ul className="bt-notes" role="list">
                {notes.map((n) => (
                  <li key={n.id} data-epinglee={n.epinglee ? "" : undefined}>
                    <p className="bt-note-texte">{n.texte}</p>
                    <div className="bt-note-meta">
                      {n.epinglee ? <span className="ui-etat">Épinglée</span> : null}
                      <span>{n.auteur ?? "—"} · {dateJournal(n.le)}</span>
                      <form action={`/boutiques/${b.slug}/notes`} method="post" className="bt-note-gestes">
                        <input type="hidden" name="note_id" value={n.id} />
                        <button type="submit" name="geste" value={n.epinglee ? "detacher" : "epingler"} className="btn-lien">{n.epinglee ? "Détacher" : "Épingler"}</button>
                        {n.vous ? <button type="submit" name="geste" value="supprimer" className="btn-lien" aria-label="Retirer cette note">Retirer</button> : null}
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="discret bt-notes-vide">Aucune note pour l&apos;instant.</p>}
          </section>

          <section className="carte" aria-labelledby="t-journal">
            <div className="carte-tete">
              <div>
                <h2 id="t-journal" className="carte-titre-icone"><Icone nom="journal" /> Journal</h2>
                <p>Chaque geste fait depuis la console, avec son auteur.</p>
              </div>
            </div>
            {f.journal.length === 0 ? (
              <p className="discret">Aucune action tracée.</p>
            ) : (
              <div className="defile">
                <table className="tableau">
                  <thead><tr><th>Action</th><th>Détail</th><th>Par</th><th>Quand</th></tr></thead>
                  <tbody>
                    {f.journal.map((j, i) => (
                      <tr key={i}>
                        <td className="font-medium whitespace-nowrap">{ACTIONS[j.action] ?? j.action}</td>
                        <td className="discret">{j.action === "boutique.statut" && j.cible ? (LIBELLES_STATUT[j.cible] ?? j.cible)
                          : j.action === "theme.image" && j.cible ? (REGLES[j.cible as Emplacement]?.titre ?? j.cible)
                          : j.action.startsWith("module.") && j.cible ? (LIBELLES_MODULES[j.cible] ?? j.cible)
                          : j.action.startsWith("mise_en_place.") && j.cible ? (ETAPES_MISE_EN_PLACE[j.cible as CleEtape]?.titre ?? j.cible)
                          : j.action.startsWith("support.") && j.cible ? (MODES_SUPPORT[j.cible as ModeSupport]?.titre ?? j.cible)
                          : j.action === "boutique.formule" ? (formules.formules.find((x) => x.code === j.cible)?.nom ?? j.cible ?? SANS_FORMULE)
                          : j.action.startsWith("catalogue.photos") || j.action.startsWith("note.") ? "" : (j.cible ?? "")}</td>
                        <td>
                          {j.acteur ? (
                            <span className="inline-flex items-center gap-2 whitespace-nowrap">
                              <span className="avatar" style={styleAvatar(j.acteur, { inlineSize: 22, blockSize: 22, fontSize: ".5625rem" })} aria-hidden="true">{initiales(j.acteur)}</span>
                              {j.acteur}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="tabular-nums whitespace-nowrap discret">{dateJournal(j.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="carte" aria-labelledby="t-vie" id="vie">
            <div className="carte-tete">
              <div>
                <h2 id="t-vie" className="carte-titre-icone"><Icone nom="reglages" /> Cycle de vie</h2>
                <p>Renommer, partir de cette boutique pour une autre, la fermer à la fin du contrat.</p>
              </div>
            </div>
            {retour("vie")}
            <div className="bt-vie">
              <form action={`/boutiques/${b.slug}/renommer`} method="post" className="bt-vie-ligne">
                <input type="hidden" name="boutique_id" value={b.id} />
                <label htmlFor="bt-nom">Nom</label>
                <input id="bt-nom" className="entree" name="nom" defaultValue={b.nom} required minLength={2} maxLength={80} />
                <button type="submit" className="btn btn-second btn-petit">Renommer</button>
                <span className="aide">L&apos;adresse ({b.slug}) ne change pas : les liens déjà partagés marchent toujours.</span>
              </form>
              <div className="bt-vie-ligne">
                <span className="bt-vie-titre">Cloner</span>
                <Link href={`/nouvelle-boutique?modele=${b.slug}`} className="btn btn-second btn-petit"><Icone nom="copier" taille={14} /> Nouvelle boutique à partir de celle-ci</Link>
                <span className="aide">Son apparence, ses réglages, sa livraison, ses rayons. Ni ses images, ni son catalogue, ni ses clients.</span>
              </div>
              {b.statut !== "fermee" && !superAdmin ? (
                <p className="aide">La fermer, à la fin du contrat : un super-administrateur.</p>
              ) : b.statut !== "fermee" ? (
                <form action={`/boutiques/${b.slug}/statut`} method="post" className="bt-vie-ligne bt-vie-fermer">
                  <input type="hidden" name="boutique_id" value={b.id} />
                  <span className="bt-vie-titre">Fermer</span>
                  <label className="opt"><input type="checkbox" name="confirme" value="1" required /> Le contrat est fini : fermer la boutique</label>
                  <button type="submit" name="statut" value="fermee" className="btn btn-danger btn-petit">Fermer la boutique</button>
                  <span className="aide">
                    La vitrine n&apos;est plus servie ; commandes et clients sont gardés. Pour remettre ses données au client, ouvrez un
                    accès support : Réglages → Vos données. Elle peut rouvrir.
                  </span>
                </form>
              ) : (
                <p className="aide">Fermée : sa vitrine n&apos;est plus servie. « Ouvrir la boutique », en haut, la rouvre.</p>
              )}
            </div>
          </section>
        </div>

        <div className="pile">
          {activite ? (
            <section className="carte" aria-labelledby="t-activite" id="activite">
              <div className="carte-tete">
                <div>
                  <h2 id="t-activite" className="carte-titre-icone"><Icone nom="graphique" /> Activité · 30 jours</h2>
                  <p>
                    {sante?.derniere_commande ? <>Dernière commande il y a {depuis(sante.derniere_commande, maintenant)}</> : "Aucune commande encore"}
                    {b.demonstration ? " · démonstration : hors tableau de bord" : null}
                  </p>
                </div>
              </div>
              <dl className="bt-activite">
                <div><dt>Reçues</dt><dd className="tabular-nums">{activite.recues}</dd></div>
                <div><dt>Livrées</dt><dd className="tabular-nums">{activite.livrees}</dd></div>
                <div data-alerte={clos >= 5 && activite.refusees / clos >= 0.25 ? "" : undefined}>
                  <dt>Refus</dt><dd className="tabular-nums">{clos ? `${Math.round((activite.refusees / clos) * 100)} %` : "—"}</dd>
                </div>
                <div><dt>Chiffre livré</dt><dd className="tabular-nums">{formateMontant(activite.chiffre)} <small>TND</small></dd></div>
              </dl>
              {signaux.length ? (
                <ul className="bt-signaux" role="list">
                  {signaux.map((v) => (
                    <li key={v.cle} data-niveau={v.niveau}><Link href={v.href}><span className="pl-point" aria-hidden="true" />{v.texte}</Link></li>
                  ))}
                </ul>
              ) : <p className="aide bt-signaux-calme"><Icone nom="coche" taille={14} /> Rien à signaler.</p>}
              <div className="carte-pied">
                <Link href={`/tableau?boutique=${b.slug}`} className="btn-lien aide inline-flex items-center gap-1 whitespace-nowrap">Au tableau de bord <Icone nom="droite" taille={12} /></Link>
              </div>
            </section>
          ) : null}
          <section className="carte" aria-labelledby="t-formule" id="formule">
            <div className="carte-tete">
              <div>
                <h2 id="t-formule" className="carte-titre-icone"><Icone nom="billet" /> Formule</h2>
                <p>
                  {formule
                    ? <>{formule.nom}{formule.prix !== null ? <> · {formateMontant(formule.prix)} TND / mois</> : null} · {formule.droits.length} droit{formule.droits.length > 1 ? "s" : ""} sur {formules.droits.length}</>
                    : <>{SANS_FORMULE} : tout est ouvert, rien n&apos;est limité.</>}
                </p>
              </div>
            </div>
            {/* Ce que le changement a coupé ou éteint, dit dans la carte, là où l'on vient de cliquer. */}
            {retour("formule")}
            {!superAdmin ? (
              <p className="carte-pied aide">Seul un super-administrateur change la formule. <Link href="/formules">Voir ce que chacune ouvre</Link></p>
            ) : <form action={`/boutiques/${b.slug}/formule`} method="post" className="carte-pied bt-formule">
              <input type="hidden" name="boutique_id" value={b.id} />
              <label className="sr-only" htmlFor="bt-formule">Formule de {b.nom}</label>
              <select id="bt-formule" className="entree" key={codeFormule ?? "sur-mesure"} name="formule" defaultValue={codeFormule ?? ""}>
                <option value="">{SANS_FORMULE}</option>
                {formules.formules.map((x) => <option key={x.code} value={x.code}>{x.nom}{x.prix !== null ? ` · ${formateMontant(x.prix)} TND` : ""}</option>)}
              </select>
              <button type="submit" className="btn btn-second">Changer</button>
              <Link href="/formules" className="aide bt-formule-lien">Voir ce que chacune ouvre</Link>
            </form>}
          </section>

          <section className="carte" aria-labelledby="t-equipe">
            <div className="carte-tete">
              <div>
                <h2 id="t-equipe" className="carte-titre-icone"><Icone nom="equipe" /> Équipe</h2>
                <p>
                  {equipe.length === 0
                    ? "Personne n'entre encore dans son backoffice."
                    : `${actifs.length} ${actifs.length > 1 ? "personnes ont" : "personne a"} accès au backoffice${enAttente ? ` · ${enAttente} invitation${enAttente > 1 ? "s" : ""} en attente` : ""}`}
                </p>
              </div>
            </div>
            {actifs.length > 0 ? (
              // Qui, et avec quel rôle : des initiales empilées ne le disaient pas.
              <ul className="bt-membres" role="list">
                {actifs.slice(0, 4).map((m) => (
                  <li key={m.user_id}>
                    <span className="avatar" style={styleAvatar(m.email ?? "?", { inlineSize: 26, blockSize: 26, fontSize: ".5625rem" })} aria-hidden="true">
                      {initiales(m.email ?? "?")}
                    </span>
                    <span className="bt-membre-qui">{m.email ?? m.telephone ?? "Sans adresse"}</span>
                    <span className="bt-membre-role">{m.en_attente ? "Invitation en attente" : LIBELLES_ROLE[m.role] ?? m.role}</span>
                  </li>
                ))}
                {actifs.length > 4 ? <li className="bt-membres-plus">et {actifs.length - 4} autre{actifs.length - 4 > 1 ? "s" : ""}</li> : null}
              </ul>
            ) : null}
            <div className="carte-pied">
              <Link href={`/boutiques/${b.slug}/equipe`} className="btn btn-second btn-bloc">
                {equipe.length === 0 ? "Inviter le propriétaire" : "Gérer l'équipe"}
              </Link>
            </div>
          </section>

          <section className="carte" aria-labelledby="t-catalogue">
            <div className="carte-tete">
              <div>
                <h2 id="t-catalogue" className="carte-titre-icone"><Icone nom="colis" /> Catalogue</h2>
              </div>
            </div>
            <dl className="liste-def tabular-nums">
              <div><dt>Produits</dt><dd>{f.compteurs.produits}</dd></div>
              <div><dt>Publiés</dt><dd>{f.compteurs.publies}</dd></div>
              <div><dt>Variantes</dt><dd>{f.compteurs.variantes}</dd></div>
              <div><dt>Rayons</dt><dd>{f.compteurs.categories}</dd></div>
            </dl>
            <div className="carte-pied">
              <Link href={`/boutiques/${b.slug}/import`} className="btn btn-second btn-bloc">
                <Icone nom="importer" /> Importer un catalogue
              </Link>
            </div>
            {vide && metiers.length ? (
              <details className="mt-appliquer">
                <summary className="btn btn-second btn-bloc"><Icone nom="modules" /> Partir du préréglage d&apos;un métier</summary>
                <form action={`/boutiques/${b.slug}/metier`} method="post" className="pile mt-4">
                  <input type="hidden" name="boutique_id" value={b.id} />
                  <p className="aide">Ses rayons, ses caractéristiques, sa palette et son gabarit, posés d&apos;un geste ; tout se change ensuite. Seulement sur une boutique vide.</p>
                  <ChoixMetier metiers={metiers} aucun={false} />
                  <button type="submit" className="btn btn-primaire">Poser le préréglage</button>
                </form>
              </details>
            ) : null}
          </section>

          <section className="carte" aria-labelledby="t-marque">
            <div className="carte-tete">
              <div>
                <h2 id="t-marque" className="carte-titre-icone"><Icone nom="marque" /> Marque</h2>
                <p>{f.theme ? `Gabarit ${(LIBELLES_THEME[f.theme.code] ?? f.theme.code).toLowerCase()} · version ${f.theme.version}` : "Aucun thème"}</p>
              </div>
            </div>
            <div className="carte-pied">
              <Link href={`/boutiques/${b.slug}/marque`} className="btn btn-second btn-bloc">Régler la marque</Link>
            </div>
          </section>

          <section className="carte" aria-labelledby="t-demonstration">
            <div className="carte-tete">
              <div>
                <h2 id="t-demonstration" className="carte-titre-icone"><Icone nom="apercu" /> {b.demonstration ? "Boutique de démonstration" : "Boutique cliente"}</h2>
                <p>
                  {b.demonstration
                    ? "Montrée aux prospects : ses commandes ne comptent pas dans la synthèse de la console ni dans « À surveiller », et elle n'a pas de client à facturer. Sa vitrine, elle, ne change pas."
                    : "Un vrai client : ses commandes comptent dans la synthèse, celles qui attendent passent dans « À surveiller »."}
                </p>
              </div>
            </div>
            <form action={`/boutiques/${b.slug}/demonstration`} method="post" className="carte-pied">
              <input type="hidden" name="boutique_id" value={b.id} />
              <input type="hidden" name="demonstration" value={b.demonstration ? "false" : "true"} />
              <button type="submit" className="btn btn-second btn-bloc">
                {b.demonstration ? "C'est une boutique cliente" : "C'est une boutique de démonstration"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
