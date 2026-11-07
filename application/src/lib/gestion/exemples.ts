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

export function exemplesProduit(code: unknown): ExemplesProduit {
  const e = PAR_STRUCTURE[structureDe(code)];
  const premiere = (liste: string) => liste.split(",")[0]?.trim() ?? "";
  return { ...e, skuDeclinaison: referenceProposee(e.sku, [premiere(e.valeurs[0]), premiere(e.valeurs[1])]) };
}
