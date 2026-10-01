import { cache } from "react";
import { supabase } from "./supabase";
import { themeDeLaBoutique, type Theme } from "./theme";
import { formatePrix } from "./prix";
import { reseauxDe, type Reseau } from "./reseaux";
import { t } from "./i18n";
import type { Categorie } from "./catalogue";
import type { Magasin } from "./commande";
import type { Pixels } from "./pixels";

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

export type TranchePoids = { jusqu_a_grammes: number | null; supplement_millimes: number };

/** Une page de la boutique (À propos, questions fréquentes…), publiée. */
export type PageDeBoutique = { slug: string; titre_fr: string; titre_ar: string | null; genre: "texte" | "questions"; dans_pied: boolean };

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
  /** Le supplément selon le poids du colis, par tranche (jusqu'à N grammes ;
   *  null = au-delà) — `null` si la boutique ne l'applique pas. */
  tranchesPoids: TranchePoids[] | null;
  /** Le montant nu, pour les phrases qui l'écrivent elles-mêmes. `null` en
   *  mode « par zone » : il n'y a alors pas UN frais à annoncer. */
  fraisMillimes: number | null;
  /** Livraison offerte à partir de ce montant d'achat ; `null` = jamais. */
  seuilGratuiteMillimes: number | null;
  livraison: { frais: string | null; delai: string | null; delaiJours: { min: number; max: number } | null; cod: boolean; rappel: boolean };
  konnectActif: boolean;
  prixBarres: boolean;
  whatsapp: string | null;
  /** Le magasin où retirer ses commandes, si la boutique le propose (module
   *  retrait_magasin, adresse et ville renseignées) ; `null` sinon. */
  retrait: Magasin | null;
  /** « Revendeur officiel DeWalt » : ce que la boutique affiche d'elle ; `null` sinon. */
  revendeurOfficiel: string | null;
  /** Le service après-vente (module sav) : la garantie annoncée, en mois
   *  (0 : aucune durée) ; `null` sans le module. */
  sav: { garantieMois: number } | null;
  /** Les comptes professionnels (module comptes_pro) : demande depuis le
   *  compte, prix pro lus par le navigateur du pro connecté. */
  comptesPro: boolean;
  /** La demande de devis (module devis) : depuis le panier, suivie dans le compte. */
  devis: boolean;
  /** Réglage `commande.achat_express` : « Commander maintenant » sur la fiche,
   *  droit au tunnel avec cet article seul, sans toucher au panier. */
  achatExpress: boolean;
  /** Réglage `catalogue.prevenir_retour` : « Prévenez-moi de son retour ». */
  prevenirRetour: boolean;
  /** Réglage `commande.relance_paniers`, avec un compte obligatoire : le panier d'un client
   *  connecté est gardé, relançable une fois. */
  relancePaniers: boolean;
  /** Réglage `catalogue.favoris` : le cœur des cartes et des fiches, « Mes favoris ». */
  favoris: boolean;
  /** Réglage `catalogue.achetes_ensemble` : les pièces que les commandes réunissent,
   *  sur la fiche et dans le tiroir du panier. */
  achetesEnsemble: boolean;
  /** Réglage `vitrine.statistiques` : la mesure d'audience, sans cookie. */
  statistiques: boolean;
  /** Réglage `vitrine.partage` : « Partager » sur la fiche. */
  partage: boolean;
  /** Réglages `pub.pixel_meta`, `pub.pixel_tiktok` : les pixels publicitaires
   *  (lib/pixels.ts), chargés avec l'accord du visiteur ; `null` sans aucun. */
  pixels: Pixels | null;
  /** Réglage `vitrine.lettre` : l'inscription à la lettre au pied de page, et
   *  son accroche (`vitrine.lettre_accroche`) ; `null` sans lettre. */
  lettre: { accroche: string | null } | null;
  /** Réglage `livraison.transporteur` : le nom de la société qui livre. */
  transporteur: string | null;
  /** Les avis clients vérifiés (module avis) : sur la fiche, et à donner
   *  depuis « Mes commandes ». */
  avis: boolean;
  /** Réglage `avis.photos` (module avis) : des photos jointes aux avis. */
  avisPhotos: boolean;
  /** Les codes promo (module promotions) : le champ « Vous avez un code ? »
   *  du tunnel. */
  promotions: boolean;
  /** Les pages publiées de la boutique, dans son ordre (migration 43). */
  pages: PageDeBoutique[];
  /** Ses comptes Instagram, Facebook, TikTok (réglages contact.*). */
  reseaux: Reseau[];
  /** Les horaires du service client, tels qu'écrits (page Contact). */
  horaires: string | null;
  /** Réglage `vitrine.whatsapp_flottant` : le bouton WhatsApp sur toutes les pages. */
  whatsappFlottant: boolean;
  /** Réglage `vitrine.annonce` : une phrase en tête du site, avant les faits de service. */
  annonce: string | null;
  /** La page montre le BROUILLON de l'apparence (aperçu de l'écran
   *  « Apparence ») : ni mesure d'audience ni pixels, un bandeau le dit. */
  apercu?: boolean;
};

