import { supabase } from "./supabase";
import { PAGE_AVIS, type FiltreAvis, type PageAvis } from "./avis-communs";

export { noteLisible } from "./avis-communs";

/* ============================================================================
   LES AVIS CLIENTS VÉRIFIÉS (module avis, migration 39) — ce que la vitrine
   lit d'un produit : les avis publiés, leur moyenne et leur répartition.
   `null` quand la boutique n'a pas le module : la fiche ne montre rien.
   ========================================================================== */

/** Une photo jointe à un avis (réglage avis.photos, migration 52). */
export type PhotoAvis = { id: string; chemin: string; largeur: number | null; hauteur: number | null };

export type AvisPublie = {
  id: string;
  note: number;
  texte: string | null;
  /** « Amel B. » : le prénom et une initiale, jamais le nom complet. */
  auteur: string;
  variante_libelle: string | null;
  cree_le: string;
  reponse: string | null;
  repondu_le: string | null;
  /** Vide sans le réglage avis.photos. */
  photos?: PhotoAvis[];
};

export type AvisProduit = {
  total: number;
  moyenne: number | null;
  repartition: Record<"1" | "2" | "3" | "4" | "5", number>;
  avis: AvisPublie[];
  /** « Les photos des clients » : celles des avis publiés, douze au plus, les plus récentes d'abord. */
  photos?: (PhotoAvis & { avis_id: string })[];
  /** Combien d'avis publiés portent des photos (zéro sans le réglage avis.photos ; migration 62). */
  avec_photos?: number;
};


/** Un avis du client connecté, par article commandé (« Mes commandes »). */
export type MonAvis = {
  ligne_id: string;
  commande: string;
  note: number;
  texte: string | null;
  statut: "en_attente" | "publie" | "ecarte";
  reponse: string | null;
  cree_le: string;
  photos?: PhotoAvis[];
};

export async function chargeAvis(boutiqueId: string, produitId: string): Promise<AvisProduit | null> {
  const { data, error } = await supabase.rpc("avis_produit", { p_boutique_id: boutiqueId, p_produit_id: produitId, p_limite: PAGE_AVIS });
  // Une panne des avis ne fait pas tomber la fiche : elle s'affiche sans eux.
  if (error) {
    console.error(`avis_produit : ${error.message}`);
    return null;
  }
  return (data as AvisProduit | null) ?? null;
}

export async function pageAvis(boutiqueId: string, produitId: string, filtre: FiltreAvis, decalage: number): Promise<PageAvis | null> {
  const { data, error } = await supabase.rpc("avis_produit_page", {
    p_boutique_id: boutiqueId, p_produit_id: produitId, p_filtre: filtre, p_decalage: decalage, p_limite: PAGE_AVIS,
  });
  if (error) {
    console.error(`avis_produit_page : ${error.message}`);
    return null;
  }
  return (data as PageAvis | null) ?? null;
}
