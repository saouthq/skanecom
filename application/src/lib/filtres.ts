import type { CriteresSql, TriSql } from "./catalogue";
import { dinarsVersMillimes } from "./prix";

/* ============================================================================
   FILTRES DE LISTING — l'état vit dans le CHEMIN de l'adresse.

   Pourquoi l'adresse : un filtre partagé par WhatsApp doit rouvrir la même
   liste, la page reste indexable, et le retour arrière fait ce qu'on attend.
   Pourquoi le CHEMIN et pas les paramètres (`?couleur=Noir`) : une page qui
   lit ses paramètres n'est jamais mise en cache (découverte n°8 du
   prototype) ; une page par chemin, si. Les listes filtrées restent donc
   servies pendant une panne de la base, comme les fiches.

     /catalogue/couleur=Noir~Gris/taille=Cabine%2055%20cm/prix=100-300/stock/tri=prix-asc/page=2

   · un segment par axe de variante, valeurs séparées par « ~ » ;
   · `prix=min-max` en dinars (une borne peut manquer) ; `stock` = en stock
     seulement ; `tri=…` ; `page=n` ;
   · FORME CANONIQUE : axes et valeurs triés, tri par défaut et page 1 omis.
     Une même liste n'a qu'une adresse, donc une seule entrée de cache ; toute
     autre écriture est redirigée vers elle.

   Les formulaires (qui marchent sans JavaScript) envoient des paramètres à
   /filtrer, qui redirige vers l'adresse canonique.
   ========================================================================== */

export type Tri = "nouveautes" | "prix-asc" | "prix-desc" | "nom";
const TRIS: Tri[] = ["nouveautes", "prix-asc", "prix-desc", "nom"];

export type Filtres = {
  options: Record<string, string[]>;
  enStock: boolean;
  minDinars: number | null;
  maxDinars: number | null;
  tri: Tri;
  page: number;
};

export const FILTRES_VIDES: Filtres = { options: {}, enStock: false, minDinars: null, maxDinars: null, tri: "nouveautes", page: 1 };

/* Garde-fous : une adresse forgée ne doit pas pouvoir demander n'importe quoi
   à la base ni remplir le cache de combinaisons absurdes. */
