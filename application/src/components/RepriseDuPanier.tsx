"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { reprendsPanier } from "@/lib/panier";
import { urlFichier } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";

/* ============================================================================
   LE PANIER D'UNE RELANCE, côté navigateur — les pièces gardées par la
   boutique (public.panier_a_reprendre), et « Reprendre ma commande » : elles
   rejoignent le panier de ce navigateur (sans doubler celles qui y sont
   déjà), puis le tunnel s'ouvre. Une pièce qui n'est plus disponible se lit,
   barrée d'un mot ; elle ne revient pas au panier.
   ========================================================================== */

export type LigneReprise = {
  variante_id: string;
  produit_slug: string;
  sku: string;
  produit: string;
  libelle: string | null;
  quantite: number;
  prix_millimes: number;
  stock: number;
  quantite_min: number;
  disponible: boolean;
  image: string | null;
};

export function RepriseDuPanier({ lignes }: { lignes: LigneReprise[] }) {
  const [enCours, setEnCours] = useState(false);
  const routeur = useRouter();
  const disponibles = lignes.filter((l) => l.disponible);

  const reprendre = () => {
    setEnCours(true);
    reprendsPanier(
      disponibles.map((l) => ({
        ligne: {
          varianteId: l.variante_id,
          produitSlug: l.produit_slug,
          sku: l.sku,
          libelle: l.libelle ? `${l.produit} · ${l.libelle}` : l.produit,
          quantite: Math.max(l.quantite, l.quantite_min),
          prixMillimesAjout: l.prix_millimes,
          ...(l.image ? { image: l.image } : {}),
          ...(l.quantite_min > 1 ? { quantiteMin: l.quantite_min } : {}),
        },
        stock: l.stock,
      })),
    );
    routeur.push("/commande");
  };

  return (
    <div className="reprise">
      <ul className="reprise-lignes" role="list">
        {lignes.map((l) => (
          <li key={l.variante_id} className="tunnel-ligne" data-indisponible={l.disponible ? undefined : ""}>
            <span className="tunnel-vignette">
              {l.image ? (
                <Image src={urlFichier(l.image)} alt="" fill sizes="64px" />
              ) : (
                <span className="attente-photo" aria-hidden="true">
                  <span className="filigrane" />
                </span>
              )}
              <span className="tunnel-vignette-n" aria-hidden="true">{l.quantite}</span>
            </span>
            <span className="tunnel-ligne-corps">
              <Link className="tunnel-ligne-nom" href={`/produit/${l.produit_slug}`}>{l.produit}</Link>
              {l.libelle ? <span className="legende">{l.libelle}</span> : null}
              <span className="legende">{t.commande.quantite(l.quantite)}</span>
              {l.disponible ? null : <span className="tunnel-ligne-alerte">{t.reprise.plusDisponible}</span>}
            </span>
            <span className="tunnel-ligne-prix">{l.disponible ? formatePrix(l.prix_millimes * l.quantite) : null}</span>
          </li>
        ))}
      </ul>
      {disponibles.length ? (
        <>
          <button type="button" className="btn btn-primaire btn-bloc" onClick={reprendre} disabled={enCours}>
            {t.reprise.reprendre}
          </button>
          <p className="legende reprise-note">{t.reprise.prixDuJour}</p>
        </>
      ) : (
        <Link className="btn btn-primaire btn-bloc" href="/catalogue">{t.reprise.catalogue}</Link>
      )}
    </div>
  );
}
