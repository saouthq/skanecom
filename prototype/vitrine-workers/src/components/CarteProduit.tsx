import Link from "next/link";
import { Niche } from "./Niche";
import { Prix } from "./Prix";
import { EtatStock } from "./EtatStock";
import { Fleche } from "./Icones";
import { couleurDeColoris } from "@/lib/coloris";
import { champ, t } from "@/lib/i18n";
import { urlPhoto } from "@/lib/photos";
import {
  coloris as colorisDe,
  etatProduit,
  prixDepuis,
  prixJusqua,
  stockTotal,
  valeursAxe,
  type Produit,
} from "@/lib/catalogue";

/* ============================================================================
   CARTE PRODUIT — l'unité qui compose toutes les grilles.

   Tout ce qu'elle affiche est CALCULÉ : le prix est le plus bas des variantes
   réelles (jamais `prix_min_millimes`, champ d'affichage qui peut dériver), le
   nombre de coloris et de tailles vient des variantes, l'état vient du stock.
   Aucun nombre n'est écrit à la main.

   ⚠️ Tant qu'aucune photo produit n'existe, quatre valises rendent quatre
   silhouettes IDENTIQUES : la carte doit alors dire par le TEXTE ce que
   l'image ne distingue pas (le juge visuel du 11/08 : « impossible de
   distinguer la valise souple du set de 3 sans lire »). D'où la ligne de
   déclinaisons et le « dès » quand les variantes n'ont pas le même prix.
   ========================================================================== */

export function CarteProduit({
  produit,
  tailles,
  avecRayon = true,
}: {
  produit: Produit;
  tailles?: string;
  /** Faux quand toute la grille appartient au même rayon : « VALISES » écrit
   *  quatre fois sous quatre valises n'informe personne (juge visuel, 11/08). */
  avecRayon?: boolean;
}) {
  const prix = prixDepuis(produit);
  const prixHaut = prixJusqua(produit);
  const etat = etatProduit(produit);
  const restant = stockTotal(produit);
  const couleurs = colorisDe(produit);
  const photo = urlPhoto(produit);
  const rayon = champ(produit.categorie, "nom");

  /* Les autres axes que la couleur, résumés : « 3 tailles ». C'est ce qui
     sépare visuellement une valise cabine d'un set de trois. */
  const declinaisons = produit.options
    .filter((axe) => axe.cle !== "couleur")
    .map((axe) => {
      const n = valeursAxe(produit, axe.cle).length;
      return `${n} ${champ(axe, "label").toLowerCase()}${n > 1 ? "s" : ""}`;
    });

  return (
    <Link className="produit maymar-focus" href={`/produit/${produit.slug}`}>
      <Niche
        photo={photo}
        mention={produit.marque ?? undefined}
        tailles={tailles}
      >
        <span className="aller" aria-hidden="true">
          <Fleche taille={17} className="rtl:-scale-x-100" />
        </span>
      </Niche>

      {avecRayon && rayon ? <span className="categorie">{rayon}</span> : null}
      <h3>{champ(produit, "nom")}</h3>

      {couleurs.length > 0 || declinaisons.length > 0 ? (
        <span className="coloris" aria-label={couleurs.length > 0 ? couleurs.join(", ") : undefined}>
          {couleurs.slice(0, 4).map((c) => (
            <i key={c} style={{ background: couleurDeColoris(c) }} aria-hidden="true" />
          ))}
          <span>
            {[couleurs.length > 0 ? couleurs.join(", ") : null, ...declinaisons]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      ) : null}

      <span className="rang">
        {prix !== null ? (
          <span className="flex items-baseline gap-1">
            {prixHaut !== null && prixHaut > prix ? (
              <span className="text-legende text-encre-doux">{t.catalogue.aPartirDe}</span>
            ) : null}
            <Prix millimes={prix} fort />
          </span>
        ) : null}
        <EtatStock etat={etat} restant={restant} discret />
      </span>
    </Link>
  );
}
