"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { Coche, Plus } from "./Icones";
import { Prix } from "./Prix";
import { ajouteAuPanier, annonceAjout } from "@/lib/panier";
import { prixApplique, usePrixPro } from "@/lib/prix-pro";
import { seuleDeclinaison, type Lot } from "@/lib/lots";
import { urlFichier } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";
import { t } from "@/lib/i18n";

/* ============================================================================
   LES LOTS DE LA FICHE (module promotions) — « La tenue du week-end : la
   chemise et les mocassins, 359,000 au lieu de 408,000 ». Chaque pièce du
   lot, sa photo, sa taille à choisir quand elle en a plusieurs ; le prix du
   lot face aux pièces achetées une à une (celles choisies, sinon au plus
   bas) ; « Ajouter le lot au panier » pose chaque pièce, et le panier
   applique le lot (la base le recalcule à la commande).
   ========================================================================== */

export function OffresLot({ lots }: { lots: Lot[] }) {
  const pro = usePrixPro([...new Set(lots.flatMap((l) => l.produits.map((p) => p.id)))]);
  return (
    <div className="lots">
      {lots.map((lot) => <CarteLot key={lot.id} lot={lot} pro={pro} />)}
    </div>
  );
}

function CarteLot({ lot, pro }: { lot: Lot; pro: ReturnType<typeof usePrixPro> }) {
  // Le choix de chaque pièce : sa seule déclinaison en stock, sinon celle qu'on choisit.
  const [choix, setChoix] = useState<Record<string, string>>(() =>
    Object.fromEntries(lot.produits.flatMap((p) => {
      const v = seuleDeclinaison(p);
      return v ? [[p.slug, v.id]] : [];
    })),
  );
  const [manque, setManque] = useState<string | null>(null);
  const [ajoute, setAjoute] = useState(false);

  const declinaison = (slug: string) => {
    const p = lot.produits.find((x) => x.slug === slug)!;
    return p.variantes.find((v) => v.id === choix[slug]) ?? null;
  };
  const prixDe = (v: { id: string; prix_millimes: number }) => prixApplique(pro, v);
  // Les pièces une à une : celles choisies, sinon au plus bas (prix pro compris).
  const valeur = lot.produits.reduce((s, p) => {
    const v = declinaison(p.slug);
    return s + (v ? prixDe(v) : Math.min(...p.variantes.map(prixDe)));
  }, 0);
  const economie = valeur - lot.prix_millimes;
  const epuise = lot.produits.some((p) => !p.variantes.some((v) => v.stock >= Math.max(1, v.quantite_min ?? 1)));
  // Un prix pro déjà plus bas que le lot : le lot n'a rien à offrir.
  if (economie <= 0) return null;

  function ajouter(e: MouseEvent<HTMLButtonElement>) {
    const sans = lot.produits.find((p) => !choix[p.slug]);
    if (sans) {
      setManque(sans.slug);
      document.getElementById(`lot-${lot.id}-${sans.slug}`)?.focus();
      return;
    }
    setManque(null);
    for (const p of lot.produits) {
      const v = declinaison(p.slug)!;
      const minimum = Math.max(1, v.quantite_min ?? 1);
      const image = v.image ?? p.image;
      ajouteAuPanier(
        {
          varianteId: v.id,
          produitSlug: p.slug,
          sku: v.sku,
          libelle: v.libelle ? `${p.nom} · ${v.libelle}` : p.nom,
          quantite: minimum,
          prixMillimesAjout: prixDe(v),
          ...(image ? { image } : {}),
          ...(minimum > 1 ? { quantiteMin: minimum } : {}),
        },
        v.stock,
      );
    }
    setAjoute(true);
    const bouton = e.currentTarget;
    const premiere = lot.produits[0];
    annonceAjout({
      libelle: lot.nom,
      quantite: lot.produits.length,
      prixMillimes: lot.prix_millimes,
      ...(premiere.image ? { image: premiere.image } : {}),
      depuis: bouton.closest(".lot-carte")?.querySelector(".lot-piece-photo") ?? bouton,
      bouton,
      auClavier: e.detail === 0,
    });
  }

  return (
    <article className="lot-carte" aria-labelledby={`lot-${lot.id}-titre`}>
      <ul className="lot-pieces" role="list">
        {lot.produits.map((p, i) => {
          const v = declinaison(p.slug);
          const image = v?.image ?? p.image;
          return (
            <li key={p.slug} className="lot-piece">
              {i > 0 ? <span className="lot-plus" aria-hidden="true"><Plus taille={14} /></span> : null}
              <Link href={`/produit/${p.slug}`} className="lot-piece-photo" tabIndex={-1} aria-hidden="true">
                {image ? <Image src={urlFichier(image)} alt="" fill sizes="(max-width: 640px) 40vw, 160px" /> : null}
              </Link>
              <Link href={`/produit/${p.slug}`} className="lot-piece-nom">{p.nom}</Link>
              <span className="lot-piece-prix legende tabular-nums">{formatePrix(v ? prixDe(v) : Math.min(...p.variantes.map(prixDe)))}</span>
              {p.variantes.length > 1 ? (
                <label className="lot-piece-choix">
                  <span className="sr-only">{t.lots.choisir(p.nom)}</span>
                  <select id={`lot-${lot.id}-${p.slug}`} value={choix[p.slug] ?? ""} aria-invalid={manque === p.slug || undefined}
                          aria-describedby={manque === p.slug ? `lot-${lot.id}-manque` : undefined}
                          onChange={(e) => {
                            setChoix((c) => ({ ...c, [p.slug]: e.target.value }));
                            setManque(null);
                            setAjoute(false);
                          }}>
                    <option value="" disabled>{t.lots.choisirOption}</option>
                    {p.variantes.map((x) => {
                      const dispo = x.stock >= Math.max(1, x.quantite_min ?? 1);
                      return (
                        <option key={x.id} value={x.id} disabled={!dispo}>
                          {x.libelle ?? x.sku}{dispo ? "" : ` — ${t.lots.epuisee}`}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="lot-achat">
        <p className="etiquette">{t.lots.titre}</p>
        <h3 id={`lot-${lot.id}-titre`}>{lot.nom}</h3>
        {lot.accroche ? <p className="lot-accroche">{lot.accroche}</p> : null}
        <p className="lot-prix">
          <Prix millimes={lot.prix_millimes} fort />
          <span className="lot-au-lieu">{t.lots.auLieuDe} <s className="prix-barre">{formatePrix(valeur)}</s></span>
        </p>
        <p className="lot-economie">{t.lots.economie(formatePrix(economie))}</p>
        {epuise ? (
          <p className="legende">{t.lots.epuise}</p>
        ) : (
          <button type="button" className="btn btn-primaire btn-bloc lot-ajouter" onClick={ajouter}>
            {ajoute ? <Coche taille={16} /> : null}
            {ajoute ? t.lots.ajoute : t.lots.ajouter}
          </button>
        )}
        {manque ? (
          <p id={`lot-${lot.id}-manque`} className="lot-manque" role="alert">
            {t.lots.choisir(lot.produits.find((p) => p.slug === manque)!.nom)}
          </p>
        ) : null}
      </div>
    </article>
  );
}
