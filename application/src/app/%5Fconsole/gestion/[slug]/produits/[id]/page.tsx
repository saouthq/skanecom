import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Prix } from "@/components/Prix";
import { EnTetePage } from "@/components/console/Coquille";
import { DepotPhotos } from "@/components/console/DepotPhotos";
import { RedigerDescription } from "@/components/console/RedigerDescription";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { urlFichier } from "@/lib/photos";
import { formateMontant } from "@/lib/prix";
import { paliersDe } from "@/lib/paliers";
import { quand } from "@/lib/gestion/libelles";
import { adresseVitrine } from "@/lib/console/libelles";
import { cadreDeGestion } from "@/lib/gestion/pages";
import {
  LIBELLES_MOTIF,
  MODES_STOCK,
  PEUT_MODIFIER,
  PEUT_STOCKER,
  etatStock,
  referenceProposee,
  valeurSaisie,
  type FicheProduit,
  type FicheTechnique,
} from "@/lib/gestion/catalogue";

export const metadata: Metadata = { title: "Produit" };

/* ============================================================================
   LA FICHE PRODUIT AU BACKOFFICE — dans l'ordre des gestes du quotidien :

   1. les photos (la première est celle des listes de la vitrine) ;
   2. les déclinaisons et leur STOCK (réception d'un arrivage, inventaire,
      casse) et leurs prix ;
   3. une déclinaison de plus (une couleur, une taille) ;
   4. la fiche : nom, description, marque, rayon, en vitrine ou non ;
   5. la fiche technique : les caractéristiques de son rayon (B9) ;
   6. l'historique des mouvements de stock.

   La base revérifie chaque geste (supabase/migrations/…_gestion_catalogue.sql) ;
   l'écran ne propose que ce que le rôle permet.
   ========================================================================== */
