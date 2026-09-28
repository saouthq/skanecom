import { cache } from "react";
import {
  chargeCategories,
  chargeReglages,
  chargeZones,
  delaiCatalogue,
  reglage,
  type Categorie,
} from "./catalogue";
import { formatePrix } from "./prix";
import { t } from "./i18n";

/* ============================================================================
   LE CADRE DE LA BOUTIQUE — ce que TOUTE page doit savoir.

   Rayons réels + réglages d'exploitation + zones de livraison. Tout ce que le
   site raconte du service (frais, délai, mode de paiement, rappel
   téléphonique) sort d'ici, donc de la BASE — jamais d'une phrase écrite dans
   un composant. C'est le principe directeur du PRD appliqué à la vitrine :
   le père change un réglage, le site change.

   `cache()` : une seule lecture par requête HTTP, même si trois composants
   demandent le cadre.
   ========================================================================== */

export type Cadre = {
  categories: Categorie[];
  /** Le montant nu, pour les endroits qui l'écrivent dans leur propre phrase.
   *  `null` en mode « par zone » : il n'y a alors pas UN frais à annoncer. */
  fraisMillimes: number | null;
  livraison: {
    frais: string | null;
    delai: string | null;
    cod: boolean;
    rappel: boolean;
  };
  konnectActif: boolean;
};

export const chargeCadre = cache(async (): Promise<Cadre> => {
  const [categories, reglages, zones] = await Promise.all([
    chargeCategories(),
    chargeReglages(),
    chargeZones(),
  ]);

  const modeFrais = reglage(reglages, "livraison.mode_frais", "fixe");
  const fraisMillimes = Number(reglage(reglages, "livraison.frais_fixes_millimes", 0));

  /* Le délai annoncé est l'enveloppe réelle des zones (1 à 5 jours au 11/08),
     pas le « 48 à 72 h » de la maquette — ce chiffre-là était plausible, pas
     mesuré. Sans zone lisible, on n'annonce aucun délai plutôt qu'un faux. */
  const bornes = delaiCatalogue(zones);

  return {
    categories,
    fraisMillimes: modeFrais === "fixe" ? fraisMillimes : null,
    livraison: {
      frais:
        modeFrais === "fixe" && fraisMillimes > 0
          ? t.livraison.fraisFixes(formatePrix(fraisMillimes))
          : t.livraison.fraisParZone,
      delai: bornes ? t.livraison.delai(bornes.min, bornes.max) : null,
      cod: reglage(reglages, "paiement.cod_actif", true),
      rappel: reglage(reglages, "commande.mode_confirmation", "telephonique") === "telephonique",
    },
    konnectActif: reglage(reglages, "paiement.konnect_actif", false),
  };
});
