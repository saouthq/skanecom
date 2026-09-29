import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { PEUT_MODIFIER } from "@/lib/gestion/catalogue";

export const metadata: Metadata = { title: "Nouveau produit" };

/* Un produit neuf : son nom, son rayon, son prix, et ses axes (taille,
   couleur…) avec leurs valeurs : chaque combinaison devient une déclinaison.
   Il naît en brouillon, sans stock. */
export default async function NouveauProduit({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string } & Record<string, string | undefined>>;
}) {
  const [{ slug }, v] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  if (!PEUT_MODIFIER.includes(boutique.role)) redirect(`/gestion/${slug}/produits`);
  const sb = await clientSession();
  const { data: cats } = await sb.from("categories").select("id, nom_fr, parent_id, position").eq("boutique_id", boutique.boutique_id).order("position");
  const categories = (cats ?? []) as { id: string; nom_fr: string | null; parent_id: string | null }[];
  const nomDe = (c: { nom_fr: string | null; parent_id: string | null }) => {
    const parent = c.parent_id ? categories.find((p) => p.id === c.parent_id) : null;
    return parent ? `${parent.nom_fr} › ${c.nom_fr}` : (c.nom_fr ?? "");
  };
  const axes = [0, 1, 2];

  return (
    <div className="max-w-[46rem]">
      <EnTetePage
        avant={<Link href={`/gestion/${slug}/produits`}><Icone nom="retour" taille={14} /> Catalogue</Link>}
        titre="Nouveau produit"
        description="Il naît en brouillon, sans stock : vous recevez ensuite le stock de chaque déclinaison, puis vous le mettez en vitrine."
      />
      <form action={`/gestion/${slug}/produits/nouveau/creer`} method="post" className="carte formulaire">
        {v.erreur ? <p className="message message-erreur" role="alert">{v.erreur}</p> : null}
        <div className="champ">
          <label htmlFor="nom">Nom du produit</label>
          <input id="nom" name="nom" required maxLength={200} defaultValue={v.nom ?? ""} placeholder="Valise rigide ABS 4 roues" autoFocus />
        </div>
        <div className="deux-colonnes">
          <div className="champ">
            <label htmlFor="categorie">Rayon</label>
            <select id="categorie" name="categorie_id" defaultValue={v.categorie_id ?? ""}>
              <option value="">Sans rayon</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{nomDe(c)}</option>)}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="prix">Prix <span className="facultatif">TND, le même pour chaque déclinaison</span></label>
            <input id="prix" name="prix" required inputMode="decimal" defaultValue={v.prix ?? ""} placeholder="189,000" />
          </div>
        </div>

        <fieldset className="choix">
          <legend>Déclinaisons <span className="facultatif">(facultatif)</span></legend>
          <p className="aide">Un axe par ligne, ses valeurs séparées par des virgules. Deux tailles et trois couleurs donnent six déclinaisons.</p>
          {axes.map((i) => (
            <div key={i} className="axe-ligne">
              <div className="champ">
                <label htmlFor={`axe-nom-${i}`} className="sr-only">Axe {i + 1}</label>
                <input id={`axe-nom-${i}`} name={`axe_nom_${i}`} maxLength={40} defaultValue={v[`axe_nom_${i}`] ?? ""}
                  placeholder={["Taille", "Couleur", "Matière"][i]} />
              </div>
              <div className="champ">
                <label htmlFor={`axe-val-${i}`} className="sr-only">Valeurs de l&apos;axe {i + 1}</label>
                <input id={`axe-val-${i}`} name={`axe_valeurs_${i}`} maxLength={600} defaultValue={v[`axe_valeurs_${i}`] ?? ""}
                  placeholder={["Cabine 55 cm, Moyenne 65 cm", "Noir, Bleu nuit, Bordeaux", "ABS, Polycarbonate"][i]} />
              </div>
            </div>
          ))}
        </fieldset>

        <div className="champ">
          <label htmlFor="sku">Référence de base <span className="facultatif">(facultatif)</span></label>
          <input id="sku" name="sku" maxLength={40} defaultValue={v.sku ?? ""} placeholder="VAL-ABS" />
          <p className="aide">Chaque déclinaison reçoit la sienne : la base, puis trois lettres par valeur (VAL-ABS-CAB-NOI).</p>
        </div>
        <div className="carte-pied">
          <span className="aide">Tout se modifie ensuite sur la fiche.</span>
          <button type="submit" className="btn btn-primaire">Créer le produit</button>
        </div>
      </form>
    </div>
  );
}