export default async function FicheProduitBackoffice({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string; stock?: string; toutes?: string }>;
}) {
  const [{ slug, id }, messages] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const [{ data, error }, { data: technique }, { data: pro }, { data: remises }, { data: lusPaliers }, cadre, hoteConsole, { data: studio }, { data: redaction }] = await Promise.all([
    sb.rpc("gestion_produit", { p_boutique_id: boutique.boutique_id, p_produit_id: id }),
    sb.rpc("gestion_fiche_technique", { p_boutique_id: boutique.boutique_id, p_produit_id: id }),
    sb.rpc("gestion_pro_etat", { p_boutique_id: boutique.boutique_id }),
    sb.rpc("gestion_soldes_du_produit", { p_boutique_id: boutique.boutique_id, p_produit_id: id }),
    sb.rpc("gestion_paliers", { p_boutique_id: boutique.boutique_id, p_produit_id: id }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
    sb.rpc("gestion_studio_etat", { p_boutique_id: boutique.boutique_id }),
    sb.rpc("gestion_redaction_etat", { p_boutique_id: boutique.boutique_id }),
  ]);
  // Le studio photo (module studio_photo) : une photo du téléphone devient une photo de catalogue.
  const avecStudio = Boolean((studio as { actif?: boolean } | null)?.actif);
  // La rédaction (module redaction) : un brouillon de description, à relire avant d'enregistrer.
  const avecRedaction = Boolean((redaction as { actif?: boolean } | null)?.actif);
  // Les prix par quantité (« 2 pour 99 », migration 71) : trois lignes à remplir.
  const paliers = paliersDe(lusPaliers);
  const reglePrix = ["proprietaire", "admin"].includes(boutique.role);
  // Les prix barrés en cours sur ce produit (module promotions) : chaque
  // déclinaison remisée le dit, et ce qu'il advient d'un prix changé ici.
  const operations = (remises as { id: string; nom: string; pourcentage: number; variantes: string[] }[] | null) ?? [];
  const operationDe = new Map(operations.flatMap((o) => o.variantes.map((v) => [v, o] as const)));
  // Le prix pro de chaque déclinaison, avec le module des comptes professionnels.
  const avecPrixPro = Boolean((pro as { actif: boolean } | null)?.actif);
  if (error) throw new Error(`Produit illisible : ${error.message}`);
  if (!data) notFound();
  const f = data as FicheProduit;
  const lignesTechniques = ((technique as FicheTechnique | null)?.attributs ?? []);

  const modifie = PEUT_MODIFIER.includes(boutique.role);
  const stocke = PEUT_STOCKER.includes(boutique.role);
  const action = `/gestion/${slug}/produits/${f.id}/action`;
  const actionPhotos = `/gestion/${slug}/produits/${f.id}/photos`;
  const libelleDe = new Map(f.variantes.map((v) => [v.id, v.libelle ?? v.sku]));
  const actives = f.variantes.filter((v) => v.actif);
  const stockTotal = actives.reduce((n, v) => n + v.stock, 0);
  const prixMin = actives.length ? Math.min(...actives.map((v) => v.prix)) : null;
  const maintenant = new Date();
  // La fiche sur la vitrine : ce que le client voit (un brouillon : l'aperçu n'existe pas encore).
  const hote = cadre?.boutique.hote_principal ?? null;
  const surVitrine = hote && f.publie ? `${adresseVitrine(hote, hoteConsole)}/produit/${f.slug}` : null;
  // Les mouvements : les huit derniers, le reste replié.
  const MOUVEMENTS_VUS = 8;

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
            {f.variantes.length > actives.length ? <> · {f.variantes.length - actives.length} hors vente</> : null}
            {" · "}créé {quand(f.cree_le, maintenant)}
          </>
        }
        actions={surVitrine ? (
          <a className="btn btn-second" href={surVitrine} target="_blank" rel="noopener">
            Voir sur la vitrine <Icone nom="externe" taille={14} />
          </a>
        ) : undefined}
      />

      <div className="pile">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
        {!modifie ? (
          <p className="message">{stocke ? "Vous tenez le stock ; la fiche et les prix reviennent au propriétaire." : "Lecture seule."}</p>
        ) : null}

        {/* Une seule colonne, à toute la largeur : chaque déclinaison tient sur une ligne. */}
        <div className="fp-cadre">
          <div className="pile">
            {/* ---------------- Photos ---------------- */}
            <section className="carte" aria-labelledby="t-photos">
              <div className="carte-tete">
                <div>
                  <h2 id="t-photos" className="carte-titre-icone">
                    <Icone nom="photo" /> Photos
                    {f.images.length ? <span className="compte-onglet">{f.images.length}</span> : null}
                  </h2>
                  <p>
                    {f.images.length
                      ? "La première est celle des listes de la vitrine. Touchez une photo pour la légender ou l'attitrer à une déclinaison."
                      : "Sans photo, la vitrine affiche « photo à venir » avec le nom du produit."}
                  </p>
                </div>
              </div>
              {f.images.length === 0 && !modifie ? (
                <div className="vide" style={{ padding: "1.75rem 1rem" }}>
                  <span className="vide-icone"><Icone nom="photo" taille={18} /></span>
                  <strong>Pas encore de photo</strong>
                  <p className="text-petit">Le propriétaire ou un administrateur peut en ajouter.</p>
                </div>
              ) : (
                <ul className={f.images.length ? "ph-grille" : "ph-grille ph-grille-vide"} role="list">
                  {f.images.map((img, i) => {
                    const dernier = i === f.images.length - 1;
                    const numero = `Photo ${i + 1} sur ${f.images.length}`;
                    return (
                      <li key={img.id} className="ph" id={`ph-${img.id}`}>
                        {modifie ? (
                          <button type="button" className="ph-image" popoverTarget={`ph-feuille-${img.id}`} aria-label={`${numero} : modifier`}>
                            <Image src={urlFichier(img.chemin)} alt={img.alt ?? ""} fill sizes="(min-width: 1024px) 180px, 45vw" />
                            {i === 0 ? <span className="ph-badge">Principale</span> : null}
                            {img.variante_id ? <span className="ph-var">{libelleDe.get(img.variante_id)}</span> : null}
                            <span className="ph-crayon" aria-hidden="true"><Icone nom="crayon" taille={14} /></span>
                          </button>
                        ) : (
                          <span className="ph-image">
                            <Image src={urlFichier(img.chemin)} alt={img.alt ?? ""} fill sizes="(min-width: 1024px) 180px, 45vw" />
                            {i === 0 ? <span className="ph-badge">Principale</span> : null}
                            {img.variante_id ? <span className="ph-var">{libelleDe.get(img.variante_id)}</span> : null}
                          </span>
                        )}
                        {modifie ? (
                          <>
                            <form action={actionPhotos} method="post" className="ph-barre">
                              <input type="hidden" name="action" value="deplacer" />
                              <input type="hidden" name="image_id" value={img.id} />
                              <button name="vers" value="avant" className="btn-icone" disabled={i === 0} aria-label={`${numero} : avancer d'un cran`}>
                                <Icone nom="gauche" />
                              </button>
                              <span className="ph-rang" aria-hidden="true">{i + 1}</span>
                              <button name="vers" value="apres" className="btn-icone" disabled={dernier} aria-label={`${numero} : reculer d'un cran`}>
                                <Icone nom="droite" />
                              </button>
                            </form>

                            <div popover="auto" id={`ph-feuille-${img.id}`} className="ph-feuille" role="dialog" aria-labelledby={`ph-titre-${img.id}`}>
                              <div className="ph-feuille-image">
                                <Image src={urlFichier(img.chemin)} alt="" fill sizes="(min-width: 700px) 320px, 90vw" />
                              </div>
                              <div className="ph-feuille-corps">
                                <div className="ph-feuille-tete">
                                  <h3 id={`ph-titre-${img.id}`}>{numero}{i === 0 ? " · principale" : ""}</h3>
                                  <button type="button" className="btn-icone" popoverTarget={`ph-feuille-${img.id}`} popoverTargetAction="hide" aria-label="Fermer">
                                    <Icone nom="croix" />
                                  </button>
                                </div>
                                <form action={actionPhotos} method="post" className="pile" style={{ gap: ".875rem" }}>
                                  <input type="hidden" name="action" value="modifier" />
                                  <input type="hidden" name="image_id" value={img.id} />
                                  <label className="champ">
                                    <span>Ce qu&apos;on voit <span className="discret">(facultatif)</span></span>
                                    <input className="entree" name="alt" defaultValue={img.alt ?? ""} maxLength={200} placeholder="Ex. Valise noire, vue de face" />
                                    <span className="aide">Lu à voix haute aux personnes aveugles, et lu par Google.</span>
                                  </label>
                                  {f.variantes.length > 1 ? (
                                    <label className="champ">
                                      <span>Montrée pour</span>
                                      <select className="entree" name="variante_id" defaultValue={img.variante_id ?? ""}>
                                        <option value="">Tout le produit</option>
                                        {f.variantes.map((v) => (
                                          <option key={v.id} value={v.id}>{v.libelle ?? v.sku}</option>
                                        ))}
                                      </select>
                                      <span className="aide">Attitrée à une déclinaison, elle s&apos;affiche quand le client la choisit.</span>
                                    </label>
                                  ) : null}
                                  <div><button className="btn btn-primaire">Enregistrer</button></div>
                                </form>
                                {avecStudio && f.images.length < 12 ? (
                                  <form action={actionPhotos} method="post" className="ph-studio">
                                    <input type="hidden" name="action" value="studio" />
                                    <input type="hidden" name="image_id" value={img.id} />
                                    <button className="btn btn-second btn-bloc">
                                      <Icone nom="magie" taille={15} /> Passer au studio
                                    </button>
                                    <p className="aide">L&apos;objet est détouré et posé sur le fond de votre vitrine, au format des cartes. Une nouvelle photo s&apos;ajoute : celle-ci reste.</p>
                                  </form>
                                ) : null}
                                <div className="ph-feuille-pied">
                                  {i > 0 ? (
                                    <form action={actionPhotos} method="post">
                                      <input type="hidden" name="action" value="deplacer" />
                                      <input type="hidden" name="image_id" value={img.id} />
                                      <button name="vers" value="premiere" className="btn btn-second btn-petit">
                                        <Icone nom="etoile" taille={14} /> Mettre en premier
                                      </button>
                                    </form>
                                  ) : <span />}
                                  <form action={actionPhotos} method="post">
                                    <input type="hidden" name="action" value="retirer" />
                                    <input type="hidden" name="image_id" value={img.id} />
                                    <button className="btn btn-fantome btn-petit ph-retirer">
                                      <Icone nom="corbeille" taille={14} /> Retirer la photo
                                    </button>
                                  </form>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </li>
                    );
                  })}
                  {modifie && f.images.length < 12 ? (
                    <li className={f.images.length ? "ph ph-ajout" : "ph-ajout ph-ajout-large"}>
                      <DepotPhotos action={actionPhotos} restantes={12 - f.images.length} large={f.images.length === 0} />
                    </li>
                  ) : null}
                </ul>
              )}
            </section>

            {/* ---------------- Déclinaisons et stock ---------------- */}
            <section className="carte" aria-labelledby="t-declinaisons">
              <div className="carte-tete">
                <div>
                  <h2 id="t-declinaisons" className="carte-titre-icone"><Icone nom="colis" /> Déclinaisons et stock</h2>
                  <p>Le stock ne change que par un mouvement : réception d&apos;un arrivage, inventaire, casse. Chaque mouvement est gardé.</p>
                </div>
              </div>
              {operations.length > 0 ? (
                <p className="message mb-4">
                  <span>
                    En prix barrés : {operations.map((o, i) => (
                      <span key={o.id}>{i > 0 ? ", " : ""}« {o.nom} » (−{o.pourcentage}&nbsp;%)</span>
                    ))}. À la fin, chaque déclinaison retrouve son prix d&apos;avant ; un prix changé ici entre-temps reste tel qu&apos;il est saisi.{" "}
                    <Link href={`/gestion/${slug}/promotions/prix-barres`}>Voir les prix barrés</Link>
                  </span>
                </p>
              ) : null}
              {modifie && f.variantes.length > 1 ? (
                /* Toutes les tailles au même prix : un geste au lieu d'un par ligne. */
                <details className="var-toutes" open={messages.toutes ? true : undefined}>
                  <summary className="btn btn-second btn-petit">
                    <Icone nom="etiquette" taille={14} /> Même prix pour les {f.variantes.length} déclinaisons
                  </summary>
                  <form action={action} method="post" className="var-prix" id="var-toutes">
                    <input type="hidden" name="action" value="prix_toutes" />
                    <div className="champ">
                      <label htmlFor="prix-toutes">Prix <span className="facultatif">TND</span></label>
                      <input id="prix-toutes" name="prix" inputMode="decimal" required placeholder={formateMontant(f.variantes[0].prix)} />
                    </div>
                    <div className="champ">
                      <label htmlFor="barre-toutes">Prix barré <span className="facultatif">TND</span></label>
                      <input id="barre-toutes" name="prix_barre" inputMode="decimal" placeholder="—" aria-describedby="toutes-aide" />
                    </div>
                    <button type="submit" className="btn btn-primaire btn-petit">Appliquer aux {f.variantes.length}</button>
                    <p id="toutes-aide" className="legende var-toutes-aide">Prix barré vide : il est retiré partout. Le stock, l&apos;alerte, le minimum et la mise en vente ne bougent pas.</p>
                  </form>
                </details>
              ) : null}
              <ul className="var-liste" role="list">
                {f.variantes.map((v) => {
                  const etat = etatStock(v.stock, v.seuil);
                  return (
                    <li key={v.id} id={`var-${v.id}`} className="var" data-inactive={v.actif ? undefined : ""}>
                      <div className="var-tete">
                        <span className="var-nom">{v.libelle ?? "Déclinaison unique"}</span>
                        <span className="var-sku">{v.sku}</span>
                        <span className={etat.classe}>{etat.texte}</span>
                        {v.minimum > 1 ? <span className="ui-etat" title="Quantité minimale d'une commande">Par {v.minimum} au moins</span> : null}
                        {operationDe.has(v.id) ? (
                          <span className="ui-etat ui-etat-violet" title={`Prix barrés : « ${operationDe.get(v.id)!.nom} »`}>−{operationDe.get(v.id)!.pourcentage}&nbsp;%</span>
                        ) : null}
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
                            <div className="champ var-seuil">
                              <label htmlFor={`min-${v.id}`} title="La plus petite quantité qu'un client peut commander (1 = à l'unité)">Minimum</label>
                              <input id={`min-${v.id}`} name="minimum" type="number" min={1} max={999} required defaultValue={v.minimum ?? 1}
                                     aria-describedby={`min-aide-${v.id}`} />
                              <span id={`min-aide-${v.id}`} className="sr-only">Quantité minimale par commande, 1 pour vendre à l&apos;unité</span>
                            </div>
                            {avecPrixPro ? (
                              <div className="champ var-pro">
                                <label htmlFor={`pro-${v.id}`} title="Le prix des comptes professionnels validés ; vide : ils paient le prix public">
                                  Prix pro <span className="facultatif">TND</span>
                                </label>
                                <input id={`pro-${v.id}`} name="prix_pro" inputMode="decimal" defaultValue={v.prix_pro ? formateMontant(v.prix_pro) : ""} placeholder="—" />
                              </div>
                            ) : null}
                            <label className="opt var-actif">
                              <input type="checkbox" name="actif" value="1" defaultChecked={v.actif} /> En vente
                            </label>
                            <button type="submit" className="btn btn-second btn-petit">Enregistrer</button>
                          </form>
                        ) : (
                          <dl className="var-lecture">
                            <div><dt>Prix</dt><dd><Prix millimes={v.prix} /></dd></div>
                            {v.prix_barre ? <div><dt>Prix barré</dt><dd><Prix millimes={v.prix_barre} /></dd></div> : null}
                            {v.minimum > 1 ? <div><dt>Minimum</dt><dd>{v.minimum} pièces</dd></div> : null}
                            {avecPrixPro && v.prix_pro ? <div><dt>Prix pro</dt><dd><Prix millimes={v.prix_pro} /></dd></div> : null}
                          </dl>
                        )}
                        {stocke ? (
                          /* Le mouvement de stock, plié : on l'ouvre pour une réception, un
                             inventaire, une casse. Resté ouvert après une erreur. */
                          <details className="var-pli" open={messages.stock === v.id ? true : undefined}>
                            <summary className="btn btn-second btn-petit var-pli-bouton">
                              <Icone nom="colis" taille={14} /> Mouvement de stock
                            </summary>
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
                          </details>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* ---------------- Les prix par quantité ---------------- */}
            <section className="carte" aria-labelledby="t-paliers" id="paliers">
              <div className="carte-tete">
                <div>
                  <h2 id="t-paliers" className="carte-titre-icone"><Icone nom="etiquette" /> Prix par quantité</h2>
                  <p>« 2 pour 99 » : le prix total de plusieurs pièces. La fiche et la page de vente les proposent ; la commande les applique d&apos;elle-même. Trois au plus.</p>
                </div>
              </div>
              {reglePrix ? (
                <details className="fp-pli" data-reste-ouvert open={paliers.length > 0 ? true : undefined}>
                <summary className="btn btn-second btn-petit">{paliers.length ? "Les prix par quantité" : "Poser des prix par quantité"}</summary>
                <form action={action} method="post" className="formulaire">
                  <input type="hidden" name="action" value="paliers" />
                  <ul className="pq-lignes" role="list">
                    {[0, 1, 2].map((i) => {
                      const p = paliers[i];
                      return (
                        <li key={i} className="pq-ligne">
                          <div className="champ">
                            <label htmlFor={`pq-q-${i}`}>Pièces</label>
                            <input id={`pq-q-${i}`} name={`palier.${i}.quantite`} type="number" min={2} max={50} inputMode="numeric"
                                   defaultValue={p?.quantite ?? ""} placeholder={String(i + 2)} />
                          </div>
                          <div className="champ">
                            <label htmlFor={`pq-p-${i}`}>Prix total <span className="facultatif">TND</span></label>
                            <input id={`pq-p-${i}`} name={`palier.${i}.prix`} inputMode="decimal"
                                   defaultValue={p ? formateMontant(p.prixMillimes) : ""} placeholder="—" />
                          </div>
                          <p className="aide pq-unite">{p ? `soit ${formateMontant(Math.round(p.prixMillimes / p.quantite))} TND l'unité` : ""}</p>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="carte-pied">
                    <span className="aide">Une ligne vide ne compte pas ; tout vider retire les prix par quantité.</span>
                    <button type="submit" className="btn btn-second">Enregistrer les prix par quantité</button>
                  </div>
                </form>
                </details>
              ) : paliers.length ? (
                <ul className="pq-lecture" role="list">
                  {paliers.map((p) => <li key={p.quantite}>{p.quantite} pièces : <Prix millimes={p.prixMillimes} /></li>)}
                </ul>
              ) : (
                <p className="aide">Aucun prix par quantité.</p>
              )}
            </section>

            {/* ---------------- Une déclinaison de plus ---------------- */}
            {modifie && f.axes.length > 0 ? (
              <details className="carte carte-pli" aria-labelledby="t-ajouter" open={messages.erreur ? true : undefined}>
                <summary className="carte-pli-tete">
                  <span id="t-ajouter" className="carte-titre-icone"><Icone nom="plus" /> Ajouter une déclinaison</span>
                  <span className="aide">Une couleur ou une taille de plus. Elle arrive sans stock : faites ensuite la réception.</span>
                </summary>
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
              </details>
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
                    {modifie && avecRedaction ? <RedigerDescription action={`/gestion/${slug}/produits/${f.id}/rediger`} champ="description" /> : null}
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

            {/* ---------------- La fiche technique ---------------- */}
            <section className="carte" aria-labelledby="t-technique">
              <div className="carte-tete">
                <div>
                  <h2 id="t-technique" className="carte-titre-icone"><Icone nom="modules" /> Fiche technique</h2>
                  <p>Les caractéristiques de son rayon : la vitrine les montre en tableau, et filtre sur celles qui sont filtrables.</p>
                </div>
                {modifie ? (
                  <Link href={`/gestion/${slug}/produits/caracteristiques`} className="btn btn-second btn-petit">Définir les caractéristiques</Link>
                ) : null}
              </div>
              {lignesTechniques.length === 0 ? (
                <p className="discret">
                  {modifie
                    ? "Aucune caractéristique pour son rayon : définissez-les (puissance, tension, dimensions…) pour qu'elles apparaissent ici."
                    : "Aucune caractéristique pour son rayon."}
                </p>
              ) : (
                <form action={action} method="post" className="formulaire">
                  <input type="hidden" name="action" value="technique" />
                  <input type="hidden" name="version" value={f.version} />
                  <fieldset disabled={!modifie} className="formulaire" style={{ border: 0, padding: 0, margin: 0 }}>
                    <div className="deux-colonnes">
                      {lignesTechniques.map((l) => (
                        <div key={l.cle} className="champ">
                          <label htmlFor={`car-${l.cle}`}>{l.label}</label>
                          <span className="ft-unite" style={{ "--ft-unite": `${(l.unite ?? "").length}ch` } as React.CSSProperties}>
                            <input id={`car-${l.cle}`} name={`car.${l.cle}`} maxLength={80} defaultValue={valeurSaisie(l)}
                              inputMode={l.type === "nombre" ? "decimal" : undefined} placeholder={l.type === "nombre" ? "—" : ""} />
                            {l.unite ? <span aria-hidden="true">{l.unite}</span> : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  </fieldset>
                  {modifie ? (
                    <div className="carte-pied">
                      <span className="aide">Une case vide retire la caractéristique du produit.</span>
                      <button type="submit" className="btn btn-primaire">Enregistrer les caractéristiques</button>
                    </div>
                  ) : null}
                </form>
              )}
            </section>

            {/* ---------------- Les mouvements ---------------- */}
            <section className="carte" aria-labelledby="t-mouvements">
              <div className="carte-tete">
                <div>
                  <h2 id="t-mouvements" className="carte-titre-icone"><Icone nom="journal" /> Mouvements de stock</h2>
                  <p>Les plus récents d&apos;abord, toutes déclinaisons confondues.</p>
                </div>
              </div>
              {f.mouvements.length === 0 ? (
                <p className="discret">Aucun mouvement pour le moment.</p>
              ) : (
                <ol className="mvt-liste">
                  {f.mouvements.slice(0, MOUVEMENTS_VUS).map((m, i) => (
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
              {f.mouvements.length > MOUVEMENTS_VUS ? (
                <details className="mvt-plus-anciens">
                  <summary className="btn btn-second btn-petit">Les {f.mouvements.length - MOUVEMENTS_VUS} mouvements d&apos;avant</summary>
                  <ol className="mvt-liste" start={MOUVEMENTS_VUS + 1}>
                    {f.mouvements.slice(MOUVEMENTS_VUS).map((m, i) => (
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
                </details>
              ) : null}
            </section>
          </div>

        </div>
      </div>
    </>
  );
}
