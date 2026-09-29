import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gabarit } from "@/components/Gabarit";
import { Niche } from "@/components/Niche";
import { CarteProduit } from "@/components/CarteProduit";
import { FicheAchat } from "@/components/FicheAchat";
import { FournisseurSelection } from "@/components/SelectionVariante";
import { SpecsVariante } from "@/components/SpecsVariante";
import { Billets, Camion, Fleche, Retour } from "@/components/Icones";
import { cadre as chargeCadre } from "@/lib/boutique";
import { chargeProduit, listeProduits, prixDepuis } from "@/lib/catalogue";
import { photosProduit, urlPhoto } from "@/lib/photos";
import { formatePrix, prixDecimal } from "@/lib/prix";
import { texte } from "@/lib/theme";
import { champ, t } from "@/lib/i18n";

/* La fiche est générée à la première visite puis servie depuis le cache :
   `generateStaticParams` vide est indispensable, sans lui une route à
   segment dynamique n'est jamais mise en cache (découverte n°1 du
   prototype). */
export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ boutique: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { boutique, slug } = await params;
  const cadre = await chargeCadre(boutique);
  const produit = await chargeProduit(cadre.boutique.id, slug);
  if (!produit) return {};

  const nom = champ(produit, "nom");
  const prix = prixDepuis(produit);
  const description =
    produit.meta_description_fr ??
    (prix !== null ? t.seo.produitDescription(nom, formatePrix(prix)) : champ(produit, "description"));

  return {
    // Un titre SEO saisi au backoffice est gardé tel quel, sans le gabarit du
    // site (qui ajouterait une deuxième fois le nom de la boutique).
    title: produit.meta_titre_fr ? { absolute: produit.meta_titre_fr } : nom,
    description,
    alternates: { canonical: `/produit/${slug}` },
    openGraph: { type: "website", title: nom, description },
  };
}

export default async function FicheProduit({ params }: Params) {
  const { boutique, slug } = await params;
  const cadre = await chargeCadre(boutique);
  const produit = await chargeProduit(cadre.boutique.id, slug);
  if (!produit) notFound();

  const nom = champ(produit, "nom");
  const rayon = produit.categorie;
  const photos = photosProduit(produit);
  const principale = urlPhoto(produit);
  const origine = texte(cadre.theme.textes, "origine") || undefined;
  const politiqueRetour = texte(cadre.theme.textes, "politique_retour");

  /* Trois voisins du même rayon, pris par la base : la grille en compte trois
     par ligne. */
  const voisins = (
    await listeProduits(cadre.boutique.id, rayon ? { rayon: rayon.slug } : {}, "selection", 1, 4)
  ).produits
    .filter((p) => p.id !== produit.id)
    .slice(0, 3);

  /* Données structurées : ce qui fait apparaître le prix et la disponibilité
     dans un résultat Google. */
  const donnees = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: nom,
    description: champ(produit, "description"),
    brand: produit.marque ? { "@type": "Brand", name: produit.marque } : undefined,
    category: rayon ? champ(rayon, "nom") : undefined,
    offers: produit.variantes.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      price: prixDecimal(v.prix_millimes),
      priceCurrency: "TND",
      availability: v.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    })),
  };

  return (
    <Gabarit cadre={cadre} actif={rayon?.slug}>
      <nav className="fil pt-4" aria-label={t.commun.filAriane}>
        <Link href="/">{t.commun.accueil}</Link>
        <Fleche taille={14} className="rtl:-scale-x-100" />
        {rayon ? (
          <>
            <Link href={`/categorie/${rayon.slug}`}>{champ(rayon, "nom")}</Link>
            <Fleche taille={14} className="rtl:-scale-x-100" />
          </>
        ) : null}
        <span aria-current="page" className="text-encre">{nom}</span>
      </nav>

      <FournisseurSelection produit={produit}>
        <div className="fiche">
          <div className="galerie">
            <Niche
              photo={principale}
              /* Sans photo, une niche pleine largeur ferait 800 px de vide. */
              className={principale ? "grande" : "grande max-w-[22rem]"}
              prioritaire
              tailles="(min-width: 1000px) 48vw, 92vw"
            />
            {photos.length > 1 ? (
              <div className="vues" aria-label={t.produit.galerieAria}>
                {photos.slice(0, 3).map((photo) => (
                  <Niche key={photo.src} photo={photo} tailles="16vw" />
                ))}
              </div>
            ) : null}
          </div>

          <div className="decision">
            {rayon ? (
              <p className="etiquette m-0">
                <b>—</b> <span>{champ(rayon, "nom")}</span>
              </p>
            ) : null}
            <h1 className="text-t2 md:text-t1 mt-3">{nom}</h1>

            {produit.marque ? (
              <p className="marque-tierce">
                {t.produit.marque} : <b>{produit.marque}</b>
              </p>
            ) : null}

            <FicheAchat produit={produit} prixBarres={cadre.prixBarres} />

            {/* CE QUI FAIT DÉCIDER — chaque ligne vient d'un réglage réel. */}
            <ul className="rassure">
              {cadre.livraison.delai ? (
                <li>
                  <Camion />
                  <span>
                    <b>{cadre.livraison.delai}</b>
                    <span>{cadre.livraison.frais}</span>
                  </span>
                </li>
              ) : null}
              {cadre.livraison.cod ? (
                <li>
                  <Billets />
                  <span>
                    <b>{t.produit.payezALaLivraison}</b>
                    <span>{t.produit.payezALaLivraisonTexte}</span>
                  </span>
                </li>
              ) : null}
              <li>
                <Retour />
                <span>
                  <b>{t.produit.refusPossible}</b>
                  <span>{t.produit.refusPossibleTexte}</span>
                </span>
              </li>
            </ul>
          </div>

          <div className="detail-galerie">
            <SpecsVariante />

            <details className="pli" open>
              <summary>{t.produit.description}</summary>
              <p>{champ(produit, "description")}</p>
            </details>
            {cadre.livraison.delai ? (
              <details className="pli">
                <summary>{t.produit.livraisonEtDelais}</summary>
                <p>{cadre.livraison.rappel ? t.produit.expeditionAvecRappel(origine) : t.produit.expeditionTexte(origine)}</p>
              </details>
            ) : null}
            <details className="pli">
              <summary>{t.produit.retourEtRefus}</summary>
              <p>{[t.produit.retourEtRefusTexte, politiqueRetour].filter(Boolean).join(" ")}</p>
            </details>
          </div>
        </div>
      </FournisseurSelection>

      {voisins.length > 0 ? (
        <section className="section pt-0">
          <hr className="filet-marque" />
          <div className="mt-6 mb-8">
            <p className="etiquette">
              <b>—</b> <span>{t.produit.aussiEnBoutique}</span>
            </p>
            <h2 className="text-t3 mt-3">{t.produit.aussiEnBoutiqueTitre}</h2>
          </div>
          <div className="grille-produits grille-trois">
            {voisins.map((p) => (
              <CarteProduit key={p.id} produit={p} tailles="(min-width: 700px) 30vw, 92vw" />
            ))}
          </div>
          {rayon ? (
            <p className="mt-8">
              <Link className="btn btn-second" href={`/categorie/${rayon.slug}`}>
                {t.commun.voirLeRayon} — {champ(rayon, "nom")}
                <Fleche taille={18} className="rtl:-scale-x-100" />
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(donnees).replace(/</g, "\\u003c") }} />
    </Gabarit>
  );
}
