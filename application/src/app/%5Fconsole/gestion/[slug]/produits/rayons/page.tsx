import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { adresseVitrine } from "@/lib/console/libelles";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { PEUT_MODIFIER } from "@/lib/gestion/catalogue";
import { cadreDeGestion } from "@/lib/gestion/pages";
import { urlFichier } from "@/lib/photos";

export const metadata: Metadata = { title: "Rayons" };

type Rayon = {
  id: string;
  parent_id: string | null;
  slug: string;
  nom: string;
  description: string | null;
  image_chemin: string | null;
  position: number;
  actif: boolean;
  version: string;
  produits: number;
  publies: number;
  sous_rayons: number;
  caracteristiques: number;
  anciennes_adresses: string[];
};
type Noeud = Rayon & { niveau: number; enfants: Noeud[] };

/** Trois niveaux au plus (…_rayons.sql) : Valises › Cabine › Rigides. */
const NIVEAUX = 3;

/* ============================================================================
   LES RAYONS DE LA BOUTIQUE — l'arbre du menu et de l'accueil, géré en
   entier : créer (à la racine ou dans un rayon), renommer, changer
   l'adresse (l'ancienne mène toujours au rayon), décrire, donner une image,
   déplacer dans un autre rayon, ordonner, masquer, retirer (ses produits
   vont où l'on dit, ses sous-rayons montent d'un niveau). Propriétaire et
   administrateur ; les autres lisent.
   ========================================================================== */
