import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prix } from "@/components/Prix";
import { EnTetePage, initiales } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { urlFichier } from "@/lib/photos";
import { formateMontant } from "@/lib/prix";
import { quand } from "@/lib/gestion/libelles";
import {
  LIBELLES_MOTIF,
  MODES_STOCK,
  PEUT_MODIFIER,
  PEUT_STOCKER,
  etatStock,
  referenceProposee,
  type FicheProduit,
} from "@/lib/gestion/catalogue";

export const metadata: Metadata = { title: "Produit" };

/* ============================================================================
   LA FICHE PRODUIT AU BACKOFFICE — dans l'ordre des gestes du quotidien :

   1. les déclinaisons et leur STOCK (réception d'un arrivage, inventaire,
      casse) et leurs prix ;
   2. une déclinaison de plus (une couleur, une taille) ;
   3. la fiche : nom, description, marque, rayon, en vitrine ou non ;
   4. l'historique des mouvements de stock.

   La base revérifie chaque geste (supabase/migrations/…_gestion_catalogue.sql) ;
   l'écran ne propose que ce que le rôle permet.
   ========================================================================== */
export default async function FicheProduitBackoffice({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug, id }, messages] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_produit", { p_boutique_id: boutique.boutique_id, p_produit_id: id });
  if (error) throw new Error(`Produit illisible : ${error.message}`);
  if (!data) notFound();
  const f = data as FicheProduit;

  const modifie = PEUT_MODIFIER.includes(boutique.role);
  const stocke = PEUT_STOCKER.includes(boutique.role);
  const action = `/gestion/${slug}/produits/${f.id}/action`;
  const actives = f.variantes.filter((v) => v.actif);
  const stockTotal = actives.reduce((n, v) => n + v.stock, 0);
  const prixMin = actives.length ? Math.min(...actives.map((v) => v.prix)) : null;
  const maintenant = new Date();

  return (
    <>
      <EnTetePage
        avant={<Link href={`/gestion/${slug}/produits`}><Icone nom="retour" taille={14} /> Catalogue</Link>}
        titre={
          <>
            {f.nom}
            {f.publie
              ? <span className="ui-etat ui-etat-point ui-etat-vert">En vitrine</span>
              : <span className="ui-etat ui-etat-point">Brouillon</span>}
          </>
        }
        description={
          <>
            <span className="tabular-nums">{stockTotal}</span> pièce{stockTotal > 1 ? "s" : ""} en stock ·{" "}
            {actives.length} déclinaison{actives.length > 1 ? "s" : ""} en vente
            {prixMin !== null ? <> · dès <Prix millimes={prixMin} /></> : null}
          </>
        }
      />

      <div className="pile">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

        <div className="grille-2">
          <div className="pile">
            {/* ---------------- Déclinaisons et stock ---------------- */}
            <section className="carte" aria-labelledby="t-declinaisons">
              <div className="carte-tete">
                <div>
                  <h2 id="t-declinaisons" className="carte-titre-icone"><Icone nom="colis" /> Déclinaisons et stock</h2>
                  <p>Le stock ne change que par un mouvement : réception d&apos;un arrivage, inventaire, casse. Chaque mouvement est gardé.</p>
                </div>
              </div>
              <ul className="var-liste" role="list">
                {f.variantes.map((v) => {
                  const etat = etatStock(v.stock, v.seuil);
                  return (
                    <li key={v.id} id={`var-${v.id}`} className="var" data-inactive={v.actif ? undefined : ""}>
                      <div className="var-tete">
                        <span className="var-nom">{v.libelle ?? "Déclinaison unique"}</span>
                        <span className="var-sku">{v.sku}</span>
                        <span className={etat.classe}>{etat.texte}</span>
                        {!v.actif ? <span className="ui-etat">Hors vente</span> : null}
                      </div>
                      <div className="var-corps">
                        {modifie ? (
                          <form action={action} method="post" className="var-prix">
                            <input type="hidden" name="action" value="variante" />
                            <input type="hidden" name="variante_id" value={v.id} />
                            <div className="champ">
                              <label htmlFor={`prix-${v.id}`}>Prix <span className="facultatif">TND</span></label>
                              <input id={`prix-${v.id}`} name="prix" inputMode="decimal" required defaultValue={formateMontant(v.prix)} />
                            </div>
                            <div className="champ">
                              <label htmlFor={`barre-${v.id}`}>Prix barré <span className="facultatif">TND</span></label>
                              <input id={`barre-${v.id}`} name="prix_barre" inputMode="decimal" defaultValue={v.prix_barre ? formateMontant(v.prix_barre) : ""} placeholder="—" />
                            </div>
                            <div className="champ var-seuil">
                              <label htmlFor={`seuil-${v.id}`}>Alerte sous</label>
                              <input id={`seuil-${v.id}`} name="seuil" type="number" min={0} max={10000} required defaultValue={v.seuil} />
                            </div>
                            <label className="opt var-actif">
                              <input type="checkbox" name="actif" value="1" defaultChecked={v.actif} /> En vente
                            </label>
                            <button type="submit" className="btn btn-second btn-petit">Enregistrer</button>
                          </form>
                        ) : (
                          <dl className="var-lecture">
                            <div><dt>Prix</dt><dd><Prix millimes={v.prix} /></dd></div>
                            {v.prix_barre ? <div><dt>Prix barré</dt><dd><Prix millimes={v.prix_barre} /></dd></div> : null}
                          </dl>
                        )}
                        {stocke ? (
                          <form action={action} method="post" className="var-stock">
                            <input type="hidden" name="action" value="stock" />
                            <input type="hidden" name="variante_id" value={v.id} />
                            <fieldset className="segments">
                              <legend>Mouvement de stock</legend>
                              {MODES_STOCK.map((m, i) => (
                                <label key={m.cle} title={m.aide}>
                                  <input type="radio" name="mode" value={m.cle} defaultChecked={i === 0} /> {m.libelle}
                                </label>
                              ))}
                            </fieldset>
                            <div className="champ var-qte">
                              <label htmlFor={`qte-${v.id}`} className="sr-only">Quantité</label>
                              <input id={`qte-${v.id}`} name="quantite" type="number" min={0} max={100000} required placeholder="Qté" />
                            </div>
                            <div className="champ var-note">
                              <label htmlFor={`note-${v.id}`} className="sr-only">Commentaire</label>
                              <input id={`note-${v.id}`} name="commentaire" maxLength={300} placeholder="Commentaire (fournisseur, bon…)" />
                            </div>
                            <button type="submit" className="btn btn-primaire btn-petit">Valider</button>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* ---------------- Une déclinaison de plus ---------------- */}
            {modifie && f.axes.length > 0 ? (
              <section className="carte" aria-labelledby="t-ajouter">
                <div className="carte-tete">
                  <div>
                    <h2 id="t-ajouter" className="carte-titre-icone"><Icone nom="plus" /> Ajouter une déclinaison</h2>
                    <p>Une couleur ou une taille de plus. Elle arrive sans stock : faites ensuite la réception.</p>
                  </div>
                </div>
                <form action={action} method="post" className="formulaire">
                  <input type="hidden" name="action" value="ajouter" />
                  <div className="deux-colonnes">
                    {f.axes.map((a) => (
                      <div key={a.cle} className="champ">
                        <label htmlFor={`axe-${a.cle}`}>{a.label}</label>
                        <input id={`axe-${a.cle}`} name={`axe.${a.cle}`} required maxLength={60} list={`valeurs-${a.cle}`} placeholder={a.valeurs[0] ?? ""} />
                        <datalist id={`valeurs-${a.cle}`}>
                          {a.valeurs.map((val) => <option key={val} value={val} />)}
                        </datalist>
                      </div>
                    ))}
                    <div className="champ">
                      <label htmlFor="nouveau-sku">Référence <span className="facultatif">(proposée si vide)</span></label>
                      <input id="nouveau-sku" name="sku" maxLength={60} placeholder={`Ex. ${referenceProposee(f.nom, f.axes.map((a) => a.valeurs[0] ?? ""))}`} />
                    </div>
                    <div className="champ">
                      <label htmlFor="nouveau-prix">Prix <span className="facultatif">TND</span></label>
                      <input id="nouveau-prix" name="prix" inputMode="decimal" required defaultValue={prixMin !== null ? formateMontant(prixMin) : ""} />
                    </div>
                  </div>
                  <div className="carte-pied">
                    <span className="aide">Valeurs déjà utilisées proposées à la saisie.</span>
                    <button type="submit" className="btn btn-primaire">Ajouter la déclinaison</button>
                  </div>
                </form>
              </section>
            ) : null}

            {/* ---------------- La fiche ---------------- */}
            <section className="carte" aria-labelledby="t-fiche">
              <div className="carte-tete">
                <div>
                  <h2 id="t-fiche" className="carte-titre-icone"><Icone nom="note" /> La fiche</h2>
                  <p>Ce que la vitrine affiche. Le produit n&apos;y paraît que s&apos;il est « en vitrine ».</p>
                </div>
              </div>
              <form action={action} method="post" className="formulaire">
                <input type="hidden" name="action" value="fiche" />
                <input type="hidden" name="version" value={f.version} />
                <fieldset disabled={!modifie} className="formulaire" style={{ border: 0, padding: 0, margin: 0 }}>
                  <div className="champ">
                    <label htmlFor="nom">Nom</label>
                    <input id="nom" name="nom" required maxLength={200} defaultValue={f.nom} />
                  </div>
                  <div className="champ">
                    <label htmlFor="description">Description</label>
                    <textarea id="description" name="description" maxLength={5000} rows={5} defaultValue={f.description ?? ""}
                      placeholder="Matière, dimensions, entretien, garantie…" />
                  </div>
                  <div className="deux-colonnes">
                    <div className="champ">
                      <label htmlFor="marque">Marque <span className="facultatif">(facultatif)</span></label>
                      <input id="marque" name="marque" maxLength={80} defaultValue={f.marque ?? ""} />
                    </div>
                    <div className="champ">
                      <label htmlFor="categorie">Rayon</label>
                      <select id="categorie" name="categorie_id" defaultValue={f.categorie_id ?? ""}>
                        <option value="">Sans rayon</option>
                        {f.categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="choix choix-2">
                    <label className="choix-carte">
                      <input type="checkbox" name="publie" value="1" defaultChecked={f.publie} />
                      <span><b>En vitrine</b><span className="aide">Visible et commandable sur la boutique.</span></span>
                    </label>
                    <label className="choix-carte">
                      <input type="checkbox" name="mis_en_avant" value="1" defaultChecked={f.mis_en_avant} />
                      <span><b>Mis en avant</b><span className="aide">Parmi les produits de l&apos;accueil.</span></span>
                    </label>
                  </div>
                </fieldset>
                {modifie ? (
                  <div className="carte-pied">
                    <span className="aide">Modifié {quand(f.version, maintenant)}.</span>
                    <button type="submit" className="btn btn-primaire">Enregistrer la fiche</button>
                  </div>
                ) : (
                  <p className="aide">La fiche se modifie par le propriétaire ou l&apos;administrateur.</p>
                )}
              </form>
            </section>

            {/* ---------------- Les mouvements ---------------- */}
            <section className="carte" aria-labelledby="t-mouvements">
              <div className="carte-tete">
                <div>
                  <h2 id="t-mouvements" className="carte-titre-icone"><Icone nom="journal" /> Mouvements de stock</h2>
                  <p>Les trente derniers, toutes déclinaisons confondues.</p>
                </div>
              </div>
              {f.mouvements.length === 0 ? (
                <p className="discret">Aucun mouvement pour le moment.</p>
              ) : (
                <ol className="mvt-liste">
                  {f.mouvements.map((m, i) => (
                    <li key={`${m.le}-${i}`} className="mvt">
                      <span className={`mvt-delta ${m.delta > 0 ? "mvt-plus" : "mvt-moins"}`}>{m.delta > 0 ? `+${m.delta}` : `−${-m.delta}`}</span>
                      <span className="mvt-texte">
                        <span>
                          <span className="font-medium">{LIBELLES_MOTIF[m.motif] ?? m.motif}</span>
                          {m.commande ? <> · <Link className="lien" href={`/gestion/${slug}/commandes/${m.commande}`}>{m.commande}</Link></> : null}
                        </span>
                        {/* (le commentaire d'une commande ne fait que répéter son numéro) */}
                        {m.commentaire && !(m.commande && m.commentaire.startsWith(`Commande ${m.commande}`)) ? (
                          <span className="mvt-note-texte">{m.commentaire}</span>
                        ) : null}
                        <span className="mvt-meta">
                          {[m.libelle ?? m.sku, `reste ${m.stock_apres}`, m.auteur ?? (m.commande ? "boutique en ligne" : null), quand(m.le, maintenant)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <aside className="pile">
            <section className="carte" aria-labelledby="t-photos">
              <h2 id="t-photos" className="carte-titre-icone"><Icone nom="apercu" /> Photos</h2>
              {f.images.length === 0 ? (
                <div className="vide mt-3" style={{ padding: "1.75rem 1rem" }}>
                  <span className="vide-icone"><Icone nom="colis" taille={18} /></span>
                  <strong>Pas encore de photo</strong>
                  <p className="text-petit">La vitrine affiche « photo à venir » avec le nom du produit.</p>
                </div>
              ) : (
                <ul className="photos-grille mt-3" role="list">
                  {f.images.map((img) => (
                    <li key={img.id} className="photo-vignette">
                      <Image src={urlFichier(img.chemin)} alt={img.alt ?? ""} fill sizes="120px" />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="carte" aria-labelledby="t-resume">
              <h2 id="t-resume" className="carte-titre-icone"><Icone nom="apercu" /> En bref</h2>
              <dl className="liste-def mt-3">
                <div><dt>Stock total</dt><dd className="tabular-nums">{stockTotal}</dd></div>
                <div><dt>Déclinaisons</dt><dd>{actives.length} en vente{f.variantes.length > actives.length ? ` · ${f.variantes.length - actives.length} hors vente` : ""}</dd></div>
                <div><dt>Adresse</dt><dd className="text-petit">/produit/{f.slug}</dd></div>
                <div><dt>Créé</dt><dd className="text-petit">{quand(f.cree_le, maintenant)}</dd></div>
              </dl>
              <p className="text-petit discret mt-4 flex items-center gap-2">
                <span className="avatar" style={{ inlineSize: 22, blockSize: 22, fontSize: ".5625rem" }} aria-hidden="true">{initiales(boutique.nom)}</span>
                {modifie ? "Vous pouvez tout modifier." : stocke ? "Vous tenez le stock ; la fiche et les prix reviennent au propriétaire." : "Lecture seule."}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
