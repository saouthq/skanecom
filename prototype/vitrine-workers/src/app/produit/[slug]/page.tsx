import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Entete } from "@/components/Entete";
import { Pied } from "@/components/Pied";
import { Niche } from "@/components/Niche";
import { CarteProduit } from "@/components/CarteProduit";
import { FicheAchat } from "@/components/FicheAchat";
import { FournisseurSelection } from "@/components/SelectionVariante";
import { SpecsVariante } from "@/components/SpecsVariante";
import { Billets, Camion, Fleche, Retour } from "@/components/Icones";
import { chargeCadre } from "@/lib/boutique";
import { chargeCatalogue, chargeProduit, prixDepuis, varianteParDefaut } from "@/lib/catalogue";
import { photosProduit, urlPhoto } from "@/lib/photos";
import { formatePrix, prixDecimal } from "@/lib/prix";
import { champ, t } from "@/lib/i18n";

/* PROTOTYPE SkanEcom — deux changements par rapport à Maymar :
   1. `generateStaticParams` vide : sans lui, une route à segment dynamique
      n'est jamais mise en cache, même avec `revalidate` (règle Next.js,
      reproduite par vinext). La fiche est générée à la première visite puis
      servie depuis le cache.
   2. `revalidate` ramené à 300 s après le test de panne, où il valait 20 s
      (Next.js exige une valeur littérale ici). */
export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const produit = await chargeProduit(slug);
  if (!produit) return {};

  const nom = champ(produit, "nom");
  const prix = prixDepuis(produit);
  const description =
    produit.meta_description_fr ??
    (prix !== null ? t.seo.produitDescription(nom, formatePrix(prix)) : champ(produit, "description"));

  return {
    /* Le titre SEO saisi au backoffice porte déjà « | Maymar » (seed d'Iris) :
       le laisser passer par le gabarit du site produirait « … | Maymar |
       Maymar ». Mesuré sur la fiche valise. */
    title: produit.meta_titre_fr ? { absolute: produit.meta_titre_fr } : nom,
    description,
    alternates: { canonical: `/produit/${slug}` },
    openGraph: { type: "website", title: nom, description },
  };
}

export default async function FicheProduit({ params }: Params) {
  const { slug } = await params;
  const [produit, cadre, tout] = await Promise.all([
    chargeProduit(slug),
    chargeCadre(),
    chargeCatalogue(),
  ]);

  if (!produit) notFound();

  const nom = champ(produit, "nom");
  const rayon = produit.categorie;
  const photos = photosProduit(produit);
  const principale = urlPhoto(produit);
  const variante = varianteParDefaut(produit);


  /* Trois voisins, pas deux : la grille en compte trois par ligne et deux
     cartes y laissaient 40 % de blanc (juge visuel, 11/08). */
  const voisins = tout
    .filter((p) => p.id !== produit.id && (!rayon || p.categorie?.slug === rayon.slug))
    .slice(0, 3);

  /* Données structurées : c'est ce qui fait apparaître le prix et la
     disponibilité dans un résultat Google. Le site est aussi une vitrine de
     démonstration — il doit se TROUVER (PRD §5). */
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
    <>
      <a className="saut-contenu" href="#principal">
        {t.commun.sauterAuContenu}
      </a>
      <Entete categories={cadre.categories} actif={rayon?.slug} />

      <main id="principal" className="enveloppe flex-1">
        <nav className="fil pt-4" aria-label={t.commun.filAriane}>
          <Link href="/">{t.commun.accueil}</Link>
          <Fleche taille={14} className="rtl:-scale-x-100" />
          {rayon ? (
            <>
              <Link href={`/categorie/${rayon.slug}`}>{champ(rayon, "nom")}</Link>
              <Fleche taille={14} className="rtl:-scale-x-100" />
            </>
          ) : null}
          <span aria-current="page" className="text-encre">
            {nom}
          </span>
        </nav>

        <FournisseurSelection produit={produit}>
        <div className="fiche">
          {/* ============================ GALERIE ========================== */}
          <div className="galerie">
            <Niche
              photo={principale}
              /* Sans photo, une niche pleine largeur fait 800 px de vide au
                 milieu de l'écran : on la borne tant qu'elle est en attente. */
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

          {/* ======================= COLONNE DÉCISION ====================== */}
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

            <FicheAchat produit={produit} />

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
                <p>
                  {cadre.livraison.rappel ? t.produit.expeditionAvecRappel : t.produit.expeditionTexte}
                </p>
              </details>
            ) : null}
            <details className="pli">
              <summary>{t.produit.retourEtRefus}</summary>
              <p>{t.produit.retourEtRefusTexte}</p>
            </details>
          </div>
        </div>
        </FournisseurSelection>

        {/* ========================= AUSSI EN BOUTIQUE ====================== */}
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
      </main>

      <Pied categories={cadre.categories} livraison={cadre.livraison} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(donnees) }}
      />
    </>
  );
}
