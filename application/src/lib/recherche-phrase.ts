/* ============================================================================
   LA RECHERCHE EN PHRASE (réglage catalogue.recherche_phrase) — « valise
   cabine noire à moins de 200 dinars » devient : le rayon Valises, la taille
   Cabine 55 cm, la couleur Noir, au plus 200 TND. Ce qui reste est cherché en
   texte.

   Aucun modèle de langue : ne se comprend que ce que la boutique a — ses
   rayons, les valeurs de ses déclinaisons — et quelques tournures de prix et
   de stock. Une phrase dont rien n'est compris est cherchée mot pour mot,
   comme avant. Les accords se lisent par leurs formes : « noire », « noirs »
   et « Noir » se retrouvent, « grises » et « Gris », « blanche » et « Blanc ».
   ========================================================================== */

export type ContexteRecherche = {
  rayons: { slug: string; nom: string }[];
  /** Les axes de déclinaison de la boutique : leur nom, leurs valeurs. */
  axes: { cle: string; nom: string; valeurs: string[] }[];
};

export type Morceau = { genre: "rayon" | "option" | "prix" | "stock"; libelle: string };

export type Comprise = {
  rayon: string | null;
  options: Record<string, string[]>;
  prixMin: number | null;
  prixMax: number | null;
  enStock: boolean;
  /** Les mots que rien n'a compris, cherchés en texte (vide : aucun). */
  reste: string;
  morceaux: Morceau[];
};

