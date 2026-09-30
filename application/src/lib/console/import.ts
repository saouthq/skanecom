import type { Lignes } from "./tableur";

/* ============================================================================
   L'IMPORT DE CATALOGUE — du tableur du client aux lignes que la base sait
   vérifier puis appliquer (public.console_preparer_import / _appliquer_).

   FORMAT : une ligne par VARIANTE (une référence), le nom du produit répété
   sur chaque ligne de ses variantes. Les en-têtes sont reconnus sous leurs
   noms usuels, accents et majuscules indifférents :

     Produit · Référence · Prix · Prix barré · Stock · Rayon · Marque ·
     Description · Poids · Publié

   Une colonne qui porte le nom d'une CARACTÉRISTIQUE de la boutique (B9 :
   « Puissance », « Puissance (W) ») remplit la fiche technique du produit :
   une valeur par produit, vérifiée (un nombre pour un nombre, l'unité ôtée).

   TOUTE AUTRE COLONNE est un axe de variante, sous son propre nom :
   « Couleur », « Taille », « Tension », « Conditionnement »…

   · Rayon : « Outillage > Perceuses » crée ou retrouve le rayon et son parent.
   · Prix en dinars : 189 · 189,000 · 189.5 · « 1 234,500 TND ».
   · Poids en grammes, ou en kg si l'en-tête ou la cellule le dit.
   · Une cellule vide ne remplace rien : on peut réimporter un fichier
     partiel (prix et stock seulement) sans effacer les descriptions.
   ========================================================================== */

export type LigneImport = {
  ligne: number;
  produit: string;
  produit_slug: string;
  reference: string;
  prix_millimes: number | null;
  prix_barre_millimes: number | null;
  stock: number | null;
  rayon: { slug: string; nom: string }[];
  marque: string | null;
  description: string | null;
  poids_grammes: number | null;
  publie: boolean | null;
  options: Record<string, string>;
  /** La fiche technique (B9), par clé de caractéristique. */
  caracteristiques: Record<string, string>;
  erreurs: string[];
};

export type Axe = { cle: string; label: string; position: number };

/** Une caractéristique de la boutique (public.attributs), telle que l'import la reconnaît. */
export type AttributImport = { cle: string; label: string; unite: string | null; type: "texte" | "nombre" };

export type Lecture = { lignes: LigneImport[]; axes: Axe[]; caracteristiques: AttributImport[]; erreurs: string[] };

export const LIMITE_LIGNES = 5000;

type Champ = "produit" | "reference" | "prix" | "prix_barre" | "stock" | "rayon" | "marque" | "description" | "poids" | "publie";

const SYNONYMES: Record<Champ, string[]> = {
  produit: ["produit", "nom", "nom du produit", "designation", "article", "libelle"],
  reference: ["reference", "ref", "sku", "code", "code article", "reference article"],
  prix: ["prix", "prix ttc", "prix tnd", "prix de vente", "prix (tnd)", "prix ttc (tnd)"],
  prix_barre: ["prix barre", "ancien prix", "prix avant remise", "prix barre (tnd)"],
  stock: ["stock", "quantite", "qte", "quantite en stock"],
  rayon: ["rayon", "categorie", "famille", "rayon > sous-rayon"],
  marque: ["marque"],
  description: ["description", "descriptif"],
  poids: ["poids", "poids (g)", "poids g", "poids (kg)", "poids kg"],
  publie: ["publie", "en ligne", "visible", "publier"],
};

