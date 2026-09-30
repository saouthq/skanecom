import { t } from "./i18n";
import { formatePrix } from "./prix";
import type { Cadre } from "./boutique";

/* ============================================================================
   LES FAITS DE SERVICE — ce que le bandeau d'annonce, le menu et le pied
   disent du service. Tous viennent des RÉGLAGES et des modules actifs de la
   boutique, jamais d'une phrase écrite à la main : un commerçant qui coupe
   le paiement à la livraison ne le voit plus annoncé nulle part.
   ========================================================================== */

export function faitsDeService(cadre: Cadre): string[] {
  const faits: string[] = [];
  if (cadre.revendeurOfficiel) faits.push(cadre.revendeurOfficiel);
  if (cadre.livraison.cod) faits.push(t.annonce.cod);
  if (cadre.seuilGratuiteMillimes) faits.push(t.annonce.livraisonOfferte(formatePrix(cadre.seuilGratuiteMillimes)));
  else if (cadre.livraison.delai) faits.push(cadre.livraison.delai);
  if (cadre.retrait) faits.push(t.annonce.retrait);
  if (cadre.sav?.garantieMois) faits.push(t.annonce.garantie(cadre.sav.garantieMois));
  if (cadre.modules.includes("conseil_whatsapp") && cadre.whatsapp) faits.push(t.annonce.conseil);
  return faits;
}

/** Le bandeau en tête du site : l'annonce de la boutique d'abord (réglage
 *  vitrine.annonce), puis ses faits de service. */
export function bandeau(cadre: Cadre): string[] {
  return cadre.annonce ? [cadre.annonce, ...faitsDeService(cadre)] : faitsDeService(cadre);
}

export type Assurance = { icone: "billets" | "camion" | "bouclier" | "magasin"; texte: string };

/** Ce que le tiroir du panier rappelle sous les articles, au moment d'aller
 *  commander : comment on paie, quand ça arrive, ce qui est garanti. Trois au
 *  plus, et seulement ce que la boutique a réglé. */
export function assurancesPanier(cadre: Cadre): Assurance[] {
  const a: Assurance[] = [];
  if (cadre.livraison.cod) a.push({ icone: "billets", texte: t.annonce.cod });
  if (cadre.livraison.delai) a.push({ icone: "camion", texte: cadre.livraison.delai });
  if (cadre.sav?.garantieMois) a.push({ icone: "bouclier", texte: t.annonce.garantie(cadre.sav.garantieMois) });
  else if (cadre.retrait) a.push({ icone: "magasin", texte: t.annonce.retrait });
  return a.slice(0, 3);
}

/** Le lien WhatsApp de conseil, si le module est actif et le numéro réglé. */
export function lienConseil(cadre: Cadre): string | null {
  return cadre.modules.includes("conseil_whatsapp") && cadre.whatsapp ? `https://wa.me/${cadre.whatsapp}` : null;
}
