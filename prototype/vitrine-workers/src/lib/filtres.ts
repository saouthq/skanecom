import { prixDepuis, stockTotal, valeursAxe, type Produit } from "./catalogue";
import { dinarsVersMillimes, millimesVersDinars } from "./prix";

/* ============================================================================
   FILTRES DE LISTING — l'état vit dans l'URL, pas dans la mémoire du client.

   Pourquoi l'URL : un filtre partagé par WhatsApp doit rouvrir la même liste
   (c'est le canal du marché tunisien), la page reste indexable, et le retour
   arrière du navigateur fait ce qu'on attend. Conséquence : la page marche
   SANS JavaScript — le script ne fait qu'éviter un clic sur « Voir les
   résultats ».

   Les filtres portent sur les VARIANTES (couleur, taille), parce que c'est la
   variante qui a un prix et un stock. Un produit passe si AU MOINS UNE de ses
   variantes satisfait tout le filtre à la fois — sinon on afficherait un
   produit « rouge en 55 cm » qui n'existe qu'en rouge 75 et noir 55.
   ========================================================================== */

export type Filtres = {
  rayons: string[];
  couleurs: string[];
  tailles: string[];
  enStock: boolean;
  minDinars: number | null;
  maxDinars: number | null;
  tri: Tri;
};

export type Tri = "nouveautes" | "prix-asc" | "prix-desc" | "nom";

export type ParamsBruts = Record<string, string | string[] | undefined>;

const TRIS: Tri[] = ["nouveautes", "prix-asc", "prix-desc", "nom"];

