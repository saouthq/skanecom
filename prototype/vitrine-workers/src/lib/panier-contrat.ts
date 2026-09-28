/* ============================================================================
   CONTRAT DU PANIER — à valider par Max avant qu'il branche le tunnel

   Décision Luna du 11/08 (question alex-1786406877) : la vitrine pose un
   panier LOCAL pour que le site vende, mais sa forme est un CONTRAT et non un
   détail d'implémentation — c'est Max qui branchera le tunnel dessus. Ce
   fichier est le seul endroit où cette forme est définie. Alex ne le modifie
   plus sans repasser par Emma.

   CE QUE CE PANIER EST :  un brouillon de commande, côté navigateur.
   CE QU'IL N'EST PAS :    une réservation de stock, ni une commande, ni un
                           prix engagé. La réservation de stock existe en base
                           (migration `reservation_stock`) et appartient au
                           tunnel.

   ── LE CAS LIMITE, POSÉ DÈS MAINTENANT ───────────────────────────────────
   Entre l'ajout au panier et l'ouverture du tunnel, une variante peut être
   épuisée, retirée ou changée de prix. En COD tunisien c'est le cas NORMAL,
   pas l'exception (le stock bouge au comptoir). Donc :
     · la ligne stocke le prix vu à l'ajout — pour DÉTECTER un écart, jamais
       pour facturer : le prix dû est TOUJOURS relu en base ;
     · `verifieLignes()` ci-dessous confronte le panier à l'état réel et rend
       un verdict par ligne. Le tunnel s'en sert pour prévenir avant de faire
       saisir une adresse ; la vitrine s'en sert pour le compteur d'en-tête.
   ========================================================================== */

/** Clé de stockage. Elle porte sa version : le jour où la forme change, un
 *  ancien panier n'est pas lu de travers — il est ignoré, pas « migré à la
 *  volée » (une migration silencieuse de données client est intraçable). */
export const PANIER_CLE = "maymar.panier.v1";

export const PANIER_VERSION = 1;

/** Événement émis à chaque écriture, dans l'onglet courant : `storage` ne se
 *  déclenche que dans les AUTRES onglets. Sans lui, le compteur d'en-tête ne
 *  bougerait pas après un ajout. */
export const PANIER_EVENEMENT = "maymar:panier";

export type LignePanier = {
  /** L'unité vendue, stockée et facturée : `variantes.id` (schéma Iris).
   *  C'est la clé d'unicité d'une ligne — jamais le produit. */
  varianteId: string;
  /** Reconstruire un lien vers la fiche sans requête. */
  produitSlug: string;
  /** Lisible par un humain sur un bordereau (`variantes.sku`). */
  sku: string;
  /** COPIE D'AFFICHAGE — « Valise rigide ABS 4 roues · Cabine 55 cm, Noir ».
   *  Permet d'afficher le panier sans requête. Ce n'est JAMAIS une source de
   *  vérité : au moindre écart, la base gagne. */
  libelle: string;
  quantite: number;
  /** Prix vu par le client à l'ajout, en MILLIMES. Sert à détecter un écart,
   *  jamais à facturer. */
  prixMillimesAjout: number;
  /** ISO 8601. Sert au tunnel pour périmer un panier trop vieux s'il le veut. */
  ajouteLe: string;
};

export type Panier = {
  version: number;
  lignes: LignePanier[];
  majLe: string;
};

export const PANIER_VIDE: Panier = { version: PANIER_VERSION, lignes: [], majLe: "" };

/** État réel d'une variante, tel que le tunnel ou la vitrine le relit en base. */
export type EtatVarianteReel = {
  varianteId: string;
  existe: boolean;
  stock: number;
  prixMillimes: number;
};

export type LigneVerifiee = {
  ligne: LignePanier;
  /** false = variante retirée, dépubliée, ou stock nul. */
  disponible: boolean;
  /** Quantité réellement servable (0 à `quantite`). */
  quantiteServable: number;
  /** Le prix a bougé depuis l'ajout. Le tunnel DOIT le dire avant de valider. */
  ecartPrix: boolean;
  prixMillimesActuel: number | null;
};

/**
 * Confronte un panier à l'état réel. Fonction PURE : ni requête, ni écriture —
 * l'appelant fournit ce qu'il a lu en base. C'est ce qui la rend testable et
 * utilisable des deux côtés (vitrine et tunnel).
 */
