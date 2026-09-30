import Link from "next/link";
import { Photo } from "./Photo";
import { EtatStock } from "./EtatStock";
import { AjoutRapide } from "./AjoutRapide";
import { PrixCarte } from "./PrixCarte";
import { couleurDeColoris } from "@/lib/coloris";
import { champ, t } from "@/lib/i18n";
import { photoSurvol, urlPhoto } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";
import { valeurAvecUnite } from "@/lib/caracteristiques";
import {
  coloris as colorisDe,
  etatProduit,
  minimumVariante,
  prixDepuis,
  stockTotal,
  valeursAxe,
  type Produit,
} from "@/lib/catalogue";
import type { CodeTheme } from "@/lib/theme";

/* ============================================================================
   CARTE PRODUIT — l'unité de toutes les grilles, une par gabarit.

   · ÉDITORIALE : la photo d'abord (4:5, la deuxième au survol), le nom et le
     prix en petit, les coloris en pastilles. Rien d'autre : l'image vend.
   · TECHNIQUE : la fiche en miniature — marque, nom, référence, stock CHIFFRÉ,
     prix TTC, et l'ajout direct quand il n'y a qu'une déclinaison.

   Tout ce qu'elle affiche est CALCULÉ depuis les variantes : prix le plus bas
   (jamais un champ d'affichage qui dérive), nombre de coloris et de tailles,
   état du stock. Aucun nombre n'est écrit à la main.
   ========================================================================== */

type Props = {
  produit: Produit;
  gabarit: CodeTheme;
  tailles?: string;
  /** Réglage `catalogue.afficher_prix_barres` de la boutique. */
  prixBarres?: boolean;
  /** Priorité de chargement : les premières cartes visibles seulement. */
  prioritaire?: boolean;
};

/** Le plus fort écart prix barré / prix parmi les variantes, en %. */
function remise(produit: Produit): number | null {
  let meilleure = 0;
  for (const v of produit.variantes) {
    if (v.prix_barre_millimes && v.prix_barre_millimes > v.prix_millimes) {
      meilleure = Math.max(meilleure, Math.round((1 - v.prix_millimes / v.prix_barre_millimes) * 100));
    }
  }
  return meilleure > 0 ? meilleure : null;
}

/** « 3 tailles · 2 versions » : les axes autres que la couleur, résumés. */
function declinaisons(produit: Produit): string[] {
  return produit.options
    .filter((axe) => axe.cle !== "couleur")
    .map((axe) => {
      const n = valeursAxe(produit, axe.cle).length;
      return n > 1 ? `${n} ${champ(axe, "label").toLowerCase()}s` : null;
    })
    .filter((d): d is string => d !== null);
}

export function CarteProduit(props: Props) {
  return props.gabarit === "technique" ? <CarteTechnique {...props} /> : <CarteEditoriale {...props} />;
}

function CarteEditoriale({ produit, tailles, prixBarres = false, prioritaire = false }: Props) {
  const prix = prixDepuis(produit);
  const etat = etatProduit(produit);
  const couleurs = colorisDe(produit);
  const reduction = prixBarres ? remise(produit) : null;
  const marqueur =
    etat === "rupture" ? t.stock.epuise : etat === "faible" ? t.stock.faible(stockTotal(produit)) : reduction ? `−${reduction} %` : null;
  const autres = declinaisons(produit);

  return (
    <Link className="ed-carte" href={`/produit/${produit.slug}`}>
      <Photo
        photo={urlPhoto(produit)}
        survol={photoSurvol(produit)}
        tailles={tailles ?? "(min-width: 1100px) 24vw, (min-width: 700px) 32vw, 48vw"}
        prioritaire={prioritaire}
        nom={champ(produit, "nom")}
      >
        {marqueur ? <span className="ed-marqueur" data-etat={etat}>{marqueur}</span> : null}
      </Photo>
      <span className="ed-carte-corps">
        <span className="ed-carte-ligne">
          <h3 className="ed-carte-nom">{champ(produit, "nom")}</h3>
          {prix !== null ? <PrixCarte classe="ed-carte-prix" produitId={produit.id} variantes={produit.variantes} /> : null}
        </span>
        {couleurs.length > 1 ? (
          <span className="ed-coloris" aria-label={couleurs.join(", ")}>
            {couleurs.slice(0, 5).map((c) => (
              <i key={c} style={{ background: couleurDeColoris(c) }} aria-hidden="true" />
            ))}
            {couleurs.length > 5 ? <span aria-hidden="true">+{couleurs.length - 5}</span> : null}
          </span>
        ) : couleurs.length === 1 || autres.length > 0 ? (
          <span className="ed-carte-detail">{[couleurs[0], ...autres].filter(Boolean).join(" · ")}</span>
        ) : null}
      </span>
    </Link>
  );
}

