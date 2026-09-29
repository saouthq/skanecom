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
  if (cadre.livraison.cod) faits.push(t.annonce.cod);
  if (cadre.seuilGratuiteMillimes) faits.push(t.annonce.livraisonOfferte(formatePrix(cadre.seuilGratuiteMillimes)));
  else if (cadre.livraison.delai) faits.push(cadre.livraison.delai);
  if (cadre.retrait) faits.push(t.annonce.retrait);
  if (cadre.modules.includes("conseil_whatsapp") && cadre.whatsapp) faits.push(t.annonce.conseil);
  return faits;
}

/** Le lien WhatsApp de conseil, si le module est actif et le numéro réglé. */
export function lienConseil(cadre: Cadre): string | null {
  return cadre.modules.includes("conseil_whatsapp") && cadre.whatsapp ? `https://wa.me/${cadre.whatsapp}` : null;
}