function liste(valeur: string | string[] | undefined): string[] {
  if (!valeur) return [];
  const brut = Array.isArray(valeur) ? valeur : [valeur];
  // Une valeur peut arriver répétée (`?couleur=Noir&couleur=Gris`) ou groupée
  // (`?couleur=Noir,Gris`) : les deux formes se lisent, une seule s'écrit.
  return brut
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

function nombre(valeur: string | string[] | undefined): number | null {
  const brut = Array.isArray(valeur) ? valeur[0] : valeur;
  if (!brut) return null;
  const n = Number(brut);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function litFiltres(params: ParamsBruts): Filtres {
  const triBrut = Array.isArray(params.tri) ? params.tri[0] : params.tri;
  return {
    rayons: liste(params.rayon),
    couleurs: liste(params.couleur),
    tailles: liste(params.taille),
    enStock: params.stock === "1",
    minDinars: nombre(params.min),
    maxDinars: nombre(params.max),
    tri: TRIS.includes(triBrut as Tri) ? (triBrut as Tri) : "nouveautes",
  };
}

export function nombreFiltresActifs(f: Filtres): number {
  return (
    f.rayons.length +
    f.couleurs.length +
    f.tailles.length +
    (f.enStock ? 1 : 0) +
    (f.minDinars !== null || f.maxDinars !== null ? 1 : 0)
  );
}

/** Une variante satisfait-elle les critères qui la concernent ? */
function varianteRetenue(
  v: Produit["variantes"][number],
  f: Filtres,
  ignore?: keyof Filtres,
): boolean {
  if (ignore !== "couleurs" && f.couleurs.length > 0 && !f.couleurs.includes(v.options?.couleur ?? ""))
    return false;
  if (ignore !== "tailles" && f.tailles.length > 0 && !f.tailles.includes(v.options?.taille ?? ""))
    return false;
  if (ignore !== "enStock" && f.enStock && v.stock <= 0) return false;

  if (ignore !== "minDinars" && f.minDinars !== null && v.prix_millimes < dinarsVersMillimes(f.minDinars))
    return false;
  if (ignore !== "maxDinars" && f.maxDinars !== null && v.prix_millimes > dinarsVersMillimes(f.maxDinars))
    return false;

  return true;
}

export function produitRetenu(p: Produit, f: Filtres, ignore?: keyof Filtres): boolean {
  if (ignore !== "rayons" && f.rayons.length > 0 && !f.rayons.includes(p.categorie?.slug ?? ""))
    return false;
  return p.variantes.some((v) => varianteRetenue(v, f, ignore));
}

export function applique(produits: Produit[], f: Filtres): Produit[] {
  const retenus = produits.filter((p) => produitRetenu(p, f));

  const parPrix = (p: Produit) => prixDepuis(p) ?? Number.MAX_SAFE_INTEGER;

  switch (f.tri) {
    case "prix-asc":
      return [...retenus].sort((a, b) => parPrix(a) - parPrix(b));
    case "prix-desc":
      return [...retenus].sort((a, b) => parPrix(b) - parPrix(a));
    case "nom":
      return [...retenus].sort((a, b) => a.nom_fr.localeCompare(b.nom_fr, "fr"));
    default:
      // « Nouveautés d'abord » : l'entrée en catalogue, puis la position voulue
      // par le backoffice comme départage.
      return [...retenus].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ||
          a.position - b.position,
      );
  }
}

/* --------------------------------------------------------------------------
   FACETTES — chaque option porte le nombre de modèles qu'elle laisserait
   passer, les AUTRES filtres restant en place. Une option à 0 s'affiche
   éteinte et ne se clique pas : on prévient l'erreur au lieu de l'annoncer
   après (règle de Lina sur la maquette).
   -------------------------------------------------------------------------- */

export type Option = { valeur: string; compte: number };

export type Facettes = {
  couleurs: Option[];
  tailles: Option[];
  rayons: (Option & { nom: string })[];
  bornes: { min: number; max: number } | null;
};

function optionsAxe(
  produits: Produit[],
  f: Filtres,
  cle: "couleur" | "taille",
  champFiltre: "couleurs" | "tailles",
): Option[] {
  const valeurs: string[] = [];
  for (const p of produits) {
    for (const v of valeursAxe(p, cle)) if (!valeurs.includes(v)) valeurs.push(v);
  }

  return valeurs.map((valeur) => {
    const essai: Filtres = { ...f, [champFiltre]: [valeur] } as Filtres;
    return { valeur, compte: produits.filter((p) => produitRetenu(p, essai)).length };
  });
}

export function facettes(produits: Produit[], f: Filtres): Facettes {
  const rayons: (Option & { nom: string })[] = [];
  for (const p of produits) {
    const slug = p.categorie?.slug;
    if (!slug || rayons.some((r) => r.valeur === slug)) continue;
    const essai: Filtres = { ...f, rayons: [slug] };
    rayons.push({
      valeur: slug,
      nom: p.categorie?.nom_fr ?? slug,
      compte: produits.filter((q) => produitRetenu(q, essai)).length,
    });
  }

  const prix = produits.flatMap((p) => p.variantes.map((v) => v.prix_millimes));

  return {
    couleurs: optionsAxe(produits, f, "couleur", "couleurs"),
    tailles: optionsAxe(produits, f, "taille", "tailles"),
    rayons,
    bornes:
      prix.length > 0
        ? { min: millimesVersDinars(Math.min(...prix)), max: millimesVersDinars(Math.max(...prix)) }
        : null,
  };
}

/** Les filtres actifs, en puces retirables : chaque puce est un lien vers la
 *  même page SANS ce critère. Un filtre qu'on ne sait pas défaire est un
 *  piège. */
export function puces(f: Filtres, nomRayon: (slug: string) => string) {
  const p: { cle: string; valeur: string; libelle: string }[] = [];
  for (const r of f.rayons) p.push({ cle: "rayon", valeur: r, libelle: nomRayon(r) });
  for (const c of f.couleurs) p.push({ cle: "couleur", valeur: c, libelle: c });
  for (const s of f.tailles) p.push({ cle: "taille", valeur: s, libelle: s });
  if (f.enStock) p.push({ cle: "stock", valeur: "1", libelle: "En stock" });
  if (f.minDinars !== null) p.push({ cle: "min", valeur: String(f.minDinars), libelle: `≥ ${f.minDinars} TND` });
  if (f.maxDinars !== null) p.push({ cle: "max", valeur: String(f.maxDinars), libelle: `≤ ${f.maxDinars} TND` });
  return p;
}

/** Recompose une URL en retirant une valeur précise (ou tout un critère). */
export function urlSans(base: string, f: Filtres, cle: string, valeur: string): string {
  const params = versParams(f);
  const restantes = params.getAll(cle).filter((v) => v !== valeur);
  params.delete(cle);
  for (const v of restantes) params.append(cle, v);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function versParams(f: Filtres): URLSearchParams {
  const params = new URLSearchParams();
  for (const r of f.rayons) params.append("rayon", r);
  for (const c of f.couleurs) params.append("couleur", c);
  for (const s of f.tailles) params.append("taille", s);
  if (f.enStock) params.set("stock", "1");
  if (f.minDinars !== null) params.set("min", String(f.minDinars));
  if (f.maxDinars !== null) params.set("max", String(f.maxDinars));
  if (f.tri !== "nouveautes") params.set("tri", f.tri);
  return params;
}