function CarteTechnique({ produit, tailles, prixBarres = false, prioritaire = false }: Props) {
  const prix = prixDepuis(produit);
  const etat = etatProduit(produit);
  const restant = stockTotal(produit);
  const reduction = prixBarres ? remise(produit) : null;
  const unique = produit.variantes.length === 1 ? produit.variantes[0] : null;
  const photo = urlPhoto(produit);
  const nom = champ(produit, "nom");
  const autres = declinaisons(produit);
  const couleurs = colorisDe(produit);
  const prixBarre = unique && prixBarres && unique.prix_barre_millimes ? unique.prix_barre_millimes : null;
  // Les caractéristiques que la boutique montre sur la carte (B9) : l'alimentation, la plateforme de batterie…
  const pastilles = (produit.caracteristiques ?? []).filter((c) => c.en_carte).slice(0, 3);

  return (
    <article className="te-carte">
      <Link className="te-carte-lien" href={`/produit/${produit.slug}`}>
        <Photo photo={photo} ratio="1 / 1" tailles={tailles ?? "(min-width: 1100px) 20vw, (min-width: 700px) 30vw, 48vw"} prioritaire={prioritaire}>
          {reduction ? <span className="te-remise">−{reduction} %</span> : null}
        </Photo>
        {produit.marque ? <span className="te-carte-marque">{produit.marque}</span> : null}
        <h3 className="te-carte-nom">{nom}</h3>
        <span className="te-carte-ref">
          {unique ? (
            <>
              {t.produit.refCourte} <bdi>{unique.sku}</bdi>
            </>
          ) : (
            [couleurs.length > 1 ? t.catalogue.colorisN(couleurs.length) : null, ...autres].filter(Boolean).join(" · ") ||
            t.produit.declinaisons
          )}
        </span>
        {pastilles.length ? (
          <span className="te-pastilles">
            {pastilles.map((c) => <span key={c.cle} className="te-pastille">{valeurAvecUnite(c.valeur, c)}</span>)}
          </span>
        ) : null}
      </Link>
      <div className="te-carte-bas">
        <EtatStock etat={etat} restant={restant} />
        {prix !== null ? (
          <p className="te-carte-prix">
            <PrixCarte classe="prix-carte" produitId={produit.id} variantes={produit.variantes} fort ttc />
            {prixBarre ? <s className="prix-barre">{formatePrix(prixBarre)}</s> : null}
          </p>
        ) : null}
        {unique && unique.stock > 0 && unique.stock >= minimumVariante(unique) ? (
          <AjoutRapide
            ligne={{
              varianteId: unique.id,
              produitSlug: produit.slug,
              sku: unique.sku,
              libelle: nom,
              // Des vis par dix : un clic en ajoute dix, le minimum.
              quantite: minimumVariante(unique),
              prixMillimesAjout: unique.prix_millimes,
              ...(produit.images[0]?.chemin ? { image: produit.images[0].chemin } : {}),
              ...(minimumVariante(unique) > 1 ? { quantiteMin: minimumVariante(unique) } : {}),
            }}
            stock={unique.stock}
            nom={nom}
            produitId={produit.id}
          />
        ) : (
          <Link className="btn btn-second btn-bloc te-carte-choisir" href={`/produit/${produit.slug}`} aria-label={`${t.produit.choisir} — ${nom}`}>
            {etat === "rupture" ? t.produit.voir : t.produit.choisir}
          </Link>
        )}
      </div>
    </article>
  );
}