/** Ce que rendent public.boutique_publique (la vitrine, boutique ouverte) et
 *  public.gestion_cadre (le backoffice, même en préparation). */
export type CadreBrut = {
  boutique: Cadre["boutique"];
  configuration: { reglages: Record<string, unknown>; modules: string[] } | null;
  theme: Record<string, unknown> | null;
  categories: Categorie[];
  zones: Zone[];
  tranches_poids: TranchePoids[] | null;
  pages?: PageDeBoutique[];
};

/** Les pixels, de la forme que la base exige (migration 63) — relue ici : ils
 *  s'écrivent dans la page. Aucun : `null`. */
function pixelsDe(meta: string, tiktok: string): Pixels | null {
  const m = /^[0-9]{10,20}$/.test(meta) ? meta : null;
  const k = /^[A-Z0-9]{16,24}$/.test(tiktok) ? tiktok : null;
  return m || k ? { meta: m, tiktok: k } : null;
}

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

/** Le cadre d'une boutique. `segment` est le premier segment de l'adresse
 *  interne : le slug, ou `<slug>~<jeton>.<version>` quand la façade sert
 *  l'aperçu d'un brouillon de la vitrine (src/proxy.ts) — le thème prend alors
 *  le brouillon (structure, couleurs, polices, style, et l'accueil s'il en
 *  porte un), si le jeton est bon. */
export const chargeCadre = cache(async (segment: string): Promise<Cadre | null> => {
  const [slug, apercu] = segment.split("~", 2);
  const jeton = apercu?.split(".")[0] ?? null;
  const [{ data, error }, brouillon] = await Promise.all([
    supabase.rpc("boutique_publique", { p_slug: slug }),
    jeton && /^[0-9a-f-]{36}$/.test(jeton)
      ? supabase.rpc("apercu_apparence", { p_slug: slug, p_jeton: jeton }).then((r) => (r.error ? null : (r.data as Record<string, unknown> | null)))
      : Promise.resolve(null),
  ]);
  if (error) throw new Error(`Boutique illisible : ${error.message}`);
  if (!data) return null;
  const brut = data as CadreBrut;
  if (!brouillon || !brut.theme) return { ...cadreDe(brut), apercu: false };
  const { code, couleurs, polices, style } = brouillon;
  const accueil = "sections" in brouillon ? { sections: brouillon.sections } : {};
  return { ...cadreDe({ ...brut, theme: { ...brut.theme, code, couleurs, polices, style, ...accueil } }), apercu: true };
});