export function verifieLignes(
  lignes: LignePanier[],
  reels: EtatVarianteReel[],
): LigneVerifiee[] {
  const parId = new Map(reels.map((r) => [r.varianteId, r]));

  return lignes.map((ligne) => {
    const reel = parId.get(ligne.varianteId);
    if (!reel || !reel.existe) {
      return {
        ligne,
        disponible: false,
        quantiteServable: 0,
        ecartPrix: false,
        prixMillimesActuel: null,
      };
    }
    return {
      ligne,
      disponible: reel.stock > 0,
      quantiteServable: Math.max(0, Math.min(ligne.quantite, reel.stock)),
      ecartPrix: reel.prixMillimes !== ligne.prixMillimesAjout,
      prixMillimesActuel: reel.prixMillimes,
    };
  });
}

export function nombreArticles(panier: Panier): number {
  return panier.lignes.reduce((n, l) => n + Math.max(0, l.quantite), 0);
}

/** Lecture défensive : un contenu illisible, d'une autre version ou trafiqué
 *  rend un panier VIDE. Jamais une exception — un localStorage abîmé ne doit
 *  pas empêcher d'afficher la boutique. */
export function litPanier(brut: string | null): Panier {
  if (!brut) return PANIER_VIDE;
  try {
    const objet = JSON.parse(brut) as Partial<Panier>;
    if (objet?.version !== PANIER_VERSION || !Array.isArray(objet.lignes)) return PANIER_VIDE;

    const lignes = objet.lignes.filter(
      (l): l is LignePanier =>
        typeof l?.varianteId === "string" &&
        typeof l?.produitSlug === "string" &&
        typeof l?.sku === "string" &&
        typeof l?.libelle === "string" &&
        Number.isFinite(l?.quantite) &&
        l.quantite > 0 &&
        Number.isFinite(l?.prixMillimesAjout),
    );
    return { version: PANIER_VERSION, lignes, majLe: objet.majLe ?? "" };
  } catch {
    return PANIER_VIDE;
  }
}

export function serialisePanier(panier: Panier): string {
  return JSON.stringify({ ...panier, version: PANIER_VERSION, majLe: new Date().toISOString() });
}

/** Ajoute (ou incrémente) une ligne. Pure : rend un NOUVEAU panier. */
export function ajouteLigne(
  panier: Panier,
  ligne: Omit<LignePanier, "ajouteLe">,
  stockMax: number,
): Panier {
  const lignes = [...panier.lignes];
  const index = lignes.findIndex((l) => l.varianteId === ligne.varianteId);

  if (index >= 0) {
    const cumul = lignes[index].quantite + ligne.quantite;
    lignes[index] = {
      ...lignes[index],
      quantite: Math.min(cumul, Math.max(1, stockMax)),
      prixMillimesAjout: ligne.prixMillimesAjout,
    };
  } else {
    lignes.push({
      ...ligne,
      quantite: Math.min(ligne.quantite, Math.max(1, stockMax)),
      ajouteLe: new Date().toISOString(),
    });
  }
  return { version: PANIER_VERSION, lignes, majLe: new Date().toISOString() };
}

/** Retire une ligne entière. Pure. */
export function retireLigne(panier: Panier, varianteId: string): Panier {
  return {
    version: PANIER_VERSION,
    lignes: panier.lignes.filter((l) => l.varianteId !== varianteId),
    majLe: new Date().toISOString(),
  };
}

/** Change la quantité d'une ligne. Une quantité ≤ 0 retire la ligne : c'est le
 *  geste attendu quand on décrémente jusqu'à zéro. Pure. */
export function changeQuantite(
  panier: Panier,
  varianteId: string,
  quantite: number,
  stockMax: number,
): Panier {
  if (quantite <= 0) return retireLigne(panier, varianteId);
  return {
    version: PANIER_VERSION,
    lignes: panier.lignes.map((l) =>
      l.varianteId === varianteId
        ? { ...l, quantite: Math.min(quantite, Math.max(1, stockMax)) }
        : l,
    ),
    majLe: new Date().toISOString(),
  };
}

export function totalMillimes(panier: Panier): number {
  return panier.lignes.reduce((somme, l) => somme + l.prixMillimesAjout * l.quantite, 0);
}