/** Minuscules, sans accents, apostrophes droites, ponctuation en espaces. */
export function normalise(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/([a-z])'/g, "$1' ")
    .replace(/[^a-z0-9'.,\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Les formes qu'un mot peut prendre selon l'accord : « grises » → grise,
 *  gris ; « blanche » → blanc ; « noire » → noir. Deux mots s'accordent s'ils
 *  ont une forme en commun (« gris » et « grises », pas « gris » et « gri »). */
function formes(mot: string): Set<string> {
  const f = new Set([mot]);
  if (mot.length > 3 && /es$/.test(mot)) f.add(mot.slice(0, -2));
  if (mot.length > 2 && /[sx]$/.test(mot)) f.add(mot.slice(0, -1));
  for (const m of [...f]) {
    if (m.length > 3 && /che$/.test(m)) f.add(`${m.slice(0, -3)}c`);
    if (m.length > 2 && /e$/.test(m)) f.add(m.slice(0, -1));
  }
  return f;
}
const accorde = (a: string, b: string) => {
  const fb = formes(b);
  return [...formes(a)].some((x) => fb.has(x));
};

const mots = (texte: string) => normalise(texte).split(" ").filter(Boolean);

/** Les mots qui ne disent rien de ce qu'on cherche. */
const VIDES = new Set([
  "je", "j'", "cherche", "recherche", "veux", "voudrais", "voudrai", "aimerais", "besoin", "il", "me", "faut", "un", "une",
  "des", "de", "du", "d'", "le", "la", "les", "l'", "pour", "avec", "en", "et", "ou", "a", "au", "aux", "mon", "ma", "mes",
  "qui", "que", "pas", "trop", "cher", "chere", "chers", "cheres", "prix", "taille", "couleur", "dt", "dinar", "dinars", "tnd",
]);

/** Les montants : « 200 », « 200dt », « 1 200 », « 199,5 ». */
const MONTANT = String.raw`(\d[\d ]{0,6}(?:[.,]\d{1,3})?)\s*(?:dt|tnd|dinars?|d)?\b`;
const enDinars = (brut: string) => Math.round(Number(brut.replace(/\s/g, "").replace(",", ".")));

export function comprendre(phrase: string, contexte: ContexteRecherche): Comprise | null {
  let texte = ` ${normalise(phrase)} `;
  const morceaux: Morceau[] = [];
  let prixMin: number | null = null;
  let prixMax: number | null = null;
  let enStock = false;

  // Le prix : une fourchette, un plafond, un plancher.
  const entre = texte.match(new RegExp(String.raw`\bentre\s+${MONTANT}\s+et\s+${MONTANT}`));
  if (entre) {
    [prixMin, prixMax] = [enDinars(entre[1]), enDinars(entre[2])].sort((a, b) => a - b);
    texte = texte.replace(entre[0], " ");
  }
  const plafond = texte.match(new RegExp(String.raw`(?:\bmoins\s+de|\bsous|\bmax(?:imum)?|\bpas\s+plus\s+de|\bjusqu'?\s?a|\binferieur\s+a|<=?)\s*${MONTANT}`));
  if (plafond && prixMax === null) {
    prixMax = enDinars(plafond[1]);
    texte = texte.replace(plafond[0], " ");
  }
  const plancher = texte.match(new RegExp(String.raw`(?:\bplus\s+de|\ba\s+partir\s+de|\bau\s+moins|\bmin(?:imum)?|\bsuperieur\s+a|>=?)\s*${MONTANT}`));
  if (plancher && prixMin === null) {
    prixMin = enDinars(plancher[1]);
    texte = texte.replace(plancher[0], " ");
  }
  if (prixMin !== null && prixMax !== null && prixMin > prixMax) [prixMin, prixMax] = [prixMax, prixMin];
  if (prixMin !== null || prixMax !== null) {
    morceaux.push({
      genre: "prix",
      libelle: prixMin !== null && prixMax !== null ? `${prixMin} à ${prixMax} TND` : prixMax !== null ? `${prixMax} TND au plus` : `${prixMin} TND au moins`,
    });
  }

  // Le stock.
  const stock = texte.match(/\b(en stock|disponibles?|dispo)\b/);
  if (stock) {
    enStock = true;
    texte = texte.replace(stock[0], " ");
    morceaux.push({ genre: "stock", libelle: "En stock" });
  }

  // Les mots qui restent, comparés par leurs formes ; un mot compris est retiré.
  const lus = texte.split(" ").filter(Boolean);
  const pris = new Set<number>();
  const trouve = (cible: string[]): number[] | null => {
    // Tous les mots de la cible, à la suite dans la phrase.
    for (let i = 0; i + cible.length <= lus.length; i++) {
      if (cible.every((m, j) => !pris.has(i + j) && accorde(lus[i + j], m))) return cible.map((_, j) => i + j);
    }
    return null;
  };

  // Le rayon : le nom entier (« linge de maison »), sinon son premier mot s'il ne désigne que lui.
  let rayon: string | null = null;
  const premierMot = (nom: string) => mots(nom).find((m) => !VIDES.has(m)) ?? "";
  for (const r of [...contexte.rayons].sort((a, b) => b.nom.length - a.nom.length)) {
    const entier = mots(r.nom);
    const premier = premierMot(r.nom);
    const seul = premier && contexte.rayons.filter((x) => accorde(premierMot(x.nom), premier)).length === 1;
    const places = (entier.length ? trouve(entier) : null) ?? (entier.length > 1 && seul ? trouve([premier]) : null);
    if (places) {
      rayon = r.slug;
      places.forEach((p) => pris.add(p));
      morceaux.unshift({ genre: "rayon", libelle: r.nom });
      break;
    }
  }

  // Les valeurs des déclinaisons : la valeur entière (« bleu marine »), sinon
  // son premier mot (« cabine » pour « Cabine 55 cm ») s'il n'en désigne qu'une.
  const options: Record<string, string[]> = {};
  const premiers = new Map<string, number>();
  for (const axe of contexte.axes) for (const v of axe.valeurs) {
    const p = mots(v)[0];
    if (p) premiers.set(p, (premiers.get(p) ?? 0) + 1);
  }
  for (const axe of contexte.axes) {
    for (const v of [...axe.valeurs].sort((a, b) => b.length - a.length)) {
      const entiere = mots(v);
      let places = entiere.length ? trouve(entiere) : null;
      if (!places && entiere.length > 1 && premiers.get(entiere[0]) === 1 && !/^\d/.test(entiere[0])) places = trouve([entiere[0]]);
      if (places) {
        places.forEach((p) => pris.add(p));
        (options[axe.cle] ??= []).push(v);
        morceaux.push({ genre: "option", libelle: `${axe.nom} ${v}` });
      }
    }
  }

  if (morceaux.length === 0) return null;
  const reste = lus.filter((m, i) => !pris.has(i) && !VIDES.has(m) && !/^\d+$/.test(m)).join(" ");
  return { rayon, options, prixMin, prixMax, enStock, reste, morceaux };
}
