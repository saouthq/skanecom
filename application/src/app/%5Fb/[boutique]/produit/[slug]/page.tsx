import { BoutonFavori } from "@/components/BoutonFavori";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gabarit } from "@/components/Gabarit";
import { CarteProduit } from "@/components/CarteProduit";
import { FicheAchat } from "@/components/FicheAchat";
import { FilAriane, type Etape } from "@/components/FilAriane";
import { GalerieEditoriale, GalerieVignettes } from "@/components/Galerie";
import { FournisseurSelection } from "@/components/SelectionVariante";
import { SpecsVariante } from "@/components/SpecsVariante";
import { VusRecemment } from "@/components/VusRecemment";
import { OffresLot } from "@/components/OffresLot";
import { AvisProduit, ResumeAvis } from "@/components/AvisProduit";
import { Bulle } from "@/components/Icones";
import { rassurances } from "@/components/Rassurances";
import { contactVente } from "@/components/ContactProduit";
import { cadre as chargeCadre, type Cadre } from "@/lib/boutique";
import { achetesEnsemble, chargeProduit, listeProduits, lotsDesProduits, prixDepuis, type Produit } from "@/lib/catalogue";
import type { Lot } from "@/lib/lots";
import { photosProduit } from "@/lib/photos";
import { chargeAvis, type AvisProduit as Avis } from "@/lib/avis";
import { formatePrix, prixDecimal } from "@/lib/prix";
import { lienConseil } from "@/lib/faits";
import { texte } from "@/lib/theme";
import { champ, t } from "@/lib/i18n";

/* ============================================================================
   LA FICHE PRODUIT — une par gabarit.

   · ÉDITORIALE : les photos en grand à gauche, le bloc d'achat collant à
     droite, le détail replié en accordéons. On regarde, puis on choisit.
   · TECHNIQUE : galerie à vignettes, bloc d'achat dense (référence, stock
     chiffré, prix TTC), puis description et tableau de caractéristiques
     en clair — ce qu'un artisan vient vérifier.

   Tout ce qui est dit du service (délai, frais, paiement, retrait, conseil)
   vient d'un réglage ou d'un module actif, jamais du code.

   La fiche est générée à la première visite puis servie depuis le cache :
   `generateStaticParams` vide est indispensable, sans lui une route à
   segment dynamique n'est jamais mise en cache.
   ========================================================================== */
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
  const image = photosProduit(produit)[0];

  return {
    // Un titre SEO saisi au backoffice est gardé tel quel, sans le gabarit du
    // site (qui ajouterait une deuxième fois le nom de la boutique).
    title: produit.meta_titre_fr ? { absolute: produit.meta_titre_fr } : nom,
    description,
    alternates: { canonical: `/produit/${slug}` },
    openGraph: { type: "website", title: nom, description, ...(image ? { images: [{ url: image.src, alt: image.alt }] } : {}) },
  };
}

