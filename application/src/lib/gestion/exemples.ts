import { referenceProposee } from "@/lib/gestion/catalogue";
import { structureDe, type Structure } from "@/lib/theme";

/* ============================================================================
   LES EXEMPLES DU FORMULAIRE « NOUVEAU PRODUIT » — dans le métier de la
   boutique. Une boutique de mode lisait « Valise rigide ABS 4 roues,
   Cabine 55 cm, ABS, Polycarbonate » : les exemples de Maymar, figés. La
   structure choisie dit le métier (immersif : la mode ; commerce et
   technique : la quincaillerie, l'outillage ; bento : la maison ;
   monoproduit : la beauté ; studio : le sur-mesure) ; l'éditorial garde
   l'exemple du généraliste.
   ========================================================================== */

export type ExemplesProduit = {
  nom: string;
  /** Les trois axes proposés, et pour chacun des valeurs d'exemple. */
  axes: [string, string, string];
  valeurs: [string, string, string];
  /** La référence de base, et celle d'une déclinaison qui en découle (le vrai calcul). */
  sku: string;
  skuDeclinaison: string;
};

type Brut = Omit<ExemplesProduit, "skuDeclinaison">;

const OUTILLAGE: Brut = {
  nom: "Perceuse-visseuse sans fil 18 V",
  axes: ["Version", "Diamètre", "Longueur"],
  valeurs: ["Machine seule, Kit 2 batteries", "6 mm, 8 mm, 10 mm", "50 mm, 80 mm"],
  sku: "PER-18V",
};

const PAR_STRUCTURE: Record<Structure, Brut> = {
  editorial: {
    nom: "Valise rigide ABS 4 roues",
    axes: ["Taille", "Couleur", "Matière"],
    valeurs: ["Cabine 55 cm, Moyenne 65 cm", "Noir, Bleu nuit, Bordeaux", "ABS, Polycarbonate"],
    sku: "VAL-ABS",
  },
  immersif: {
    nom: "Robe longue en lin",
    axes: ["Taille", "Couleur", "Matière"],
    valeurs: ["S, M, L", "Écru, Terracotta, Noir", "Lin, Coton"],
    sku: "ROB-LIN",
  },
  technique: OUTILLAGE,
  commerce: OUTILLAGE,
  bento: {
    nom: "Bougie parfumée en pot",
    axes: ["Parfum", "Taille", "Matière"],
    valeurs: ["Fleur d'oranger, Jasmin, Figuier", "Petite, Grande", "Grès, Verre"],
    sku: "BOU-POT",
  },
  monoproduit: {
    nom: "Sérum à l'huile de figue de Barbarie",
    axes: ["Contenance", "Parfum", "Format"],
    valeurs: ["30 ml, 50 ml", "Neutre, Fleur d'oranger", "Flacon, Recharge"],
    sku: "SER-FIG",
  },
  studio: {
    nom: "Table basse sur mesure",
    axes: ["Essence", "Finition", "Dimensions"],
    valeurs: ["Chêne, Noyer", "Huilée, Vernie", "120 × 60 cm, 140 × 70 cm"],
    sku: "TAB-MES",
  },
};

/* Le métier choisi à la création (console) pose la structure — mais
   plusieurs métiers en partagent une : une bijouterie (immersif) lisait
   « Robe longue en lin », une parfumerie (éditorial) la valise, le
   high-tech (commerce) la perceuse. Le métier se reconnaît à ses rayons
   (posés avec lui) : deux en commun suffisent ; sinon, la structure. */
type Metier = "mode" | "bijoux" | "beaute" | "bagages" | "high_tech" | "maison" | "outillage" | "alimentation";

const RAYONS_METIER: Record<Metier, string[]> = {
  mode: ["femme", "homme", "chaussures", "accessoires"],
  bijoux: ["colliers", "bagues", "bracelets", "boucles-d-oreilles", "montres"],
  beaute: ["soins-du-visage", "corps-et-bain", "cheveux", "maquillage", "parfums", "coffrets"],
  bagages: ["valises-cabine", "valises-soute", "sacs-de-voyage", "sacs-a-dos", "accessoires-de-voyage"],
  high_tech: ["smartphones", "ordinateurs-portables", "tablettes", "audio", "accessoires", "maison-connectee"],
  maison: ["cuisine-et-table", "decoration", "linge-de-maison", "luminaires", "rangement"],
  outillage: ["outillage-electroportatif", "outillage-a-main", "quincaillerie", "protection", "jardin"],
  alimentation: ["huiles-d-olive", "dattes-et-fruits-secs", "miels-et-confitures", "epices-et-harissa", "coffrets-cadeaux"],
};

const PAR_METIER: Record<Metier, Brut> = {
  mode: PAR_STRUCTURE.immersif,
  bijoux: {
    nom: "Bracelet jonc en argent",
    axes: ["Taille", "Métal", "Pierre"],
    valeurs: ["S, M, L", "Argent, Plaqué or", "Sans pierre, Zircon"],
    sku: "BRA-JON",
  },
  beaute: PAR_STRUCTURE.monoproduit,
  bagages: PAR_STRUCTURE.editorial,
  high_tech: {
    nom: "Écouteurs sans fil",
    axes: ["Couleur", "Version", "Garantie"],
    valeurs: ["Noir, Blanc", "Standard, Pro", "1 an, 2 ans"],
    sku: "ECO-SF",
  },
  maison: PAR_STRUCTURE.bento,
  outillage: OUTILLAGE,
  alimentation: {
    nom: "Huile d'olive extra vierge",
    axes: ["Contenance", "Origine", "Conditionnement"],
    valeurs: ["50 cl, 1 L", "Sfax, Zaghouan", "Bouteille, Bidon"],
    sku: "HUI-OLV",
  },
};

/** Le métier qu'ont posé les rayons de la boutique (leurs adresses), s'il se reconnaît. */
export function metierDe(rayons: string[]): Metier | null {
  let meilleur: Metier | null = null;
  let score = 1;
  for (const [m, liste] of Object.entries(RAYONS_METIER) as [Metier, string[]][]) {
    const n = liste.filter((s) => rayons.includes(s)).length;
    if (n > score) { score = n; meilleur = m; }
  }
  return meilleur;
}

export function exemplesProduit(code: unknown, rayons: string[] = []): ExemplesProduit {
  const metier = metierDe(rayons);
  const e = metier ? PAR_METIER[metier] : PAR_STRUCTURE[structureDe(code)];
  const premiere = (liste: string) => liste.split(",")[0]?.trim() ?? "";
  return { ...e, skuDeclinaison: referenceProposee(e.sku, [premiere(e.valeurs[0]), premiere(e.valeurs[1])]) };
}
