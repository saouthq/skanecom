import type { Metadata } from "next";
import Link from "next/link";
import { AjoutRapide } from "@/components/AjoutRapide";
import { EnteteListe } from "@/components/EnteteListe";
import { EtatStock } from "@/components/EtatStock";
import { Etoiles } from "@/components/Etoiles";
import { Gabarit } from "@/components/Gabarit";
import { Photo } from "@/components/Photo";
import { PrixCarte } from "@/components/PrixCarte";
import { DifferencesSeules, SuiviComparaison } from "@/components/ComparaisonPage";
import { cadre as chargeCadre } from "@/lib/boutique";
import { etatProduit, minimumVariante, stockTotal, type Produit } from "@/lib/catalogue";
import { valeurAvecUnite } from "@/lib/caracteristiques";
import { MAX_COMPARAISON } from "@/lib/comparaison-contrat";
import { champ, t } from "@/lib/i18n";
import { urlPhoto } from "@/lib/photos";
import { supabase } from "@/lib/supabase";

/* ============================================================================
   COMPARER — les pièces cochées, côte à côte (structure Commerce). L'adresse
   les porte (/comparer?p=a,b,c) : le serveur relit chaque fiche publique en
   base (prix, stock, note, caractéristiques d'aujourd'hui), jamais une copie
   du navigateur. Retirer une pièce, c'est suivre l'adresse sans elle ; la
   liste du navigateur suit la page (SuiviComparaison).

   Une ligne par caractéristique que l'une au moins des pièces renseigne ;
   « Seulement les différences » masque celles où toutes disent la même
   chose. Au téléphone, le tableau glisse, la première colonne reste.
   ========================================================================== */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: t.comparaison.titre, robots: { index: false } };

const SLUG = /^[a-z0-9-]{1,120}$/;

type Ligne = { cle: string; libelle: string; valeurs: (string | null)[] };

