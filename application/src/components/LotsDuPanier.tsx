"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Coche, Fleche, Plus } from "./Icones";
import { ajouteAuPanier } from "@/lib/panier";
import { prixApplique, usePrixPro } from "@/lib/prix-pro";
import { lotsEntames, seuleDeclinaison, type Lot, type ProduitLot, type ReponseLots } from "@/lib/lots";
import type { LignePanier } from "@/lib/panier-contrat";
import { urlFichier } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";
import { t } from "@/lib/i18n";

/* ============================================================================
   LES PACKS DANS LE TIROIR DU PANIER (module promotions ; « lots » dans le code) — le tiroir lit les
   lots qui comptent ses pièces (/recherche/lots), les applique (lib/lots.ts,
   le calcul de la base) et propose de compléter un lot entamé : la pièce qui
   manque s'ajoute d'un geste si elle n'a qu'une déclinaison, sinon sa fiche
   s'ouvre (on y choisit la taille, et le lot entier s'y ajoute aussi).
   ========================================================================== */

/** Les lots des pièces du panier, relus tant que le tiroir est ouvert. Le
 *  panier change : la réponse d'avant sert le temps de lire la nouvelle. */
export function useLotsDuPanier(slugs: string[], actif: boolean): Lot[] {
  const cle = actif ? [...new Set(slugs)].sort().join(",") : "";
  const [reponse, setReponse] = useState<Lot[] | null>(null);
  useEffect(() => {
    if (!cle) return;
    const arret = new AbortController();
    fetch(`/recherche/lots?slugs=${encodeURIComponent(cle)}`, { signal: arret.signal })
      .then((r) => (r.ok ? (r.json() as Promise<ReponseLots>) : { lots: [] }))
      .then((rep) => setReponse(rep.lots))
      .catch(() => {});
    return () => arret.abort();
  }, [cle]);
  return actif ? reponse ?? [] : [];
}

export function CompleterLots({ lignes, lots, onChoix }: { lignes: LignePanier[]; lots: Lot[]; onChoix: () => void }) {
  const entames = lotsEntames(lignes, lots).slice(0, 2);
  const pro = usePrixPro(entames.flatMap((e) => e.manquent.map((p) => p.id)));
  const [annonce, setAnnonce] = useState("");
  if (entames.length === 0) return null;

  function ajouter(p: ProduitLot) {
    const v = seuleDeclinaison(p);
    if (!v) return;
    const minimum = Math.max(1, v.quantite_min ?? 1);
    const image = v.image ?? p.image;
    ajouteAuPanier(
      {
        varianteId: v.id,
        produitSlug: p.slug,
        sku: v.sku,
        libelle: v.libelle ? `${p.nom} · ${v.libelle}` : p.nom,
        quantite: minimum,
        prixMillimesAjout: prixApplique(pro, { id: v.id, prix_millimes: v.prix_millimes }),
        ...(image ? { image } : {}),
        ...(minimum > 1 ? { quantiteMin: minimum } : {}),
      },
      v.stock,
    );
    setAnnonce(t.ensemble.ajouteAnnonce(p.nom));
  }

  return (
    <>
      <p className="sr-only" aria-live="polite">{annonce}</p>
      {entames.map(({ lot, manquent }) => (
        <section key={lot.id} className="panier-ensemble panier-lot" aria-labelledby={`panier-lot-${lot.id}`}>
          <h3 id={`panier-lot-${lot.id}`} className="panier-ensemble-titre">{t.lots.completer(lot.nom)}</h3>
          <p className="legende panier-lot-texte">
            {t.lots.completerTexte(formatePrix(lot.prix_millimes), formatePrix(lot.valeur_millimes - lot.prix_millimes))}
          </p>
          <ul className="panier-ensemble-liste">
            {manquent.map((p) => {
              const seule = seuleDeclinaison(p);
              return (
                <li key={p.slug} className="panier-ensemble-ligne">
                  <Link href={`/produit/${p.slug}`} className="panier-ensemble-piece" onClick={onChoix}
                        aria-label={seule ? undefined : t.lots.voir(p.nom)}>
                    <span className="panier-ensemble-photo">
                      {p.image ? <Image src={urlFichier(p.image)} alt="" fill sizes="56px" /> : null}
                    </span>
                    <span className="panier-ensemble-texte">
                      <span className="panier-ensemble-nom">{p.nom}</span>
                      <span className="panier-ensemble-prix legende">{formatePrix(p.prix_min_millimes)}</span>
                    </span>
                    {seule ? null : <Fleche taille={14} className="panier-ensemble-fleche rtl:-scale-x-100" />}
                  </Link>
                  {seule ? (
                    <button type="button" className="panier-ensemble-ajout" aria-label={t.ensemble.ajouterNom(p.nom, 1)} onClick={() => ajouter(p)}>
                      <Plus taille={14} />
                      <span>{t.ensemble.ajouter}</span>
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

/** Une ligne du pied du tiroir : le lot réuni, ce qu'il retire. */
export function RemiseLot({ nom, fois, economie }: { nom: string; fois: number; economie: number }) {
  return (
    <div className="panier-lot-remise">
      <span><Coche taille={14} /> {t.lots.ligne(nom, fois)}</span>
      <span className="tabular-nums">−{formatePrix(economie)}</span>
    </div>
  );
}
