import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { PEUT_MODIFIER, type Attribut } from "@/lib/gestion/catalogue";

export const metadata: Metadata = { title: "Caractéristiques" };

type Rayon = { id: string; nom: string; parent: string | null };

/* ============================================================================
   LES FICHES TECHNIQUES DE LA BOUTIQUE (B9) — les caractéristiques que ses
   produits affichent en tableau (puissance, tension, couple…) et sur
   lesquelles la vitrine filtre. Chacune a son unité, un type (nombre ou
   texte), et vaut pour les rayons choisis et leurs sous-rayons (aucun :
   tout le catalogue). Les valeurs se saisissent sur la fiche de chaque
   produit. Propriétaire et administrateur ; les autres lisent.
   ========================================================================== */
export default async function Caracteristiques({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const modifie = PEUT_MODIFIER.includes(boutique.role);
  const sb = await clientSession();
  const [{ data, error }, { data: categories }] = await Promise.all([
    sb.rpc("gestion_attributs", { p_boutique_id: boutique.boutique_id }),
    sb.from("categories").select("id, nom_fr, nom_ar, parent_id, position").eq("boutique_id", boutique.boutique_id).order("position"),
  ]);
  if (error) throw new Error(`Caractéristiques illisibles : ${error.message}`);
  const attributs = (data ?? []) as Attribut[];
  const brutes = (categories ?? []) as { id: string; nom_fr: string | null; nom_ar: string | null; parent_id: string | null }[];
  const nomDe = new Map(brutes.map((c) => [c.id, c.nom_fr ?? c.nom_ar ?? "Rayon"]));
  // Les rayons, chaque parent suivi de ses sous-rayons.
  const rayons: Rayon[] = brutes
    .filter((c) => !c.parent_id)
    .flatMap((p) => [
      { id: p.id, nom: nomDe.get(p.id)!, parent: null },
      ...brutes.filter((c) => c.parent_id === p.id).map((c) => ({ id: c.id, nom: nomDe.get(c.id)!, parent: nomDe.get(p.id)! })),
    ]);
  const action = `/gestion/${slug}/produits/caracteristiques/action`;

  const champsRayons = (a: Attribut | null) => (
    <fieldset className="choix">
      <legend>Rayons <span className="facultatif">(aucun : tout le catalogue)</span></legend>
      <div className="ft-rayons">
        {rayons.map((r) => (
          <label key={r.id} className="opt" data-sous={r.parent ? "" : undefined}>
            <input type="checkbox" name="rayons" value={r.id} defaultChecked={a ? a.rayons.some((x) => x.id === r.id) : false} />
            {r.nom}
          </label>
        ))}
      </div>
      <p className="aide">Un rayon vaut pour ses sous-rayons : « Outillage » suffit pour « Perceuses ».</p>
    </fieldset>
  );

  const champsCommuns = (a: Attribut | null, id: string) => (
    <div className="ft-champs">
      <div className="deux-colonnes">
        <div className="champ">
          <label htmlFor={`label-${id}`}>Nom</label>
          <input id={`label-${id}`} name="label" required maxLength={60} defaultValue={a?.label ?? ""} placeholder="Puissance, Tension…" />
        </div>
        <div className="champ">
          <label htmlFor={`unite-${id}`}>Unité <span className="facultatif">(facultatif)</span></label>
          <input id={`unite-${id}`} name="unite" maxLength={12} defaultValue={a?.unite ?? ""} placeholder="W, V, Nm…" />
        </div>
      </div>
      <fieldset className="choix choix-2">
        <legend>Type</legend>
        <label className="choix-carte">
          <input type="radio" name="type" value="nombre" defaultChecked={(a?.type ?? "nombre") === "nombre"} />
          <span><b>Un nombre</b><span className="aide">18 · 2,5 · 1 400 : les filtres les rangent du plus petit au plus grand.</span></span>
        </label>
        <label className="choix-carte">
          <input type="radio" name="type" value="texte" defaultChecked={a?.type === "texte"} />
          <span><b>Un texte</b><span className="aide">« Sans fil 18 V », « Chrome-vanadium », « EN 397 ».</span></span>
        </label>
      </fieldset>
      <div className="choix choix-2">
        <label className="choix-carte">
          <input type="checkbox" name="filtrable" value="1" defaultChecked={a ? a.filtrable : true} />
          <span><b>Filtrable</b><span className="aide">Un filtre de la vitrine, dans les rayons où des produits en ont une valeur.</span></span>
        </label>
        <label className="choix-carte">
          <input type="checkbox" name="en_carte" value="1" defaultChecked={a?.en_carte ?? false} />
          <span><b>Sur la carte du produit</b><span className="aide">Une pastille dans les listes (gabarit technique) : trois au plus.</span></span>
        </label>
      </div>
      {champsRayons(a)}
    </div>
  );

  return (
    <>
      <EnTetePage
        avant={<Link href={`/gestion/${slug}/produits`}><Icone nom="retour" taille={14} /> Catalogue</Link>}
        titre="Caractéristiques"
        description="Ce que vos produits affichent en fiche technique (puissance, tension, dimensions…), et sur quoi la vitrine filtre. Les valeurs se saisissent sur la fiche de chaque produit."
      />
      <div className="pile">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
        {!modifie ? <p className="message">Lecture seule : le propriétaire ou l&apos;administrateur définit les caractéristiques.</p> : null}

        <div className="grille-2">
          <section className="carte" aria-labelledby="t-attributs">
            <div className="carte-tete">
              <div>
                <h2 id="t-attributs" className="carte-titre-icone"><Icone nom="modules" /> Les caractéristiques</h2>
                <p>{attributs.length ? "Dans l'ordre de la fiche technique et des filtres." : "Aucune pour l'instant."}</p>
              </div>
            </div>
            {attributs.length === 0 ? (
              <div className="vide">
                <span className="vide-icone"><Icone nom="modules" taille={20} /></span>
                <strong>Pas encore de fiche technique</strong>
                <p>Définissez la première : sa valeur se saisira sur la fiche de chaque produit de ses rayons.</p>
              </div>
            ) : (
              <ul className="ft-liste" role="list">
                {attributs.map((a, i) => (
                  <li key={a.id} className="ft-attribut" id={`attr-${a.cle}`}>
                    <div className="ft-attribut-tete">
                      <div className="ft-attribut-texte">
                        <p className="ft-attribut-nom">
                          {a.label}
                          {a.unite ? <span className="ft-unite-puce">{a.unite}</span> : null}
                        </p>
                        <p className="ft-attribut-infos">
                          <span>{a.type === "nombre" ? "Nombre" : "Texte"}</span>
                          {a.filtrable ? <span className="ui-etat ui-etat-point ui-etat-vert">Filtrable</span> : null}
                          {a.en_carte ? <span className="ui-etat">Sur la carte</span> : null}
                          <span>{a.rayons.length ? a.rayons.map((r) => r.nom).join(", ") : "Tout le catalogue"}</span>
                          <span className="tabular-nums">{a.produits ? `${a.produits} produit${a.produits > 1 ? "s" : ""}` : "aucun produit"}</span>
                        </p>
                      </div>
                      {modifie ? (
                        <form action={action} method="post" className="ft-ordre">
                          <input type="hidden" name="action" value="deplacer" />
                          <input type="hidden" name="id" value={a.id} />
                          <button name="sens" value="-1" className="btn-icone" disabled={i === 0} aria-label={`${a.label} : monter`}><Icone nom="bas" className="ft-haut" /></button>
                          <button name="sens" value="1" className="btn-icone" disabled={i === attributs.length - 1} aria-label={`${a.label} : descendre`}><Icone nom="bas" /></button>
                        </form>
                      ) : null}
                    </div>
                    {modifie ? (
                      <div className="ft-gestes">
                        <details className="ft-modifier">
                          <summary className="btn btn-second btn-petit"><Icone nom="crayon" taille={14} /> Modifier</summary>
                          <form action={action} method="post" className="formulaire ft-formulaire">
                            <input type="hidden" name="action" value="enregistrer" />
                            <input type="hidden" name="id" value={a.id} />
                            {champsCommuns(a, a.id)}
                            <div className="carte-pied">
                              <button type="submit" className="btn btn-primaire">Enregistrer</button>
                            </div>
                          </form>
                        </details>
                        <details className="ft-retirer">
                          <summary className="btn btn-danger btn-petit"><Icone nom="corbeille" taille={14} /> Retirer…</summary>
                          <form action={action} method="post" className="ft-confirmer">
                            <input type="hidden" name="action" value="retirer" />
                            <input type="hidden" name="id" value={a.id} />
                            <p>{a.produits ? `Sa valeur quittera ${a.produits} produit${a.produits > 1 ? "s" : ""}.` : "Aucun produit n'en a de valeur."}</p>
                            <button type="submit" className="btn btn-danger btn-petit">Oui, retirer « {a.label} »</button>
                          </form>
                        </details>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {modifie ? (
            <section className="carte" aria-labelledby="t-nouvel-attribut">
              <div className="carte-tete">
                <div>
                  <h2 id="t-nouvel-attribut" className="carte-titre-icone"><Icone nom="plus" /> Nouvelle caractéristique</h2>
                  <p>Son nom donne la clé du filtre dans l&apos;adresse des listes ; renommée plus tard, elle garde sa clé : les liens déjà partagés restent bons.</p>
                </div>
              </div>
              <form action={action} method="post" className="formulaire">
                <input type="hidden" name="action" value="enregistrer" />
                {champsCommuns(null, "nouveau")}
                <button type="submit" className="btn btn-primaire btn-bloc">Ajouter la caractéristique</button>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
