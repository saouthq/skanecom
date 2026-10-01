import { supabase } from "./supabase";
import { chargeProduit, listeProduits, type Produit } from "./catalogue";
import { chargePage } from "./pages";
import { questions as questionsDe } from "./texte-riche";
import type { Cadre } from "./boutique";

/* ============================================================================
   CE QUE L'ACCUEIL MONTRE — lu en parallèle, section par section : chaque
   sélection sa liste (un rayon ou tout le catalogue, dans l'ordre choisi),
   les avis si une section les montre, les questions de la page choisie, les
   marques du catalogue. Une section qui n'a rien à montrer ne s'affiche pas :
   jamais un état vide sur la vitrine pour une section facultative.
   ========================================================================== */

export type AvisAccueil = {
  total: number;
  moyenne: number | null;
  avis: {
    id: string;
    note: number;
    texte: string;
    auteur: string;
    variante_libelle: string | null;
    cree_le: string;
    produit: { slug: string; nom_fr: string | null; nom_ar: string | null; image: string | null };
  }[];
};

export type QuestionsAccueil = { slug: string; titre: string; total: number; liste: ReturnType<typeof questionsDe>["questions"] };
export type Marque = { nom: string; compte: number };

export type DonneesAccueil = {
  selections: Map<number, Produit[]>;
  /** La sélection qui dit « Le catalogue arrive » : la première, et
   *  seulement si la boutique n'a encore aucun produit publié. Une autre
   *  sélection vide (un rayon sans pièce, une deuxième rangée) ne s'affiche pas. */
  selectionVide: number | null;
  avis: AvisAccueil | null;
  questions: Map<number, QuestionsAccueil>;
  marques: Marque[];
  /** Les points de chaque lookbook, avec leur pièce (un produit retiré : son point se tait). */
  lookbooks: Map<number, PointLook[]>;
  /** La pièce de la saison de chaque section « piece » (publiée). */
  pieces: Map<number, Produit>;
};

export type PointLook = { x: number; y: number; produit: Produit };

/** Il faut deux citations au moins : une seule ferait une vitrine qui se
 *  vante, pas une boutique dont on parle. */
export const AVIS_MIN = 2;
export const MARQUES_MIN = 2;

export async function donneesAccueil(cadre: Cadre): Promise<DonneesAccueil> {
  const sections = cadre.theme.sections;
  const selections = new Map<number, Produit[]>();
  const questions = new Map<number, QuestionsAccueil>();
  let avis: AvisAccueil | null = null;
  let marques: Marque[] = [];
  const lookbooks = new Map<number, PointLook[]>();
  const pieces = new Map<number, Produit>();
  // Chaque pièce citée (points, pièce de la saison) n'est lue qu'une fois.
  const lues = new Map<string, Promise<Produit | null>>();
  const piece = (slug: string) => {
    if (!lues.has(slug)) lues.set(slug, chargeProduit(cadre.boutique.id, slug).catch(() => null));
    return lues.get(slug)!;
  };

  const nombreAvis = Math.max(0, ...sections.map((s) => (s.type === "avis" ? (s.nombre ?? 6) : 0)));

  await Promise.all([
    ...sections.map(async (s, i) => {
      if (s.type === "selection") {
        const liste = await listeProduits(cadre.boutique.id, s.rayon ? { rayon: s.rayon } : {}, s.tri === "nouveautes" ? "nouveautes" : "selection", 1, s.nombre ?? 8);
        selections.set(i, liste.produits);
      }
      if (s.type === "questions") {
        // La page choisie, ou la première page de questions publiée.
        const slug = s.page ?? cadre.pages.find((p) => p.genre === "questions")?.slug;
        if (!slug) return;
        const page = await chargePage(cadre.boutique.id, slug);
        if (!page || page.genre !== "questions") return;
        const { questions: liste } = questionsDe(page.corps_fr);
        if (liste.length === 0) return;
        questions.set(i, { slug: page.slug, titre: page.titre_fr, total: liste.length, liste: liste.slice(0, s.nombre ?? 5) });
      }
      if (s.type === "lookbook" && s.image && s.points.length) {
        const points = await Promise.all(s.points.map(async (p) => {
          const produit = await piece(p.produit);
          return produit ? { x: p.x, y: p.y, produit } : null;
        }));
        const vivants = points.filter((p) => p !== null);
        if (vivants.length) lookbooks.set(i, vivants);
      }
      if (s.type === "piece" && s.produit) {
        const produit = await piece(s.produit);
        if (produit && produit.variantes.length) pieces.set(i, produit);
      }
    }),
    nombreAvis > 0
      ? supabase.rpc("avis_accueil", { p_boutique_id: cadre.boutique.id, p_limite: nombreAvis }).then(({ data, error }) => {
          // Une erreur ne coûte que la section.
          const lu = error ? null : (data as AvisAccueil | null);
          avis = lu && lu.avis.length >= AVIS_MIN ? lu : null;
        })
      : Promise.resolve(),
    sections.some((s) => s.type === "marques") ? chargeMarques(cadre.boutique.id).then((m) => (marques = m)) : Promise.resolve(),
  ]);

  const premiere = sections.findIndex((s) => s.type === "selection");
  return {
    selections,
    selectionVide: cadre.boutique.nb_produits === 0 && premiere >= 0 ? premiere : null,
    avis,
    questions,
    marques: marques.length >= MARQUES_MIN ? marques : [],
    lookbooks,
    pieces,
  };
}

/** Les marques des produits publiés, la plus fournie d'abord ; l'écriture la
 *  plus fréquente d'une même marque (« DeWalt », pas « DEWALT »). */
async function chargeMarques(boutiqueId: string): Promise<Marque[]> {
  const { data, error } = await supabase.from("vitrine_produits").select("marque").eq("boutique_id", boutiqueId).not("marque", "is", null).limit(5000);
  if (error) return [];
  const parCle = new Map<string, { ecritures: Map<string, number>; compte: number }>();
  for (const { marque } of (data ?? []) as { marque: string | null }[]) {
    const nom = (marque ?? "").trim();
    if (!nom) continue;
    const cle = nom.toLocaleLowerCase("fr");
    const m = parCle.get(cle) ?? { ecritures: new Map(), compte: 0 };
    m.compte += 1;
    m.ecritures.set(nom, (m.ecritures.get(nom) ?? 0) + 1);
    parCle.set(cle, m);
  }
  return [...parCle.values()]
    .map((m) => ({ nom: [...m.ecritures.entries()].sort((a, b) => b[1] - a[1])[0][0], compte: m.compte }))
    .sort((a, b) => b.compte - a.compte || a.nom.localeCompare(b.nom, "fr"))
    .slice(0, 24);
}
