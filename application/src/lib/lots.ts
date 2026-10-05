import { totalLigne, type LignePanier } from "./panier-contrat";

/* ============================================================================
   LES LOTS (module promotions, migration 86) — « la chemise et les
   mocassins, 359 DT au lieu de 408 ». Ce que la vitrine en lit
   (public.vitrine_lots : la fiche, le tiroir), et leur calcul dans le
   tiroir, le même que celui de la base (private.chiffre_commande) : pour
   chaque produit du lot, la déclinaison la moins chère du panier, autant de
   fois que le panier réunit le lot ; seulement s'il fait payer moins ;
   jamais sur une ligne au prix par quantité. La page de commande relit tout
   en base : ce calcul n'est qu'une copie d'affichage.
   ========================================================================== */

export type DeclinaisonLot = {
  id: string;
  sku: string;
  prix_millimes: number;
  stock: number;
  quantite_min: number | null;
  image: string | null;
  libelle: string | null;
};

export type ProduitLot = {
  id: string;
  slug: string;
  nom: string;
  image: string | null;
  prix_min_millimes: number;
  variantes: DeclinaisonLot[];
};

export type Lot = {
  id: string;
  nom: string;
  accroche: string | null;
  prix_millimes: number;
  /** Ses produits au plus bas, achetés un à un. */
  valeur_millimes: number;
  produits: ProduitLot[];
};

export type ReponseLots = { lots: Lot[] };

export type LotApplique = { id: string; nom: string; fois: number; economieMillimes: number };

/** Les lots que le panier réunit, et ce qu'ils font économiser. */
export function appliqueLots(lignes: LignePanier[], lots: Lot[]): { lots: LotApplique[]; economieMillimes: number } {
  const reste = lignes.map((l) => (totalLigne(l).palier ? 0 : l.quantite));
  const appliques: LotApplique[] = [];
  let total = 0;
  for (const lot of lots) {
    const slugs = lot.produits.map((p) => p.slug);
    if (slugs.length < 2 || !slugs.every((s) => lignes.some((l) => l.produitSlug === s))) continue;
    let fois = 0;
    let economie = 0;
    for (;;) {
      const choix: number[] = [];
      let somme = 0;
      for (const s of slugs) {
        let k = -1;
        lignes.forEach((l, j) => {
          if (reste[j] > 0 && l.produitSlug === s && (k < 0 || l.prixMillimesAjout < lignes[k].prixMillimesAjout)) k = j;
        });
        if (k < 0) break;
        choix.push(k);
        somme += lignes[k].prixMillimesAjout;
        reste[k] -= 1;
      }
      if (choix.length < slugs.length) {
        for (const k of choix) reste[k] += 1;
        break;
      }
      const e = somme - lot.prix_millimes;
      if (e > 0) {
        fois += 1;
        economie += e;
      }
    }
    if (fois > 0) {
      appliques.push({ id: lot.id, nom: lot.nom, fois, economieMillimes: economie });
      total += economie;
    }
  }
  return { lots: appliques, economieMillimes: total };
}

/** Les lots entamés : le panier a l'un de leurs produits, pas tous. Ce qui
 *  manque, pour le proposer (« Ajoutez les mocassins : … »). */
export function lotsEntames(lignes: LignePanier[], lots: Lot[]): { lot: Lot; manquent: ProduitLot[] }[] {
  const presents = new Set(lignes.map((l) => l.produitSlug));
  return lots
    .map((lot) => ({ lot, manquent: lot.produits.filter((p) => !presents.has(p.slug)) }))
    .filter((x) => x.manquent.length > 0 && x.manquent.length < x.lot.produits.length);
}

/** La déclinaison qu'on peut prendre sans choisir : la seule en stock (assez pour son minimum). */
export function seuleDeclinaison(p: ProduitLot): DeclinaisonLot | null {
  const enStock = p.variantes.filter((v) => v.stock >= Math.max(1, v.quantite_min ?? 1));
  return p.variantes.length === 1 && enStock.length === 1 ? enStock[0] : null;
}
