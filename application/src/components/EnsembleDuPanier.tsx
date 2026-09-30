"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Fleche } from "./Icones";
import { PrixCarte } from "./PrixCarte";
import { t } from "@/lib/i18n";
import type { ProduitVu, ReponseVus } from "@/lib/suggestions";

/* ============================================================================
   « SOUVENT ACHETÉS AVEC » dans le tiroir du panier (réglage
   catalogue.achetes_ensemble) : trois pièces au plus, que les commandes de
   la boutique réunissent avec celles du panier ; un lien vers leur fiche
   (on y choisit sa taille). Rien d'affiché s'il n'y a rien à proposer.
   ========================================================================== */

export function EnsembleDuPanier({ slugs, onChoix }: { slugs: string[]; onChoix: () => void }) {
  const cle = [...new Set(slugs)].sort().join(",");
  const [reponse, setReponse] = useState<{ cle: string; produits: ProduitVu[] } | null>(null);

  useEffect(() => {
    if (!cle) return;
    const arret = new AbortController();
    fetch(`/recherche/ensemble?slugs=${encodeURIComponent(cle)}`, { signal: arret.signal })
      .then((r) => (r.ok ? (r.json() as Promise<ReponseVus>) : { produits: [] }))
      .then((rep) => setReponse({ cle, produits: rep.produits }))
      .catch(() => {});
    return () => arret.abort();
  }, [cle]);

  const produits = reponse && reponse.cle === cle ? reponse.produits : [];
  if (produits.length === 0) return null;
  return (
    <section className="panier-ensemble" aria-labelledby="panier-ensemble-titre">
      <h3 id="panier-ensemble-titre" className="panier-ensemble-titre">{t.ensemble.panierTitre}</h3>
      <ul className="panier-ensemble-liste">
        {produits.map((p) => (
          <li key={p.id}>
            <Link href={`/produit/${p.slug}`} className="panier-ensemble-piece" onClick={onChoix}>
              <span className="panier-ensemble-photo">
                {p.photo ? <Image src={p.photo} alt="" fill sizes="56px" /> : null}
              </span>
              <span className="panier-ensemble-texte">
                <span className="panier-ensemble-nom">{p.nom}</span>
                <PrixCarte classe="panier-ensemble-prix" produitId={p.id} variantes={p.variantes} />
              </span>
              <Fleche taille={14} className="panier-ensemble-fleche rtl:-scale-x-100" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