export default async function FicheProduit({ params }: Params) {
  const { boutique, slug } = await params;
  const cadre = await chargeCadre(boutique);
  const produit = await chargeProduit(cadre.boutique.id, slug);
  if (!produit) notFound();

  const nom = champ(produit, "nom");
  const rayon = produit.categorie;
  const gabarit = cadre.theme.code;

  /* Des voisins du même rayon, pris par la base ; les avis publiés (module
     avis) ; les pièces que les commandes réunissent avec celle-ci (réglage
     catalogue.achetes_ensemble) — elles ne se répètent pas dans les voisins. */
  const parRang = gabarit === "technique" ? 5 : 4;
  const [liste, avis, ensemble, lots] = await Promise.all([
    listeProduits(cadre.boutique.id, rayon ? { rayon: rayon.slug } : {}, "selection", 1, cadre.achetesEnsemble ? 2 * parRang + 1 : parRang + 1),
    cadre.avis ? chargeAvis(cadre.boutique.id, produit.id) : Promise.resolve(null),
    cadre.achetesEnsemble ? achetesEnsemble(cadre.boutique.id, [produit.slug], parRang) : Promise.resolve([]),
    // Les packs qui la comptent (module promotions ; « lots » dans la base) ; un site vitrine ne vend pas en ligne.
    cadre.promotions && !cadre.siteVitrine ? lotsDesProduits(cadre.boutique.id, [produit.slug]) : Promise.resolve([] as Lot[]),
  ]);
  const dejaProposes = new Set([produit.id, ...ensemble.map((p) => p.id)]);
  const voisins = liste.produits.filter((p) => !dejaProposes.has(p.id)).slice(0, parRang);
  const note = avis && avis.total > 0 && avis.moyenne !== null ? avis : null;

  const fil: Etape[] = [
    ...(rayon ? [{ nom: champ(rayon, "nom"), href: `/categorie/${rayon.slug}` }] : [{ nom: t.commun.toutLeCatalogue, href: "/catalogue" }]),
    { nom },
  ];

  /* Données structurées : ce qui fait apparaître le prix et la disponibilité
     dans un résultat Google. */
  const donnees = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: nom,
    description: champ(produit, "description"),
    image: photosProduit(produit).map((p) => p.src),
    brand: produit.marque ? { "@type": "Brand", name: produit.marque } : undefined,
    category: rayon ? champ(rayon, "nom") : undefined,
    offers: produit.variantes.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      price: prixDecimal(v.prix_millimes),
      priceCurrency: "TND",
      availability: v.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    })),
    // Des avis vérifiés (clients livrés), publiés par la boutique.
    aggregateRating: note ? { "@type": "AggregateRating", ratingValue: note.moyenne, reviewCount: note.total, bestRating: 5, worstRating: 1 } : undefined,
    review: note
      ? note.avis.slice(0, 5).map((a) => ({
          "@type": "Review",
          author: { "@type": "Person", name: a.auteur },
          datePublished: a.cree_le.slice(0, 10),
          reviewRating: { "@type": "Rating", ratingValue: a.note, bestRating: 5, worstRating: 1 },
          ...(a.texte ? { reviewBody: a.texte } : {}),
        }))
      : undefined,
  };

  return (
    <Gabarit className={gabarit === "technique" ? "enveloppe flex-1" : "flex-1"}>
      {gabarit === "technique" ? (
        <FicheTechnique cadre={cadre} produit={produit} fil={fil} avis={avis} lots={lots} />
      ) : (
        <FicheEditoriale cadre={cadre} produit={produit} fil={fil} avis={avis} lots={lots} />
      )}

      {lots.length > 0 ? (
        <section id="fiche-packs" className={`${gabarit === "technique" ? "te-section" : "enveloppe ed-section"} fiche-lots`} aria-labelledby="fiche-lots-titre">
          <div className={gabarit === "technique" ? "te-section-tete" : "ed-section-tete"}>
            <div>
              <h2 id="fiche-lots-titre">{t.lots.titre}</h2>
              <p className="fiche-ensemble-chapo">{t.lots.chapo}</p>
            </div>
          </div>
          <OffresLot lots={lots} />
        </section>
      ) : null}

      <AvisProduit
        avis={avis}
        produitId={produit.id}
        section={gabarit === "technique" ? "te-section" : "enveloppe ed-section"}
        tete={gabarit === "technique" ? "te-section-tete" : "ed-section-tete"}
      />

      {ensemble.length > 0 ? (
        <section className={`${gabarit === "technique" ? "te-section" : "enveloppe ed-section"} fiche-ensemble`} aria-labelledby="fiche-ensemble-titre">
          <div className={gabarit === "technique" ? "te-section-tete" : "ed-section-tete"}>
            <div>
              <h2 id="fiche-ensemble-titre">{t.ensemble.titre}</h2>
              <p className="fiche-ensemble-chapo">{t.ensemble.chapo}</p>
            </div>
          </div>
          <div className={gabarit === "technique" ? "te-grille te-grille-rang" : "ed-grille"}>
            {ensemble.map((p) => (
              <CarteProduit key={p.id} produit={p} gabarit={gabarit} prixBarres={cadre.prixBarres} />
            ))}
          </div>
        </section>
      ) : null}

      {voisins.length > 0 ? (
        <section className={gabarit === "technique" ? "te-section" : "enveloppe ed-section"}>
          <div className={gabarit === "technique" ? "te-section-tete" : "ed-section-tete"}>
            <h2>{gabarit === "technique" ? t.produit.memeRayon : t.produit.vousAimerez}</h2>
            {rayon ? (
              <Link className="lien-souligne" href={`/categorie/${rayon.slug}`}>
                {t.commun.voirLeRayon}
              </Link>
            ) : null}
          </div>
          <div className={gabarit === "technique" ? "te-grille te-grille-rang" : "ed-grille"}>
            {voisins.map((p) => (
              <CarteProduit key={p.id} produit={p} gabarit={gabarit} prixBarres={cadre.prixBarres} />
            ))}
          </div>
        </section>
      ) : null}

      <VusRecemment
        courant={produit.slug}
        section={gabarit === "technique" ? "te-section" : "enveloppe ed-section"}
        tete={gabarit === "technique" ? "te-section-tete" : "ed-section-tete"}
      />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(donnees).replace(/</g, "\\u003c") }} />
    </Gabarit>
  );
}

