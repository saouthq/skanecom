import Link from "next/link";
import { Photo } from "./Photo";
import { FicheAchat } from "./FicheAchat";
import { contactVente } from "./ContactProduit";
import { FournisseurSelection } from "./SelectionVariante";
import { Fleche } from "./Icones";
import { photosProduit } from "@/lib/photos";
import { champ, t } from "@/lib/i18n";
import { texte, type CodeTheme, type Section } from "@/lib/theme";
import { paiementsDe, type Cadre } from "@/lib/boutique";
import type { Produit } from "@/lib/catalogue";

/* ============================================================================
   LA PIÈCE DE LA SAISON — un produit en grand, achetable depuis l'accueil :
   ses photos, le texte de la boutique (à défaut, la description du produit),
   et le bloc d'achat de sa fiche (déclinaisons, quantité, panier ; au
   téléphone, la barre d'achat collante une fois le bloc passé). Une seule
   par accueil (la base y veille).
   ========================================================================== */

export function PieceSaison({ rang, section, produit, cadre, gabarit = "editorial" }: {
  rang: number;
  section: Extract<Section, { type: "piece" }>;
  produit: Produit;
  cadre: Cadre;
  gabarit?: CodeTheme;
}) {
  const nom = champ(produit, "nom");
  const etiquette = texte(section.textes, "etiquette", t.accueil.pieceEtiquette);
  const titre = texte(section.textes, "titre", nom);
  const corps = texte(section.textes, "texte") || champ(produit, "description");
  const photos = photosProduit(produit).slice(0, 3);

  return (
    <section className="enveloppe ps" data-section={rang}>
      <FournisseurSelection produit={produit}>
        {/* data-fiche : l'envol vers le panier part de ces photos. */}
        <div className="ps-grille" data-fiche={produit.slug}>
          <div className="ps-photos" data-n={photos.length}>
            {photos.map((p, i) => (
              <Photo key={p.src} photo={p} ratio={i === 0 ? "4 / 5" : "1 / 1"} nom={nom}
                tailles={i === 0 ? "(min-width: 900px) 34vw, 100vw" : "(min-width: 900px) 17vw, 50vw"} />
            ))}
          </div>
          <div className="ps-texte">
            <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p>
            <h2 key={titre} data-texte="titre">{titre}</h2>
            {corps ? <p className="ps-corps" key={corps} data-texte="texte">{corps}</p> : null}
            <FicheAchat produit={produit} gabarit={gabarit} prixBarres={cadre.prixBarres} delaiJours={cadre.livraison.delaiJours}
              achatExpress={cadre.achatExpress} prevenirRetour={cadre.prevenirRetour} paiement={paiementsDe(cadre)} contact={cadre.siteVitrine ? contactVente(cadre) : null} />
            <Link className="lien-souligne ps-fiche" href={`/produit/${produit.slug}`}>
              {t.accueil.voirLaFiche} <Fleche taille={14} className="rtl:-scale-x-100" />
            </Link>
          </div>
        </div>
      </FournisseurSelection>
    </section>
  );
}