const MAX_AXES = 6;
const MAX_VALEURS = 20;
const AXE = /^[a-z0-9_]{1,40}$/;

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function nombre(brut: string | undefined | null): number | null {
  if (brut === undefined || brut === null || brut === "") return null;
  const n = Number(brut);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

const trieValeurs = (valeurs: string[]) =>
  [...new Set(valeurs.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

function normalise(f: Filtres): Filtres {
  const options: Record<string, string[]> = {};
  for (const cle of Object.keys(f.options).filter((c) => AXE.test(c)).sort().slice(0, MAX_AXES)) {
    const valeurs = trieValeurs(f.options[cle]).slice(0, MAX_VALEURS);
    if (valeurs.length > 0) options[cle] = valeurs;
  }
  let { minDinars, maxDinars } = f;
  if (minDinars !== null && maxDinars !== null && minDinars > maxDinars) [minDinars, maxDinars] = [maxDinars, minDinars];
  return {
    options,
    enStock: f.enStock,
    minDinars,
    maxDinars,
    tri: TRIS.includes(f.tri) ? f.tri : "nouveautes",
    page: Math.max(1, Math.min(500, Math.floor(f.page) || 1)),
  };
}

/** Lit les segments d'une adresse de listing. */
export function litSegments(segments: string[] | undefined): Filtres {
  const f: Filtres = { ...FILTRES_VIDES, options: {} };
  for (const brut of segments ?? []) {
    const segment = decode(brut);
    const egal = segment.indexOf("=");
    const cle = egal === -1 ? segment : segment.slice(0, egal);
    const valeur = egal === -1 ? "" : segment.slice(egal + 1);

    if (cle === "stock" && egal === -1) f.enStock = true;
    else if (cle === "tri") f.tri = valeur as Tri;
    else if (cle === "page") f.page = nombre(valeur) ?? 1;
    else if (cle === "prix") {
      const [min, max] = valeur.split("-");
      f.minDinars = nombre(min);
      f.maxDinars = nombre(max);
    } else if (egal !== -1) {
      f.options[cle] = [...(f.options[cle] ?? []), ...valeur.split("~")];
    }
  }
  return normalise(f);
}

/** L'adresse canonique d'une liste filtrée. `base` : /catalogue ou
 *  /categorie/<slug>. */
export function cheminFiltres(base: string, brut: Filtres): string {
  const f = normalise(brut);
  const segments: string[] = [];
  for (const [cle, valeurs] of Object.entries(f.options)) {
    segments.push(`${cle}=${valeurs.map((v) => encodeURIComponent(v)).join("~")}`);
  }
  if (f.minDinars !== null || f.maxDinars !== null) segments.push(`prix=${f.minDinars ?? ""}-${f.maxDinars ?? ""}`);
  if (f.enStock) segments.push("stock");
  if (f.tri !== "nouveautes") segments.push(`tri=${f.tri}`);
  if (f.page > 1) segments.push(`page=${f.page}`);
  return segments.length > 0 ? `${base}/${segments.join("/")}` : base;
}

/** Les segments reçus sont-ils déjà sous forme canonique ? */
export function estCanonique(base: string, segments: string[] | undefined, f: Filtres): boolean {
  const recu = (segments ?? []).map(decode);
  const attendu = cheminFiltres(base, f).slice(base.length + 1).split("/").filter(Boolean).map(decode);
  return recu.length === attendu.length && recu.every((s, i) => s === attendu[i]);
}

/** Les filtres envoyés par un formulaire (GET vers /filtrer). */
export function depuisFormulaire(params: URLSearchParams): Filtres {
  const f: Filtres = { ...FILTRES_VIDES, options: {} };
  for (const [nom, valeur] of params) {
    if (nom.startsWith("a.")) f.options[nom.slice(2)] = [...(f.options[nom.slice(2)] ?? []), valeur];
  }
  f.enStock = params.get("stock") === "1";
  f.minDinars = nombre(params.get("min"));
  f.maxDinars = nombre(params.get("max"));
  f.tri = (params.get("tri") ?? "nouveautes") as Tri;
  return normalise(f);
}

/** Les critères pour public.liste_produits (prix convertis en millimes). */
export function versCriteres(f: Filtres, rayon?: string): CriteresSql {
  return {
    ...(rayon ? { rayon } : {}),
    ...(Object.keys(f.options).length > 0 ? { options: f.options } : {}),
    ...(f.enStock ? { en_stock: true } : {}),
    ...(f.minDinars !== null ? { prix_min: dinarsVersMillimes(f.minDinars) } : {}),
    ...(f.maxDinars !== null ? { prix_max: dinarsVersMillimes(f.maxDinars) } : {}),
  };
}

export function triSql(f: Filtres): TriSql {
  return f.tri;
}

export function nombreFiltresActifs(f: Filtres): number {
  return (
    Object.values(f.options).reduce((n, v) => n + v.length, 0) +
    (f.enStock ? 1 : 0) +
    (f.minDinars !== null || f.maxDinars !== null ? 1 : 0)
  );
}

export type Puce = { libelle: string; url: string };

/** Les filtres actifs, en puces retirables : chaque puce mène à la même liste
 *  SANS ce critère. Un filtre qu'on ne sait pas défaire est un piège. */
export function puces(base: string, f: Filtres, libelles: { enStock: string; prix: (min: number | null, max: number | null) => string }): Puce[] {
  const liste: Puce[] = [];
  for (const [cle, valeurs] of Object.entries(f.options)) {
    for (const v of valeurs) {
      const options = { ...f.options, [cle]: valeurs.filter((x) => x !== v) };
      liste.push({ libelle: v, url: cheminFiltres(base, { ...f, options, page: 1 }) });
    }
  }
  if (f.minDinars !== null || f.maxDinars !== null) {
    liste.push({ libelle: libelles.prix(f.minDinars, f.maxDinars), url: cheminFiltres(base, { ...f, minDinars: null, maxDinars: null, page: 1 }) });
  }
  if (f.enStock) liste.push({ libelle: libelles.enStock, url: cheminFiltres(base, { ...f, enStock: false, page: 1 }) });
  return liste;
}
