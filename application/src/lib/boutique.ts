import { cache } from "react";
import { supabase } from "./supabase";
import { themeDeLaBoutique, type Theme } from "./theme";
import { formatePrix } from "./prix";
import { t } from "./i18n";
import type { Categorie } from "./catalogue";

/* ============================================================================
   LE CADRE DE LA BOUTIQUE — ce que TOUTE page doit savoir, en UN appel
   (public.boutique_publique) : identité, réglages publics, modules actifs,
   thème, rayons actifs, zones de livraison.

   Tout ce que le site raconte du service (frais, délai, paiement, rappel
   téléphonique) sort d'ici, donc de la BASE — jamais d'une phrase écrite dans
   un composant. Le commerçant change un réglage, son site change.

   `cache()` : une seule lecture par requête, même si dix composants
   demandent le cadre.
   ========================================================================== */

export type Zone = {
  nom_fr: string | null;
  nom_ar: string | null;
  frais_millimes: number;
  delai_jours_min: number | null;
  delai_jours_max: number | null;
};

export type Cadre = {
  boutique: {
    id: string;
    slug: string;
    nom: string;
    langue_defaut: "fr" | "ar";
    langues_actives: ("fr" | "ar")[];
    devise: string;
    hote_principal: string | null;
    nb_produits: number;
  };
  reglages: Record<string, unknown>;
  modules: string[];
  theme: Theme;
  categories: Categorie[];
  /** Les rayons de premier niveau, pour la navigation. */
  racines: Categorie[];
  zones: Zone[];
  /** Le montant nu, pour les phrases qui l'écrivent elles-mêmes. `null` en
   *  mode « par zone » : il n'y a alors pas UN frais à annoncer. */
  fraisMillimes: number | null;
  /** Livraison offerte à partir de ce montant d'achat ; `null` = jamais. */
  seuilGratuiteMillimes: number | null;
  livraison: { frais: string | null; delai: string | null; cod: boolean; rappel: boolean };
  konnectActif: boolean;
  prixBarres: boolean;
  whatsapp: string | null;
};

type Brut = {
  boutique: Cadre["boutique"];
  configuration: { reglages: Record<string, unknown>; modules: string[] } | null;
  theme: Record<string, unknown> | null;
  categories: Categorie[];
  zones: Zone[];
};

function reglage<T>(reglages: Record<string, unknown>, cle: string, defaut: T): T {
  const valeur = reglages[cle];
  return valeur === undefined || valeur === null ? defaut : (valeur as T);
}

/** Le délai annoncé : l'enveloppe RÉELLE des zones, jamais un « 48 à 72 h »
 *  écrit à la main. Sans zone lisible, on n'annonce rien. */
function delai(zones: Zone[]): { min: number; max: number } | null {
  const mins = zones.map((z) => z.delai_jours_min).filter((d): d is number => d !== null);
  const maxs = zones.map((z) => z.delai_jours_max).filter((d): d is number => d !== null);
  if (mins.length === 0 || maxs.length === 0) return null;
  return { min: Math.min(...mins), max: Math.max(...maxs) };
}

export const chargeCadre = cache(async (slug: string): Promise<Cadre | null> => {
  const { data, error } = await supabase.rpc("boutique_publique", { p_slug: slug });
  if (error) throw new Error(`Boutique illisible : ${error.message}`);
  if (!data) return null;

  const brut = data as Brut;
  const reglages = brut.configuration?.reglages ?? {};
  const modeFrais = reglage(reglages, "livraison.mode_frais", "fixe");
  const fraisMillimes = Number(reglage(reglages, "livraison.frais_fixes_millimes", 0));
  const seuil = Number(reglage(reglages, "livraison.seuil_gratuite_millimes", 0));
  const seuilTexte = seuil > 0 ? formatePrix(seuil) : undefined;
  const bornes = delai(brut.zones);
  const whatsapp = String(reglage(reglages, "contact.whatsapp", "")).replace(/\D/g, "");

  return {
    boutique: brut.boutique,
    reglages,
    modules: brut.configuration?.modules ?? [],
    theme: themeDeLaBoutique(brut.theme),
    categories: brut.categories,
    racines: brut.categories.filter((c) => c.parent_id === null),
    zones: brut.zones,
    fraisMillimes: modeFrais === "fixe" ? fraisMillimes : null,
    seuilGratuiteMillimes: seuil > 0 ? seuil : null,
    livraison: {
      frais:
        modeFrais === "fixe" && fraisMillimes > 0
          ? t.livraison.fraisFixes(formatePrix(fraisMillimes), seuilTexte)
          : t.livraison.fraisParZone(seuilTexte),
      delai: bornes ? t.livraison.delai(bornes.min, bornes.max) : null,
      cod: reglage(reglages, "paiement.cod_actif", true),
      rappel: reglage(reglages, "commande.mode_confirmation", "telephonique") === "telephonique",
    },
    konnectActif: reglage(reglages, "paiement.konnect_actif", false),
    prixBarres: reglage(reglages, "catalogue.afficher_prix_barres", false),
    whatsapp: whatsapp.length >= 8 ? whatsapp : null,
  };
});

/** Le cadre, ou une erreur explicite : le layout a déjà renvoyé 404 pour une
 *  boutique inconnue, les pages peuvent donc compter dessus. */
export async function cadre(slug: string): Promise<Cadre> {
  const c = await chargeCadre(slug);
  if (!c) throw new Error(`Boutique ${slug} introuvable ou inactive`);
  return c;
}

/** Les sous-rayons (tous niveaux) d'un rayon, lui compris. */
export function descendance(categories: Categorie[], slug: string): Categorie[] {
  const racine = categories.find((c) => c.slug === slug);
  if (!racine) return [];
  const sortie = [racine];
  for (let i = 0; i < sortie.length; i++) {
    for (const c of categories) if (c.parent_id === sortie[i].id) sortie.push(c);
  }
  return sortie;
}
