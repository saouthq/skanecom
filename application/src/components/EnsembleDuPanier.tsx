"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Coche, Fleche, Plus } from "./Icones";
import { PrixCarte } from "./PrixCarte";
import { ajouteAuPanier } from "@/lib/panier";
import { prixApplique, usePrixPro } from "@/lib/prix-pro";
import { t } from "@/lib/i18n";
import type { ProduitVu, ReponseVus } from "@/lib/suggestions";

/* ============================================================================
   « SOUVENT ACHETÉS AVEC » dans le tiroir du panier (réglage
   catalogue.achetes_ensemble) : trois pièces au plus, que les commandes de
   la boutique réunissent avec celles du panier. Une pièce qui n'a qu'une
   déclinaison en stock s'ajoute d'un geste (« Ajouter ») ; une autre mène à
   sa fiche, où l'on choisit sa taille. Rien d'affiché s'il n'y a rien à
   proposer.

   Tant que le tiroir est ouvert, la liste ne change pas sous le doigt : la
   pièce ajoutée reste à sa place, « Ajouté » (tant qu'elle est au panier),
   le focus sur elle ; elle rejoint les lignes du panier au-dessus. Le
   tiroir rouvert, les suggestions suivent le nouveau panier.
   ========================================================================== */

export function EnsembleDuPanier({ slugs, onChoix }: { slugs: string[]; onChoix: () => void }) {
  const cle = [...new Set(slugs)].sort().join(",");
  const [figee, setFigee] = useState<string | null>(null);
  const lue = figee ?? cle;
  const [reponse, setReponse] = useState<{ cle: string; produits: ProduitVu[] } | null>(null);
  const [annonce, setAnnonce] = useState("");
  // « Ajouté » suit le panier : retirée du panier, la pièce redevient « Ajouter ».
  const dansPanier = new Set(slugs);

  useEffect(() => {
    if (!lue) return;
    const arret = new AbortController();
    fetch(`/recherche/ensemble?slugs=${encodeURIComponent(lue)}`, { signal: arret.signal })
      .then((r) => (r.ok ? (r.json() as Promise<ReponseVus>) : { produits: [] }))
      .then((rep) => setReponse({ cle: lue, produits: rep.produits }))
      .catch(() => {});
    return () => arret.abort();
  }, [lue]);

  const produits = reponse && reponse.cle === lue ? reponse.produits : [];
  const pro = usePrixPro(produits.map((p) => p.id));
  if (produits.length === 0) return null;

  function ajouter(p: ProduitVu) {
    const u = p.unique;
    if (!u) return;
    // La liste reste celle-ci tant que le tiroir est ouvert.
    setFigee(lue);
    ajouteAuPanier(
      {
        varianteId: u.id,
        produitSlug: p.slug,
        sku: u.sku,
        libelle: u.libelle,
        quantite: u.quantite_min,
        prixMillimesAjout: prixApplique(pro, { id: u.id, prix_millimes: u.prix_millimes }),
        ...(u.image ? { image: u.image } : {}),
        ...(u.quantite_min > 1 ? { quantiteMin: u.quantite_min } : {}),
      },
      u.stock,
    );
    setAnnonce(t.ensemble.ajouteAnnonce(p.nom));
  }

  return (
    <section className="panier-ensemble" aria-labelledby="panier-ensemble-titre">
      <h3 id="panier-ensemble-titre" className="panier-ensemble-titre">{t.ensemble.panierTitre}</h3>
      <p className="sr-only" aria-live="polite">{annonce}</p>
      <ul className="panier-ensemble-liste">
        {produits.map((p) => {
          const ajoute = dansPanier.has(p.slug);
          return (
            <li key={p.id} className="panier-ensemble-ligne" data-ajoute={ajoute ? "" : undefined}>
              <Link href={`/produit/${p.slug}`} className="panier-ensemble-piece" onClick={onChoix}
                aria-label={p.unique ? undefined : t.ensemble.choisir(p.nom)}>
                <span className="panier-ensemble-photo">
                  {p.photo ? <Image src={p.photo} alt="" fill sizes="56px" /> : null}
                </span>
                <span className="panier-ensemble-texte">
                  <span className="panier-ensemble-nom">{p.nom}</span>
                  <PrixCarte classe="panier-ensemble-prix" produitId={p.id} variantes={p.variantes} />
                </span>
                {p.unique ? null : <Fleche taille={14} className="panier-ensemble-fleche rtl:-scale-x-100" />}
              </Link>
              {p.unique ? (
                <button
                  type="button"
                  className="panier-ensemble-ajout"
                  aria-label={ajoute ? `${t.ensemble.ajoute} — ${p.nom}` : t.ensemble.ajouterNom(p.nom, p.unique.quantite_min)}
                  aria-disabled={ajoute || undefined}
                  onClick={() => (ajoute ? undefined : ajouter(p))}
                >
                  {ajoute ? <Coche taille={14} /> : <Plus taille={14} />}
                  <span>{ajoute ? t.ensemble.ajoute : p.unique.quantite_min > 1 ? `${t.ensemble.ajouter} ×${p.unique.quantite_min}` : t.ensemble.ajouter}</span>
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