export function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function entete(texte: string): string {
  return sansAccents(texte).toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function slug(texte: string, max = 80): string {
  return sansAccents(texte).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");
}

/** La clé d'un axe (couleur, taille, tension…) : [a-z0-9_], comme l'attend
 *  l'adresse des filtres de la vitrine. */
function cleAxe(texte: string): string {
  return slug(texte, 40).replace(/-/g, "_");
}

/** « 1 234,500 TND » → 1234500 millimes. `null` si vide, NaN si illisible. */
export function millimes(texte: string): number | null {
  let t = texte.toLowerCase().replace(/tnd|dt|d\.t\.?|د\.ت|dinars?/g, "").replace(/[\s  ]/g, "");
  if (t === "") return null;
  const virgule = t.lastIndexOf(",");
  const point = t.lastIndexOf(".");
  if (virgule !== -1 && point !== -1) {
    const decimal = virgule > point ? "," : ".";
    t = t.replace(decimal === "," ? /\./g : /,/g, "").replace(",", ".");
  } else {
    t = t.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  return Math.round(Number(t) * 1000);
}

function entier(texte: string): number | null {
  const t = texte.replace(/[\s  ]/g, "").replace(",", ".");
  if (t === "") return null;
  if (!/^\d+(\.0+)?$/.test(t)) return NaN;
  return Number.parseInt(t, 10);
}

function booleen(texte: string): boolean | null {
  const t = sansAccents(texte).toLowerCase().trim();
  if (t === "") return null;
  if (["oui", "o", "1", "x", "vrai", "true", "yes"].includes(t)) return true;
  if (["non", "n", "0", "faux", "false", "no"].includes(t)) return false;
  return null;
}

/** Les en-têtes sous lesquels on reconnaît une caractéristique : son nom,
 *  avec ou sans son unité (« Puissance », « Puissance (W) », « Puissance W »). */
function entetesDe(a: AttributImport): string[] {
  const noms = [a.label, a.cle.replace(/_/g, " ")];
  if (a.unite) noms.push(`${a.label} (${a.unite})`, `${a.label} ${a.unite}`, `${a.label} en ${a.unite}`);
  return noms.map(entete);
}

/** La valeur d'une cellule pour une caractéristique : un nombre s'écrit
 *  avec un point, sans unité ni espace ; `undefined` s'il est illisible. */
export function valeurCaracteristique(v: string, a: AttributImport): string | undefined {
  let t = v.replace(/[\s\u00a0\u202f]+/g, " ").trim();
  if (a.unite) t = t.replace(new RegExp(`\\s*${a.unite.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`, "i"), "").trim();
  if (a.type === "texte") return t.slice(0, 80);
  t = t.replace(/ /g, "").replace(",", ".");
  return /^-?\d{1,9}(\.\d{1,4})?$/.test(t) ? t : undefined;
}

export function lisLignes(tableau: Lignes, attributs: AttributImport[] = []): Lecture {
  const erreurs: string[] = [];
  const iEntete = tableau.findIndex((l) => l.some((c) => c.trim() !== ""));
  if (iEntete === -1) return { lignes: [], axes: [], caracteristiques: [], erreurs: ["Le fichier est vide."] };

  // Chaque colonne : un champ connu, une caractéristique de la boutique, un
  // axe de variante, ou rien (vide).
  const colonnes: ({ champ: Champ; kg?: boolean } | { axe: Axe } | { attribut: AttributImport } | null)[] = [];
  const axes: Axe[] = [];
  const caracteristiques: AttributImport[] = [];
  const vus = new Set<string>();
  tableau[iEntete].forEach((brut, i) => {
    const e = entete(brut);
    if (e === "") { colonnes[i] = null; return; }
    const champ = (Object.keys(SYNONYMES) as Champ[]).find((c) => SYNONYMES[c].includes(e));
    if (champ) {
      if (vus.has(champ)) erreurs.push(`La colonne « ${brut} » apparaît deux fois.`);
      vus.add(champ);
      colonnes[i] = { champ, kg: champ === "poids" && e.includes("kg") };
      return;
    }
    const attribut = attributs.find((a) => entetesDe(a).includes(e));
    if (attribut) {
      if (caracteristiques.some((a) => a.cle === attribut.cle)) erreurs.push(`La colonne « ${brut} » apparaît deux fois.`);
      caracteristiques.push(attribut);
      colonnes[i] = { attribut };
      return;
    }
    const cle = cleAxe(brut);
    if (!cle || axes.some((a) => a.cle === cle)) { erreurs.push(`Colonne « ${brut} » illisible ou en double.`); colonnes[i] = null; return; }
    const axe = { cle, label: brut.trim(), position: axes.length };
    axes.push(axe);
    colonnes[i] = { axe };
  });
  for (const requis of ["produit", "reference", "prix"] as Champ[]) {
    if (!vus.has(requis)) erreurs.push(`Colonne obligatoire absente : « ${SYNONYMES[requis][0]} ».`);
  }
  if (axes.length > 6) erreurs.push(`Six axes de variante au plus (couleur, taille…) ; ce fichier en a ${axes.length} : ${axes.map((a) => a.label).join(", ")}.`);
  if (erreurs.length > 0) return { lignes: [], axes, caracteristiques, erreurs };

  const lignes: LigneImport[] = [];
  for (let r = iEntete + 1; r < tableau.length; r++) {
    const cellules = tableau[r];
    if (!cellules.some((c) => (c ?? "").trim() !== "")) continue;
    if (lignes.length >= LIMITE_LIGNES) {
      erreurs.push(`Plus de ${LIMITE_LIGNES} lignes : découpez le fichier.`);
      break;
    }
    const l: LigneImport = {
      ligne: r + 1, produit: "", produit_slug: "", reference: "", prix_millimes: null, prix_barre_millimes: null,
      stock: null, rayon: [], marque: null, description: null, poids_grammes: null, publie: null, options: {}, caracteristiques: {}, erreurs: [],
    };
    colonnes.forEach((col, i) => {
      if (!col) return;
      const v = (cellules[i] ?? "").trim();
      if ("axe" in col) { if (v) l.options[col.axe.cle] = v.slice(0, 80); return; }
      if ("attribut" in col) {
        if (!v) return;
        const valeur = valeurCaracteristique(v, col.attribut);
        if (valeur === undefined) l.erreurs.push(`« ${col.attribut.label} » : un nombre est attendu, pas « ${v} »`);
        else if (valeur) l.caracteristiques[col.attribut.cle] = valeur;
        return;
      }
      switch (col.champ) {
        case "produit": l.produit = v.slice(0, 200); break;
        case "reference": l.reference = v.slice(0, 64); break;
        case "prix": {
          const p = millimes(v);
          if (Number.isNaN(p)) l.erreurs.push(`Prix illisible : « ${v} »`);
          else l.prix_millimes = p;
          break;
        }
        case "prix_barre": {
          const p = millimes(v);
          if (Number.isNaN(p)) l.erreurs.push(`Prix barré illisible : « ${v} »`);
          else l.prix_barre_millimes = p;
          break;
        }
        case "stock": {
          const s = entier(v);
          if (Number.isNaN(s)) l.erreurs.push(`Stock : un nombre entier positif est attendu, pas « ${v} »`);
          else l.stock = s;
          break;
        }
        case "rayon":
          l.rayon = v.split(/\s*>\s*/).map((n) => n.trim()).filter(Boolean).slice(0, 4)
            .map((nom) => ({ nom: nom.slice(0, 80), slug: slug(nom, 60) }));
          if (l.rayon.some((x) => !x.slug)) l.erreurs.push(`Rayon illisible : « ${v} »`);
          break;
        case "marque": l.marque = v ? v.slice(0, 80) : null; break;
        case "description": l.description = v ? v.slice(0, 5000) : null; break;
        case "poids": {
          const enKg = col.kg || /kg/i.test(v);
          const n = millimes(v.replace(/kg|g/gi, ""));
          if (Number.isNaN(n)) l.erreurs.push(`Poids illisible : « ${v} »`);
          else if (n !== null) l.poids_grammes = Math.round(enKg ? n : n / 1000);
          break;
        }
        case "publie": {
          const b = booleen(v);
          if (v && b === null) l.erreurs.push(`Publié : « oui » ou « non », pas « ${v} »`);
          else l.publie = b;
          break;
        }
      }
    });
    if (!l.produit) l.erreurs.push("Nom du produit manquant");
    if (!l.reference) l.erreurs.push("Référence manquante");
    if (l.prix_millimes === null && !l.erreurs.some((e) => e.startsWith("Prix illisible"))) l.erreurs.push("Prix manquant");
    l.produit_slug = slug(l.produit) || slug(l.reference);
    lignes.push(l);
  }
  if (lignes.length === 0 && erreurs.length === 0) erreurs.push("Aucune ligne de produit sous les en-têtes.");
  return { lignes, axes, caracteristiques, erreurs };
}

/** Le modèle à télécharger : les en-têtes et deux exemples. */
export function modeleCsv(): string {
  return [
    "Produit;Référence;Prix;Prix barré;Stock;Rayon;Marque;Description;Poids (kg);Couleur;Taille",
    "Valise rigide 4 roues;VAL-55-NOIR;189,000;;12;Bagages > Valises;Maymar;Coque ABS, roues 360°;2,6;Noir;Cabine 55 cm",
    "Valise rigide 4 roues;VAL-65-NOIR;259,000;289,000;6;Bagages > Valises;Maymar;;3,4;Noir;Moyenne 65 cm",
  ].join("\r\n") + "\r\n";
}
