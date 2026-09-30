/* ============================================================================
   LE TUNNEL DE COMMANDE — les formes échangées avec la base, et les petits
   outils communs à la page (navigateur) et aux gestionnaires (serveur).

   La base fait foi (supabase/migrations/…_tunnel_commande.sql) :
   · `devis_commande` relit prix, stock et frais ; la page n'affiche que ça ;
   · `passer_commande` recalcule tout et refuse un total différent de celui
     que l'acheteur a lu ; chaque refus porte une RAISON (l'indice HINT de
     l'erreur SQL), que la page traduit en phrase ;
   · `commande_suivie` rend la commande à qui a son numéro et son jeton.
   ========================================================================== */

export type LigneDevis = {
  variante_id: string;
  disponible: boolean;
  quantite: number;
  quantite_disponible: number;
  produit_nom: string | null;
  produit_slug: string | null;
  variante_libelle: string | null;
  sku: string | null;
  image: string | null;
  prix_unitaire_millimes: number | null;
  total_ligne_millimes: number | null;
};

/** Le magasin où retirer une commande (module retrait_magasin : adresse,
 *  horaires, temps de préparation). */
export type Magasin = { adresse: string; ville: string; horaires: string | null; delai_heures: number };

export type ModeLivraison = "domicile" | "retrait";

export type Devis = {
  lignes: LigneDevis[];
  complet: boolean;
  sous_total_millimes: number;
  seuil_gratuite_millimes: number | null;
  gouvernorat: { code: string; nom_fr: string; nom_ar: string } | null;
  zone: { nom_fr: string | null; nom_ar: string | null; delai_jours_min: number | null; delai_jours_max: number | null } | null;
  mode: ModeLivraison;
  /** Le magasin, pour un devis en retrait. */
  retrait: Magasin | null;
  frais_livraison_millimes: number | null;
  /** Le poids du colis (somme des déclinaisons), et le supplément qu'il
   *  ajoute aux frais — déjà compris dans frais_livraison_millimes. */
  poids_grammes?: number;
  supplement_poids_millimes?: number;
  total_millimes: number | null;
};

/** Les raisons de refus de la base, plus deux de la vitrine. */
export type Raison =
  | "boutique" | "cle" | "panier" | "contact" | "adresse" | "compte" | "stock" | "total"
  | "en_attente" | "bloque" | "paiement" | "conditions" | "retrait" | "reseau" | "inconnue";

const RAISONS: Raison[] = [
  "boutique", "cle", "panier", "contact", "adresse", "compte", "stock", "total", "en_attente", "bloque", "paiement", "conditions", "retrait",
];

export function raisonDe(indice: string | null | undefined): Raison {
  return RAISONS.includes(indice as Raison) ? (indice as Raison) : "inconnue";
}

export type ReponseDevis = { ok: true; devis: Devis } | { ok: false; raison: Raison; message: string };
export type ReponsePasser = { ok: true; numero: string } | { ok: false; raison: Raison; message: string };

export type LigneSuivie = {
  produit_nom: string;
  variante_libelle: string | null;
  sku: string | null;
  quantite: number;
  prix_unitaire_millimes: number;
  total_ligne_millimes: number;
  image: string | null;
};

export type CommandeSuivie = {
  numero: string;
  statut: string;
  cree_le: string;
  mode_paiement: string;
  mode_livraison: ModeLivraison;
  /** Le magasin où la retirer (commande en retrait). */
  retrait: Magasin | null;
  contact: { nom: string; telephone: string; email: string | null };
  /** Vide pour une commande à retirer en magasin. */
  livraison: {
    ligne1: string | null;
    ligne2: string | null;
    ville: string | null;
    code_postal: string | null;
    gouvernorat: string | null;
    zone: string | null;
  };
  note_client: string | null;
  sous_total_millimes: number;
  frais_livraison_millimes: number;
  remise_millimes: number;
  total_millimes: number;
  lignes: LigneSuivie[];
};

/** Le cookie qui garde « numéro.jeton » de la dernière commande, pour la
 *  page de fin (HttpOnly : aucun script ne le lit). */
export const COOKIE_COMMANDE = "skanecom_commande";

/** Les 8 chiffres d'un numéro tunisien saisi, ou null. Accepte « 20 123 456 »,
 *  « +216 20 123 456 », « 0021620123456 ». La base revérifie. */
export function chiffresTelephone(saisie: string): string | null {
  const brut = saisie.replace(/[^\d+]/g, "").replace(/^(\+|00)?216(?=\d{8}$)/, "");
  return /^[2-579]\d{7}$/.test(brut) ? brut : null;
}

/** « 21620123456 », « +21620123456 » ou « 20123456 » → « +216 20 123 456 ». */
export function telephoneLisible(numero: string): string {
  const huit = numero.replace(/\D/g, "").replace(/^216(?=\d{8}$)/, "");
  if (!/^\d{8}$/.test(huit)) return numero;
  return `+216 ${huit.slice(0, 2)} ${huit.slice(2, 5)} ${huit.slice(5)}`;
}

/** « Sfax » plutôt que « Sfax, Sfax » quand la ville porte le nom de son
 *  gouvernorat ; « La Marsa, Tunis » sinon. */
export function lieu(ville: string | null, gouvernorat: string | null): string {
  if (!ville || !gouvernorat) return (ville ?? gouvernorat ?? "").trim();
  const pareil = ville.trim().localeCompare(gouvernorat.trim(), "fr", { sensitivity: "base" }) === 0;
  return pareil ? ville.trim() : `${ville.trim()}, ${gouvernorat}`;
}

/** Le prénom, pour « Merci, Amel. » : le premier mot du nom saisi. */
export function prenomDe(nom: string): string {
  return nom.trim().split(/\s+/)[0] ?? nom;
}

/* La clé d'idempotence du panier en cours (navigateur seulement) : la même
   tant que le panier ne change pas, même après un rechargement (réponse
   perdue, puis nouvel essai). Oubliée quand la page de fin vide le panier :
   d'ici là, renvoyer le même panier rend la même commande. */
function aleatoire(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (o) => o.toString(16).padStart(2, "0")).join("");
}

const cleStockage = (boutique: string) => `skanecom.commande.${boutique}`;

export function cleDeCommande(boutique: string, empreinte: string): string {
  try {
    const garde = JSON.parse(window.sessionStorage.getItem(cleStockage(boutique)) ?? "null") as { empreinte?: string; cle?: string } | null;
    if (garde?.empreinte === empreinte && typeof garde.cle === "string") return garde.cle;
  } catch {}
  const nouvelle = `cmd-${aleatoire()}`;
  try {
    window.sessionStorage.setItem(cleStockage(boutique), JSON.stringify({ empreinte, cle: nouvelle }));
  } catch {}
  return nouvelle;
}

export function oublieCleDeCommande(boutique: string): void {
  try {
    window.sessionStorage.removeItem(cleStockage(boutique));
  } catch {}
}