export default async function Comparer({
  params,
  searchParams,
}: {
  params: Promise<{ boutique: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const [{ boutique }, { p }] = await Promise.all([params, searchParams]);
  const cadre = await chargeCadre(boutique);
  const demandes = [...new Set((p ?? "").split(",").filter((x) => SLUG.test(x)))].slice(0, MAX_COMPARAISON);

  let produits: Produit[] = [];
  if (demandes.length) {
    const { data, error } = await supabase.from("vitrine_produits").select("*").eq("boutique_id", cadre.boutique.id).in("slug", demandes);
    if (error) throw new Error(`Comparaison illisible : ${error.message}`);
    const parSlug = new Map(((data ?? []) as Produit[]).map((x) => [x.slug, x]));
    produits = demandes.map((x) => parSlug.get(x)).filter((x): x is Produit => Boolean(x));
  }

  // Les caractéristiques, dans l'ordre où la première pièce les donne, puis les autres.
  const lignes: Ligne[] = [];
  for (const prod of produits) {
    for (const c of prod.caracteristiques ?? []) {
      if (lignes.some((l) => l.cle === c.cle)) continue;
      lignes.push({
        cle: c.cle,
        libelle: champ(c, "label") || c.cle,
        valeurs: produits.map((q) => {
          const v = (q.caracteristiques ?? []).find((x) => x.cle === c.cle);
          return v ? valeurAvecUnite(v.valeur, v) : null;
        }),
      });
    }
  }
  const marques = produits.map((x) => x.marque?.trim() || null);
  if (marques.some(Boolean)) lignes.unshift({ cle: "_marque", libelle: t.comparaison.marque, valeurs: marques });
  const pareil = (l: Ligne) => l.valeurs.every((v) => v === l.valeurs[0]);
  const sansParam = (slug: string) => {
    const reste = produits.map((x) => x.slug).filter((s) => s !== slug);
    return reste.length ? `/comparer?p=${reste.join(",")}` : "/comparer";
  };

  return (
    <Gabarit>
      <EnteteListe gabarit={cadre.theme.code} fil={[{ nom: t.comparaison.titre }]} titre={t.comparaison.titre} chapo={t.comparaison.chapo} />
      <SuiviComparaison pieces={produits.map((x) => ({ slug: x.slug, nom: champ(x, "nom"), photo: x.images[0]?.chemin ?? null }))} />
      {produits.length < 2 ? (
        <div className="listing-vide cp-vide">
          <h2>{t.comparaison.videTitre}</h2>
          <p>{t.comparaison.videTexte}</p>
          <Link className="btn btn-primaire" href="/catalogue">{t.favoris.catalogue}</Link>
        </div>
      ) : (
        <DifferencesSeules>
          <div className="cp-defile" tabIndex={0} role="region" aria-label={t.comparaison.tableau}>
            <table className="cp-tableau" style={{ "--cp-n": produits.length } as React.CSSProperties}>
              <caption className="sr-only">{t.comparaison.tableau}</caption>
              <thead>
                <tr>
                  <td />
                  {produits.map((x) => {
                    const nom = champ(x, "nom");
                    return (
                      <th key={x.slug} scope="col" className="cp-piece">
                        <Link href={`/produit/${x.slug}`} className="cp-piece-lien">
                          <Photo photo={urlPhoto(x)} ratio="1 / 1" tailles="(min-width: 900px) 18vw, 40vw" />
                          <span className="cp-piece-nom">{nom}</span>
                        </Link>
                        <Link className="cp-retirer" href={sansParam(x.slug)} aria-label={t.comparaison.retirer(nom)}>
                          {t.comparaison.retirerPiece}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{t.comparaison.prix}</th>
                  {produits.map((x) => (
                    <td key={x.slug} className="cp-prix"><PrixCarte classe="prix-carte" produitId={x.id} variantes={x.variantes} fort ttc /></td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">{t.comparaison.stock}</th>
                  {produits.map((x) => (
                    <td key={x.slug}><EtatStock etat={etatProduit(x)} restant={stockTotal(x)} /></td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">{t.comparaison.note}</th>
                  {produits.map((x) => (
                    <td key={x.slug}>
                      {x.note ? (
                        <span className="cp-note"><Etoiles note={x.note.moyenne} taille={14} /> {x.note.moyenne.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} · {t.avis.total(x.note.total)}</span>
                      ) : (
                        <span className="cp-rien">{t.comparaison.sansNote}</span>
                      )}
                    </td>
                  ))}
                </tr>
                {lignes.map((l) => (
                  <tr key={l.cle} data-pareil={pareil(l) ? "" : undefined}>
                    <th scope="row">{l.libelle}</th>
                    {l.valeurs.map((v, i) => <td key={produits[i].slug}>{v ?? <span className="cp-rien" aria-label="non précisé">—</span>}</td>)}
                  </tr>
                ))}
                <tr className="cp-actions">
                  <td />
                  {produits.map((x) => {
                    const nom = champ(x, "nom");
                    const unique = x.variantes.length === 1 ? x.variantes[0] : null;
                    return (
                      <td key={x.slug}>
                        {unique && unique.stock > 0 && unique.stock >= minimumVariante(unique) ? (
                          <AjoutRapide
                            ligne={{
                              varianteId: unique.id,
                              produitSlug: x.slug,
                              sku: unique.sku,
                              libelle: nom,
                              quantite: minimumVariante(unique),
                              prixMillimesAjout: unique.prix_millimes,
                              ...(x.images[0]?.chemin ? { image: x.images[0].chemin } : {}),
                              ...(minimumVariante(unique) > 1 ? { quantiteMin: minimumVariante(unique) } : {}),
                            }}
                            stock={unique.stock}
                            nom={nom}
                            produitId={x.id}
                          />
                        ) : (
                          <Link className="btn btn-second btn-bloc" href={`/produit/${x.slug}`} aria-label={`${t.produit.choisir} — ${nom}`}>
                            {etatProduit(x) === "rupture" ? t.produit.voir : t.produit.choisir}
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </DifferencesSeules>
      )}
    </Gabarit>
  );
}
