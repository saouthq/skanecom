import { Billets, Bouclier, Camion, Magasin, Retour, Telephone } from "./Icones";
import type { Cadre } from "@/lib/boutique";
import { t } from "@/lib/i18n";

/* ============================================================================
   CE QUI RASSURE AVANT D'ACHETER — sous le bloc d'achat de la fiche et de la
   page de vente (structure Monoproduit). Chaque ligne vient d'un réglage
   réel ou d'un module actif, jamais du code.
   ========================================================================== */

export function rassurances(cadre: Cadre) {
  return [
    cadre.retrait
      ? { cle: "retrait", icone: <Magasin />, titre: t.produit.retraitMagasin, texte: t.produit.retraitMagasinTexte(cadre.retrait.ville, t.commande.pretSous(cadre.retrait.delai_heures)) }
      : null,
    cadre.livraison.delai ? { cle: "livraison", icone: <Camion />, titre: cadre.livraison.delai, texte: cadre.livraison.frais ?? "" } : null,
    cadre.livraison.cod
      ? { cle: "cod", icone: <Billets />, titre: t.produit.payezALaLivraison, texte: t.produit.payezALaLivraisonTexte }
      : null,
    cadre.livraison.cod && cadre.livraison.rappel
      ? { cle: "rappel", icone: <Telephone />, titre: t.produit.confirmationTelephonique, texte: t.produit.confirmationTelephoniqueTexte }
      : null,
    cadre.sav?.garantieMois
      ? { cle: "garantie", icone: <Bouclier />, titre: t.annonce.garantie(cadre.sav.garantieMois), texte: t.sav.garantieTexte }
      : null,
    { cle: "refus", icone: <Retour />, titre: t.produit.refusPossible, texte: t.produit.refusPossibleTexte },
  ].filter((r) => r !== null);
}