export default async function Rayons({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string; carte?: string; parent?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const modifie = PEUT_MODIFIER.includes(boutique.role);
  const sb = await clientSession();
  const [{ data, error }, cadre, hoteConsole] = await Promise.all([
    sb.rpc("gestion_rayons", { p_boutique_id: boutique.boutique_id }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
  ]);
  if (error) throw new Error(`Rayons illisibles : ${error.message}`);
  const tous = (data ?? []) as Rayon[];
  const hote = cadre?.boutique.hote_principal ?? null;
  const vitrine = hote ? adresseVitrine(hote, hoteConsole) : null;
  const action = `/gestion/${slug}/produits/rayons/action`;

  // L'arbre, dans l'ordre du menu ; à plat ensuite, chaque parent suivi des siens.
  const noeud = (r: Rayon, niveau: number): Noeud => ({
    ...r, niveau, enfants: tous.filter((e) => e.parent_id === r.id).map((e) => noeud(e, niveau + 1)),
  });
  const racines = tous.filter((r) => !r.parent_id || !tous.some((p) => p.id === r.parent_id)).map((r) => noeud(r, 1));
  const aPlat: Noeud[] = [];
  const parcours = (n: Noeud) => { aPlat.push(n); n.enfants.forEach(parcours); };
  racines.forEach(parcours);
  const hauteur = (n: Noeud): number => 1 + Math.max(0, ...n.enfants.map(hauteur));
  const descendants = (n: Noeud): Set<string> => new Set([n.id, ...n.enfants.flatMap((e) => [...descendants(e)])]);
  const parId = new Map(aPlat.map((n) => [n.id, n]));
  // Visible sur la vitrine : lui et chacun de ses parents.
  const visible = (n: Noeud): boolean => {
    const parent = n.parent_id ? parId.get(n.parent_id) : undefined;
    return n.actif && (parent ? visible(parent) : true);
  };
  const libelleOption = (n: Noeud) => `${"   ".repeat(n.niveau - 1)}${n.niveau > 1 ? "› " : ""}${n.nom}`;
  const parentPropose = aPlat.find((r) => r.id === messages.parent && r.niveau < NIVEAUX)?.id ?? "";
  const totalProduits = tous.reduce((s, r) => s + r.produits, 0);
  // Le message d'un geste paraît là où il a été fait (?carte=rayon-…).
  const message = (carte: string) => messages.carte !== carte ? null
    : messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p>
    : messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null;

  return (
    <>
      <EnTetePage
        avant={<Link href={`/gestion/${slug}/produits`}><Icone nom="retour" taille={14} /> Catalogue</Link>}
        titre="Rayons"
        description="Les rayons et sous-rayons de la vitrine : leur ordre est celui du menu et de l'accueil. Les produits s'y rangent depuis leur fiche."
        actions={vitrine ? (
          <a className="btn btn-second" href={vitrine} target="_blank" rel="noopener"><Icone nom="externe" /> Voir la vitrine</a>
        ) : null}
      />
      <div className="pile">
        {messages.ok && !messages.carte ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur && !messages.carte ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
        {!modifie ? <p className="message">Lecture seule&nbsp;: le propriétaire ou l&apos;administrateur gère les rayons.</p> : null}

        <div className="grille-2">
          <section className="carte ry-arbre" id="rayons" aria-labelledby="t-rayons">
            <div className="carte-tete">
              <div>
                <h2 id="t-rayons" className="carte-titre-icone"><Icone nom="boutique" /> Les rayons</h2>
                <p>
                  {tous.length
                    ? `${tous.length} rayon${tous.length > 1 ? "s" : ""}, ${totalProduits} produit${totalProduits > 1 ? "s" : ""} rangé${totalProduits > 1 ? "s" : ""}.`
                    : "Aucun pour l'instant."}
                </p>
              </div>
            </div>
            {message("rayons")}
            {aPlat.length === 0 ? (
              <div className="vide">
                <span className="vide-icone"><Icone nom="boutique" taille={20} /></span>
                <strong>Pas encore de rayon</strong>
                <p>Créez le premier : il paraît dans le menu de la vitrine dès qu&apos;un produit en vitrine y est rangé.</p>
              </div>
            ) : (
              <ul className="ft-liste ry-liste" role="list">
                {aPlat.map((r) => {
                  const freres = r.parent_id ? aPlat.filter((x) => x.parent_id === r.parent_id) : racines;
                  const rang = freres.findIndex((x) => x.id === r.id);
                  const interdits = descendants(r);
                  const h = hauteur(r);
                  const parents = aPlat.filter((p) => !interdits.has(p.id) && p.niveau + h <= NIVEAUX);
                  // Ses sous-rayons restent (montés d'un niveau) : ils peuvent recevoir ses produits.
                  const destinations = aPlat.filter((p) => p.id !== r.id);
                  const surVitrine = vitrine && visible(r) ? `${vitrine}/categorie/${r.slug}` : null;
                  return (
                    <li key={r.id} className="ft-attribut ry-rayon" id={`rayon-${r.id}`} data-niveau={r.niveau} data-masque={r.actif ? undefined : ""}>
                      <div className="ft-attribut-tete">
                        <span className="ry-image" aria-hidden="true">
                          {r.image_chemin
                            ? <Image src={urlFichier(r.image_chemin)} alt="" width={88} height={88} sizes="44px" />
                            : <Icone nom="photo" taille={16} />}
                        </span>
                        <div className="ft-attribut-texte">
                          <p className="ft-attribut-nom">
                            {r.nom}
                            {!r.actif ? <span className="ui-etat">Masqué</span> : !visible(r) ? <span className="ui-etat">Masqué avec son rayon</span> : null}
                          </p>
                          <p className="ft-attribut-infos">
                            <span className="tabular-nums">{r.produits ? `${r.produits} produit${r.produits > 1 ? "s" : ""}${r.publies !== r.produits ? `, ${r.publies} en vitrine` : ""}` : "aucun produit"}</span>
                            {r.sous_rayons ? <span>{r.sous_rayons} sous-rayon{r.sous_rayons > 1 ? "s" : ""}</span> : null}
                            <span className="ry-adresse">/categorie/{r.slug}</span>
                          </p>
                        </div>
                        {modifie ? (
                          <form action={action} method="post" className="ft-ordre">
                            <input type="hidden" name="action" value="deplacer" />
                            <input type="hidden" name="id" value={r.id} />
                            <button name="sens" value="haut" className="btn-icone" disabled={rang <= 0} aria-label={`${r.nom} : monter`}><Icone nom="bas" className="ft-haut" /></button>
                            <button name="sens" value="bas" className="btn-icone" disabled={rang === freres.length - 1} aria-label={`${r.nom} : descendre`}><Icone nom="bas" /></button>
                          </form>
                        ) : null}
                      </div>
                      {message(`rayon-${r.id}`)}

                      <div className="ft-gestes">
                        {modifie ? (
                          <details className="ft-modifier">
                            <summary className="btn btn-second btn-petit"><Icone nom="crayon" taille={14} /> Modifier</summary>
                            <div className="ft-formulaire ry-fiche">
                              <form action={action} method="post" className="formulaire">
                                <input type="hidden" name="action" value="enregistrer" />
                                <input type="hidden" name="id" value={r.id} />
                                <input type="hidden" name="version" value={r.version} />
                                <div className="ft-champs">
                                  <div className="deux-colonnes">
                                    <div className="champ">
                                      <label htmlFor={`nom-${r.id}`}>Nom</label>
                                      <input id={`nom-${r.id}`} name="nom" required maxLength={80} defaultValue={r.nom} />
                                    </div>
                                    <div className="champ">
                                      <label htmlFor={`parent-${r.id}`}>Dans le rayon</label>
                                      <select id={`parent-${r.id}`} name="parent_id" defaultValue={r.parent_id ?? ""}>
                                        <option value="">À la racine (menu principal)</option>
                                        {parents.map((p) => <option key={p.id} value={p.id}>{libelleOption(p)}</option>)}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="champ">
                                    <label htmlFor={`slug-${r.id}`}>Adresse</label>
                                    <span className="ry-prefixe">
                                      <span aria-hidden="true">/categorie/</span>
                                      <input id={`slug-${r.id}`} name="slug" required maxLength={80} defaultValue={r.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*"
                                        aria-describedby={`aide-slug-${r.id}`} />
                                    </span>
                                    <span className="aide" id={`aide-slug-${r.id}`}>
                                      Des minuscules, des chiffres et des tirets. Changée, l&apos;ancienne adresse mène toujours ici.
                                      {r.anciennes_adresses.length ? ` Mènent déjà ici : ${r.anciennes_adresses.map((x) => `/categorie/${x}`).join(", ")}.` : ""}
                                    </span>
                                  </div>
                                  <div className="champ">
                                    <label htmlFor={`description-${r.id}`}>Description <span className="facultatif">(facultatif)</span></label>
                                    <textarea id={`description-${r.id}`} name="description" rows={3} maxLength={2000} defaultValue={r.description ?? ""}
                                      placeholder="Quelques mots en tête du rayon sur la vitrine." />
                                  </div>
                                  <label className="choix-carte">
                                    <input type="checkbox" name="actif" value="1" defaultChecked={r.actif} />
                                    <span><b>Visible sur la vitrine</b><span className="aide">Décoché&nbsp;: le rayon et ses sous-rayons quittent le menu ; les produits restent en vente.</span></span>
                                  </label>
                                </div>
                                <div className="carte-pied">
                                  <button type="submit" className="btn btn-primaire">Enregistrer</button>
                                </div>
                              </form>
                              <div className="ry-image-gestes">
                                <form action={action} method="post" encType="multipart/form-data" className="ry-image-form">
                                  <input type="hidden" name="action" value="image" />
                                  <input type="hidden" name="id" value={r.id} />
                                  <div className="champ">
                                    <label htmlFor={`image-${r.id}`}>Image du rayon <span className="facultatif">(menu, accueil)</span></label>
                                    <input id={`image-${r.id}`} name="image" type="file" accept="image/jpeg,image/png,image/webp" required />
                                  </div>
                                  <button type="submit" className="btn btn-second btn-petit"><Icone nom="photo" taille={14} /> {r.image_chemin ? "Changer l'image" : "Poser l'image"}</button>
                                </form>
                                {r.image_chemin ? (
                                  <form action={action} method="post">
                                    <input type="hidden" name="action" value="retirer_image" />
                                    <input type="hidden" name="id" value={r.id} />
                                    <button type="submit" className="btn btn-fantome btn-petit">Retirer l&apos;image</button>
                                  </form>
                                ) : null}
                              </div>
                            </div>
                          </details>
                        ) : null}
                        {modifie && r.niveau < NIVEAUX ? (
                          <Link className="btn btn-second btn-petit" href={`/gestion/${slug}/produits/rayons?parent=${r.id}#t-nouveau-rayon`}>
                            <Icone nom="plus" taille={14} /> Sous-rayon
                          </Link>
                        ) : null}
                        {surVitrine ? (
                          <a className="btn btn-fantome btn-petit" href={surVitrine} target="_blank" rel="noopener"><Icone nom="externe" taille={14} /> Sur la vitrine</a>
                        ) : null}
                        {modifie ? (
                          <details className="ft-retirer">
                            <summary className="btn btn-danger btn-petit">
                              <span className="ry-quand-ferme"><Icone nom="corbeille" taille={14} /> Retirer…</span>
                              <span className="ry-quand-ouvert">Annuler</span>
                            </summary>
                            <form action={action} method="post" className="ft-confirmer ry-retirer">
                              <input type="hidden" name="action" value="retirer" />
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="nom" value={r.nom} />
                              {r.produits ? (
                                <div className="champ">
                                  <label htmlFor={`vers-${r.id}`}>{r.produits > 1 ? `Ses ${r.produits} produits vont dans` : "Son produit va dans"}</label>
                                  <select id={`vers-${r.id}`} name="vers" defaultValue={r.parent_id ?? ""}>
                                    <option value="">Sans rayon</option>
                                    {destinations.map((p) => <option key={p.id} value={p.id}>{libelleOption(p)}</option>)}
                                  </select>
                                </div>
                              ) : <p>Aucun produit n&apos;y est rangé.</p>}
                              {r.sous_rayons ? <p>{r.sous_rayons > 1 ? `Ses ${r.sous_rayons} sous-rayons remontent` : "Son sous-rayon remonte"} d&apos;un niveau.</p> : null}
                              {r.produits ? <p>Son adresse mènera au rayon choisi.</p> : null}
                              {r.caracteristiques ? <p>Les caractéristiques rattachées à ce rayon ne le seront plus ; leurs valeurs restent sur les produits.</p> : null}
                              <button type="submit" className="btn btn-danger btn-petit">Oui, retirer « {r.nom} »</button>
                            </form>
                          </details>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {modifie ? (
            <section className="carte ry-nouveau" id="nouveau-rayon" aria-labelledby="t-nouveau-rayon">
              <div className="carte-tete">
                <div>
                  <h2 id="t-nouveau-rayon" className="carte-titre-icone"><Icone nom="plus" /> Nouveau rayon</h2>
                  <p>À la racine (le menu principal) ou dans un rayon&nbsp;: trois niveaux au plus, comme Valises&nbsp;›&nbsp;Cabine&nbsp;›&nbsp;Rigides.</p>
                </div>
              </div>
              {message("nouveau-rayon")}
              {/* La clé suit ?parent= : venu d'un « Sous-rayon », le formulaire
                  renaît avec ce rayon choisi et le focus sur le nom. */}
              <form key={parentPropose || "racine"} action={action} method="post" className="formulaire">
                <input type="hidden" name="action" value="creer" />
                <div className="champ">
                  <label htmlFor="nouveau-nom">Nom</label>
                  <input id="nouveau-nom" name="nom" required maxLength={80} placeholder="Valises, Sacs de voyage…" autoFocus={Boolean(parentPropose)} />
                </div>
                <div className="champ">
                  <label htmlFor="nouveau-parent">Dans le rayon</label>
                  <select id="nouveau-parent" name="parent_id" defaultValue={parentPropose}>
                    <option value="">À la racine (menu principal)</option>
                    {aPlat.filter((p) => p.niveau < NIVEAUX).map((p) => <option key={p.id} value={p.id}>{libelleOption(p)}</option>)}
                  </select>
                </div>
                <div className="champ">
                  <label htmlFor="nouveau-slug">Adresse <span className="facultatif">(tirée du nom si vide)</span></label>
                  <span className="ry-prefixe">
                    <span aria-hidden="true">/categorie/</span>
                    <input id="nouveau-slug" name="slug" maxLength={80} placeholder="automatique" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
                  </span>
                </div>
                <button type="submit" className="btn btn-primaire btn-bloc">Créer le rayon</button>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
