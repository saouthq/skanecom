/* ============================================================================
   LES PHOTOS À L'IMPORT (C5) — rapprocher un dossier de photos du catalogue.

   Un fournisseur nomme ses photos d'après ses références : DCD791-KIT.jpg,
   DCD791-KIT-2.jpg, DCD791-KIT (3).jpg, ou un dossier par référence. Chaque
   fichier est rapproché, dans cet ordre :
     1. de la RÉFÉRENCE d'une déclinaison (la photo lui est attitrée si le
        produit en a plusieurs : la couleur Noir) ;
     2. de l'identifiant d'adresse du produit (perceuse-percussion-18-v) ;
     3. de son NOM (« Perceuse à percussion 18 V »), s'il est unique ;
   d'abord le nom du fichier tel quel, puis sans son numéro d'ordre (« -2 »,
   « (3) »), puis le nom du dossier qui le contient. Majuscules, accents,
   espaces et ponctuation ne comptent pas.

   Pur : ni navigateur ni serveur, pour pouvoir le relire et l'essayer.
   ========================================================================== */

export type ProduitReference = {
  id: string;
  nom: string;
  slug: string;
  publie: boolean;
  photos: number;
  variantes: { id: string; sku: string; libelle: string | null }[];
};

export type FichierPhoto = { chemin: string; taille: number };

export type Cible = { produit: ProduitReference; varianteId: string | null; libelle: string | null };

export type Groupe = {
  produit: ProduitReference;
  /** Les photos à envoyer, dans l'ordre (la première devient la photo des listes si le produit n'en a pas). */
  envoyer: { index: number; varianteId: string | null; libelle: string | null }[];
  /** Déjà servi (le produit a des photos et l'on ne complète que les produits sans photo). */
  gardees: number[];
  /** Au-delà des douze photos d'un produit. */
  enTrop: number[];
};

export type Rapport = { groupes: Groupe[]; sansProduit: number[]; ignores: number[] };

export const PHOTOS_MAX = 12;
export const EXTENSIONS_PHOTO = /\.(jpe?g|png|webp)$/i;

/** « DCD791-KIT (2) » → « dcd791-kit-2 » ; « Perceuse à percussion 18 V » → « perceuse-a-percussion-18-v ». */
export function cle(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Le nom sans son numéro d'ordre : « val-55-noir-2 » → { base: « val-55-noir », rang: 2 }. */
export function sansRang(nom: string): { base: string; rang: number } | null {
  const m = nom.match(/^(.+?)(?:[-_ .]+|\s*\()0*(\d{1,2})\)?$/);
  if (!m) return null;
  const base = cle(m[1]);
  return base ? { base, rang: Number(m[2]) } : null;
}

/** Un fichier à écarter d'office : dossier système, fichier caché, autre chose qu'une photo. */
export function aIgnorer(chemin: string): boolean {
  const morceaux = chemin.split("/");
  const nom = morceaux[morceaux.length - 1] ?? "";
  return !nom || nom.startsWith(".") || morceaux.some((m) => m === "__MACOSX") || !EXTENSIONS_PHOTO.test(nom);
}

/** L'index de rapprochement : chaque clé mène à un produit (et parfois à une déclinaison). */
export function indexer(produits: ProduitReference[]): Map<string, Cible> {
  const index = new Map<string, Cible>();
  const noms = new Map<string, number>();
  for (const p of produits) noms.set(cle(p.nom), (noms.get(cle(p.nom)) ?? 0) + 1);
  // Du moins sûr au plus sûr : une référence l'emporte sur un nom.
  for (const p of produits) if (noms.get(cle(p.nom)) === 1 && cle(p.nom)) index.set(cle(p.nom), { produit: p, varianteId: null, libelle: null });
  for (const p of produits) if (cle(p.slug)) index.set(cle(p.slug), { produit: p, varianteId: null, libelle: null });
  for (const p of produits) {
    for (const v of p.variantes) {
      if (!cle(v.sku)) continue;
      const plusieurs = p.variantes.length > 1;
      index.set(cle(v.sku), { produit: p, varianteId: plusieurs ? v.id : null, libelle: plusieurs ? v.libelle : null });
    }
  }
  return index;
}

/** Le produit d'un fichier, et son rang parmi les photos du même produit. */
export function cibleDe(chemin: string, index: Map<string, Cible>): { cible: Cible; rang: number } | null {
  const morceaux = chemin.split("/").filter(Boolean);
  const nom = (morceaux[morceaux.length - 1] ?? "").replace(EXTENSIONS_PHOTO, "");
  const dossier = morceaux.length > 1 ? morceaux[morceaux.length - 2] : null;
  const essais: { cle: string; rang: number }[] = [{ cle: cle(nom), rang: 0 }];
  const r = sansRang(nom);
  if (r) essais.push({ cle: r.base, rang: r.rang });
  if (dossier) {
    // Un dossier par référence : les fichiers y sont rangés par leur nom (1.jpg, 2.jpg…).
    const rangDansDossier = Number(nom.match(/(\d{1,2})$/)?.[1] ?? 0);
    essais.push({ cle: cle(dossier), rang: rangDansDossier });
    const rd = sansRang(dossier);
    if (rd) essais.push({ cle: rd.base, rang: rangDansDossier });
  }
  for (const e of essais) {
    const cible = e.cle ? index.get(e.cle) : undefined;
    if (cible) return { cible, rang: e.rang };
  }
  return null;
}

/** Le rapport : ce qui part, où, et ce qui reste. `completer` : ajouter aussi
 *  aux produits qui ont déjà des photos (sinon, seuls les produits sans photo
 *  en reçoivent — un second envoi du même dossier ne double rien). */
export function rapprocher(fichiers: FichierPhoto[], produits: ProduitReference[], completer: boolean): Rapport {
  const index = indexer(produits);
  const parProduit = new Map<string, { produit: ProduitReference; photos: { index: number; rang: number; nom: string; varianteId: string | null; libelle: string | null }[] }>();
  const sansProduit: number[] = [];
  const ignores: number[] = [];
  const vus = new Set<string>();

  fichiers.forEach((f, i) => {
    const signature = `${f.chemin.split("/").pop()}|${f.taille}`;
    if (aIgnorer(f.chemin) || vus.has(signature)) {
      ignores.push(i);
      return;
    }
    vus.add(signature);
    const trouve = cibleDe(f.chemin, index);
    if (!trouve) {
      sansProduit.push(i);
      return;
    }
    const { cible, rang } = trouve;
    const g = parProduit.get(cible.produit.id) ?? { produit: cible.produit, photos: [] };
    g.photos.push({ index: i, rang, nom: f.chemin, varianteId: cible.varianteId, libelle: cible.libelle });
    parProduit.set(cible.produit.id, g);
  });

  const groupes: Groupe[] = [...parProduit.values()]
    .map(({ produit, photos }) => {
      photos.sort((a, b) => a.rang - b.rang || a.nom.localeCompare(b.nom, "fr", { numeric: true }));
      if (!completer && produit.photos > 0) return { produit, envoyer: [], gardees: photos.map((p) => p.index), enTrop: [] };
      const place = Math.max(0, PHOTOS_MAX - produit.photos);
      return {
        produit,
        envoyer: photos.slice(0, place).map((p) => ({ index: p.index, varianteId: p.varianteId, libelle: p.libelle })),
        gardees: [],
        enTrop: photos.slice(place).map((p) => p.index),
      };
    })
    .sort((a, b) => a.produit.nom.localeCompare(b.produit.nom, "fr"));

  return { groupes, sansProduit, ignores };
}
