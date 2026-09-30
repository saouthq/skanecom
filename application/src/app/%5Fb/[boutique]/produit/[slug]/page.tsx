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
import { AvisProduit, ResumeAvis } from "@/components/AvisProduit";
import { Billets, Bouclier, Bulle, Camion, Magasin, Retour, Telephone } from "@/components/Icones";
import { cadre as chargeCadre, type Cadre } from "@/lib/boutique";
import { chargeProduit, listeProduits, prixDepuis, type Produit } from "@/lib/catalogue";
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

/** Ce qui rassure, ligne à ligne — chaque ligne vient d'un réglage réel. */
function rassurances(cadre: Cadre) {
  return [
    cadre.retrait
      ? { cle: "retrait", icone: <Magasin />, titre: t.produit.retraitMagasin, texte: t.produit.retraitMagasinTexte(cadre.retrait.ville, t.commande.pretSous(cadre.retrait.delai_heures)) }
      : null,
    cadre.livraison.delai ? { cle: "livraison", icone: <Camion />, titre: cadre.livraison.delai, texte: cadre.livraison.frais ?? "" } : null,
    cadre.livraison.cod
      ? { cle: "cod", icone: <Billets />, titre: t.produit.payezALaLivraison, texte: t.produit.payezALaLivraisonTexte }
      : null,
    cadre.livraison.cod && cadre.livraison.rappel
      ? { cle: "rappel", icone: <Telephone />, titre: t.produit.confirmationTelephonique, texte: t.produit.confirmationTelephoniqueTexte }
      : null,
    cadre.sav?.garantieMois
      ? { cle: "garantie", icone: <Bouclier />, titre: t.annonce.garantie(cadre.sav.garantieMois), texte: t.sav.garantieTexte }
      : null,
    { cle: "refus", icone: <Retour />, titre: t.produit.refusPossible, texte: t.produit.refusPossibleTexte },
  ].filter((r) => r !== null);
}

export default async function FicheProduit({ params }: Params) {
  const { boutique, slug } = await params;
  const cadre = await chargeCadre(boutique);
  const produit = await chargeProduit(cadre.boutique.id, slug);
  if (!produit) notFound();

  const nom = champ(produit, "nom");
  const rayon = produit.categorie;
  const gabarit = cadre.theme.code;

  /* Des voisins du même rayon, pris par la base ; les avis publiés (module avis). */
  const [liste, avis] = await Promise.all([
    listeProduits(cadre.boutique.id, rayon ? { rayon: rayon.slug } : {}, "selection", 1, gabarit === "technique" ? 6 : 5),
    cadre.avis ? chargeAvis(cadre.boutique.id, produit.id) : Promise.resolve(null),
  ]);
  const voisins = liste.produits.filter((p) => p.id !== produit.id).slice(0, gabarit === "technique" ? 5 : 4);
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
        <FicheTechnique cadre={cadre} produit={produit} fil={fil} avis={avis} />
      ) : (
        <FicheEditoriale cadre={cadre} produit={produit} fil={fil} avis={avis} />
      )}

      <AvisProduit
        avis={avis}
        section={gabarit === "technique" ? "te-section" : "enveloppe ed-section"}
        tete={gabarit === "technique" ? "te-section-tete" : "ed-section-tete"}
      />

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

function FicheEditoriale({ cadre, produit, fil, avis }: { cadre: Cadre; produit: Produit; fil: Etape[]; avis: Avis | null }) {
  const origine = texte(cadre.theme.textes, "origine") || undefined;
  const politiqueRetour = texte(cadre.theme.textes, "politique_retour");
  const description = champ(produit, "description");
  const lignes = rassurances(cadre).filter((r) => r.cle !== "rappel").slice(0, 3);

  return (
    <FournisseurSelection produit={produit}>
      <div className="ed-fiche">
        <GalerieEditoriale photos={photosProduit(produit)} nom={champ(produit, "nom")} />

        <div className="ed-fiche-panneau">
          <div className="ed-fiche-collant">
            <FilAriane etapes={fil} />
            {produit.marque ? <p className="etiquette">{produit.marque}</p> : null}
            <h1>{champ(produit, "nom")}</h1>
            <ResumeAvis avis={avis} />
            <FicheAchat produit={produit} gabarit="editorial" prixBarres={cadre.prixBarres} delaiJours={cadre.livraison.delaiJours} achatExpress={cadre.achatExpress} />

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

function FicheTechnique({ cadre, produit, fil, avis }: { cadre: Cadre; produit: Produit; fil: Etape[]; avis: Avis | null }) {
  const conseil = lienConseil(cadre);
  const description = champ(produit, "description");
  const rayon = produit.categorie ? champ(produit.categorie, "nom") : null;

  return (
    <FournisseurSelection produit={produit}>
      <FilAriane etapes={fil} />
      <div className="te-fiche">
        <GalerieVignettes photos={photosProduit(produit)} />

        <div className="te-fiche-achat">
          {produit.marque ? <p className="te-fiche-marque">{produit.marque}</p> : null}
          <h1>{champ(produit, "nom")}</h1>
          <ResumeAvis avis={avis} />
          <SpecsVariante mode="ref" />
          <FicheAchat produit={produit} gabarit="technique" prixBarres={cadre.prixBarres} delaiJours={cadre.livraison.delaiJours} achatExpress={cadre.achatExpress} />

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
        <section>
          <h2>{t.produit.caracteristiques}</h2>
          <SpecsVariante marque={produit.marque} rayon={rayon} />
        </section>
      </div>
    </FournisseurSelection>
  );
}