function FicheEditoriale({ cadre, produit, fil, avis, lots }: { cadre: Cadre; produit: Produit; fil: Etape[]; avis: Avis | null; lots: Lot[] }) {
  const origine = texte(cadre.theme.textes, "origine") || undefined;
  const politiqueRetour = texte(cadre.theme.textes, "politique_retour");
  const description = champ(produit, "description");
  const lignes = rassurances(cadre).filter((r) => r.cle !== "rappel").slice(0, 3);

  return (
    <FournisseurSelection produit={produit}>
      {/* data-fiche : la photo d'une carte y atterrit (TransitionsVue), l'envol vers le panier en part. */}
      <div className="ed-fiche" data-fiche={produit.slug}>
        <GalerieEditoriale photos={photosProduit(produit)} nom={champ(produit, "nom")} />
        {/* Au téléphone, le cœur se pose sur la photo (la rangée d'achat n'a pas la place). */}
        <BoutonFavori slug={produit.slug} nom={champ(produit, "nom")} className="carte-favori fiche-favori-photo" />

        <div className="ed-fiche-panneau">
          <div className="ed-fiche-collant">
            <FilAriane etapes={fil} />
            {produit.marque ? <p className="etiquette">{produit.marque}</p> : null}
            <h1>{champ(produit, "nom")}</h1>
            <ResumeAvis avis={avis} />
            <FicheAchat produit={produit} gabarit="editorial" prixBarres={cadre.prixBarres} delaiJours={cadre.livraison.delaiJours} achatExpress={cadre.achatExpress} prevenirRetour={cadre.prevenirRetour}
            partage={cadre.partage ? { boutique: cadre.boutique.nom } : null} contact={cadre.siteVitrine ? contactVente(cadre) : null} />
            <AppelLot lots={lots} />

            <ul className="ed-rassure">
              {lignes.map((r) => (
                <li key={r.cle}>
                  {r.icone}
                  <span>
                    <b>{r.titre}</b> {r.texte}
                  </span>
                </li>
              ))}
            </ul>

            <div className="plis">
              {description ? (
                <details className="pli" open>
                  <summary>{t.produit.description}</summary>
                  <div>
                    <p>{description}</p>
                  </div>
                </details>
              ) : null}
              <details className="pli">
                <summary>{t.produit.caracteristiques}</summary>
                <div>
                  <SpecsVariante />
                </div>
              </details>
              {cadre.livraison.delai ? (
                <details className="pli">
                  <summary>{t.produit.livraisonEtDelais}</summary>
                  <div>
                    <p>{cadre.livraison.rappel ? t.produit.expeditionAvecRappel(origine) : t.produit.expeditionTexte(origine)}</p>
                  </div>
                </details>
              ) : null}
              <details className="pli">
                <summary>{t.produit.retourEtRefus}</summary>
                <div>
                  <p>{[t.produit.retourEtRefusTexte, politiqueRetour].filter(Boolean).join(" ")}</p>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    </FournisseurSelection>
  );
}

function FicheTechnique({ cadre, produit, fil, avis, lots }: { cadre: Cadre; produit: Produit; fil: Etape[]; avis: Avis | null; lots: Lot[] }) {
  const conseil = lienConseil(cadre);
  const description = champ(produit, "description");
  const rayon = produit.categorie ? champ(produit.categorie, "nom") : null;

  return (
    <FournisseurSelection produit={produit}>
      <FilAriane etapes={fil} />
      <div className="te-fiche" data-fiche={produit.slug}>
        <GalerieVignettes photos={photosProduit(produit)} />
        <BoutonFavori slug={produit.slug} nom={champ(produit, "nom")} className="carte-favori fiche-favori-photo" />

        <div className="te-fiche-achat">
          {produit.marque ? <p className="te-fiche-marque">{produit.marque}</p> : null}
          <h1>{champ(produit, "nom")}</h1>
          <ResumeAvis avis={avis} />
          <SpecsVariante mode="ref" />
          <SpecsVariante mode="cles" />
          <FicheAchat produit={produit} gabarit="technique" prixBarres={cadre.prixBarres} delaiJours={cadre.livraison.delaiJours} achatExpress={cadre.achatExpress} prevenirRetour={cadre.prevenirRetour}
            partage={cadre.partage ? { boutique: cadre.boutique.nom } : null} contact={cadre.siteVitrine ? contactVente(cadre) : null} />
          <AppelLot lots={lots} />

          <ul className="te-rassure">
            {rassurances(cadre).map((r) => (
              <li key={r.cle}>
                {r.icone}
                <span>
                  <b>{r.titre}</b>
                  <span>{r.texte}</span>
                </span>
              </li>
            ))}
          </ul>

          {conseil ? (
            <a className="te-conseil" href={conseil} target="_blank" rel="noopener noreferrer">
              <Bulle taille={22} />
              <span>
                <b>{t.produit.conseil}</b>
                <span>{t.produit.conseilTexte}</span>
              </span>
            </a>
          ) : null}
        </div>
      </div>

      <div className="te-fiche-details">
        {description ? (
          <section>
            <h2>{t.produit.description}</h2>
            <p>{description}</p>
          </section>
        ) : null}
        <section id="caracteristiques">
          <h2>{t.produit.caracteristiques}</h2>
          <SpecsVariante marque={produit.marque} rayon={rayon} />
        </section>
      </div>
    </FournisseurSelection>
  );
}

/** Sous le bloc d'achat : le pack qui compte cette pièce, et le chemin vers lui. */
function AppelLot({ lots }: { lots: Lot[] }) {
  const lot = lots[0];
  if (!lot) return null;
  return (
    <a href="#fiche-packs" className="fiche-appel-lot">
      <span className="etiquette">{t.lots.titre}</span>
      <span>
        <b>{lot.nom}</b> · {formatePrix(lot.prix_millimes)} <s>{formatePrix(lot.valeur_millimes)}</s>
      </span>
    </a>
  );
}