/** Le cadre, composé de ce que la base a rendu. */
export function cadreDe(brut: CadreBrut): Cadre {
  const reglages = brut.configuration?.reglages ?? {};
  const modeFrais = reglage(reglages, "livraison.mode_frais", "fixe");
  const fraisMillimes = Number(reglage(reglages, "livraison.frais_fixes_millimes", 0));
  const seuil = Number(reglage(reglages, "livraison.seuil_gratuite_millimes", 0));
  const seuilTexte = seuil > 0 ? formatePrix(seuil) : undefined;
  const bornes = delai(brut.zones);
  const whatsapp = String(reglage(reglages, "contact.whatsapp", "")).replace(/\D/g, "");
  const texteDe = (cle: string) => String(reglage(reglages, cle, "")).trim();
  const modules = brut.configuration?.modules ?? [];
  const auPoids = Boolean(brut.tranches_poids?.some((x) => x.supplement_millimes > 0));

  return {
    boutique: brut.boutique,
    reglages,
    modules,
    theme: themeDeLaBoutique(brut.theme),
    categories: brut.categories,
    racines: brut.categories.filter((c) => c.parent_id === null),
    zones: brut.zones,
    tranchesPoids: auPoids ? brut.tranches_poids : null,
    fraisMillimes: modeFrais === "fixe" ? fraisMillimes : null,
    seuilGratuiteMillimes: seuil > 0 ? seuil : null,
    livraison: {
      frais:
        (modeFrais === "fixe" && fraisMillimes > 0
          ? t.livraison.fraisFixes(formatePrix(fraisMillimes), seuilTexte)
          : t.livraison.fraisParZone(seuilTexte)) + (auPoids ? ` ${t.livraison.supplementPoids}` : ""),
      delai: bornes ? t.livraison.delai(bornes.min, bornes.max) : null,
      delaiJours: bornes,
      cod: reglage(reglages, "paiement.cod_actif", true),
      rappel: reglage(reglages, "commande.mode_confirmation", "telephonique") === "telephonique",
    },
    konnectActif: reglage(reglages, "paiement.konnect_actif", false),
    prixBarres: reglage(reglages, "catalogue.afficher_prix_barres", false),
    whatsapp: whatsapp.length >= 8 ? whatsapp : null,
    retrait: modules.includes("retrait_magasin") && texteDe("retrait.adresse") && texteDe("retrait.ville")
      ? {
          adresse: texteDe("retrait.adresse"),
          ville: texteDe("retrait.ville"),
          horaires: texteDe("retrait.horaires") || null,
          delai_heures: Number(reglage(reglages, "retrait.delai_heures", 24)) || 24,
        }
      : null,
    revendeurOfficiel: texteDe("catalogue.revendeur_officiel") || null,
    sav: modules.includes("sav") ? { garantieMois: Number(reglage(reglages, "sav.garantie_mois", 0)) || 0 } : null,
    comptesPro: modules.includes("comptes_pro"),
    devis: modules.includes("devis"),
    achatExpress: reglage<boolean>(reglages, "commande.achat_express", false) === true,
    prevenirRetour: reglage<boolean>(reglages, "catalogue.prevenir_retour", false) === true,
    relancePaniers: reglage<boolean>(reglages, "commande.relance_paniers", false) === true
      && reglage<boolean>(reglages, "compte.obligatoire", true) !== false,
    favoris: reglage<boolean>(reglages, "catalogue.favoris", false) === true,
    achetesEnsemble: reglage<boolean>(reglages, "catalogue.achetes_ensemble", false) === true,
    statistiques: reglage<boolean>(reglages, "vitrine.statistiques", false) === true,
    partage: reglage<boolean>(reglages, "vitrine.partage", false) === true,
    pixels: pixelsDe(texteDe("pub.pixel_meta"), texteDe("pub.pixel_tiktok")),
    lettre: reglage<boolean>(reglages, "vitrine.lettre", false) === true ? { accroche: texteDe("vitrine.lettre_accroche") || null } : null,
    transporteur: texteDe("livraison.transporteur") || null,
    avis: modules.includes("avis"),
    avisPhotos: modules.includes("avis") && reglage<boolean>(reglages, "avis.photos", false) === true,
    promotions: modules.includes("promotions"),
    pages: brut.pages ?? [],
    reseaux: reseauxDe(reglages),
    horaires: texteDe("contact.horaires") || null,
    whatsappFlottant: reglage<boolean>(reglages, "vitrine.whatsapp_flottant", false) === true && whatsapp.length >= 8,
    annonce: texteDe("vitrine.annonce") || null,
  };
}

/** Le cadre, ou une erreur explicite : le layout a déjà renvoyé 404 pour une
 *  boutique inconnue, les pages peuvent donc compter dessus. */
export async function cadre(slug: string): Promise<Cadre> {
  const c = await chargeCadre(slug);
  if (!c) throw new Error(`Boutique ${slug} introuvable ou inactive`);
  return c;
}

/** Les sous-rayons (tous niveaux) d'un rayon, lui compris. */
/** Les rayons de premier niveau qui ont au moins une pièce publiée
 *  (sous-rayons compris) : l'accueil ne montre pas une vignette vide. */
export function racinesGarnies(cadre: Pick<Cadre, "racines" | "categories">): Categorie[] {
  return cadre.racines.filter((r) => descendance(cadre.categories, r.slug).some((c) => (c.nb_produits ?? 0) > 0));
}

export function descendance(categories: Categorie[], slug: string): Categorie[] {
  const racine = categories.find((c) => c.slug === slug);
  if (!racine) return [];
  const sortie = [racine];
  for (let i = 0; i < sortie.length; i++) {
    for (const c of categories) if (c.parent_id === sortie[i].id) sortie.push(c);
  }
  return sortie;
}
