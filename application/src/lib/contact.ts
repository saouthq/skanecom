import { identiteLegale, numeroLisible } from "./legal";
import type { Cadre } from "./boutique";
import type { Magasin } from "./commande";
import type { Reseau } from "./reseaux";

/* ============================================================================
   LES MOYENS DE JOINDRE LA BOUTIQUE — tous lus dans ses réglages : le
   téléphone et WhatsApp (contact.*), l'e-mail et l'adresse (legal.*), le
   magasin (module retrait), les horaires, les réseaux. La page Contact n'existe
   que si la boutique en a au moins un ; le pied de page n'y renvoie qu'alors.
   ========================================================================== */

export type Contact = {
  telephone: { href: string; lisible: string } | null;
  whatsapp: { href: string; lisible: string } | null;
  email: { href: string; lisible: string } | null;
  adresse: string | null;
  magasin: Magasin | null;
  horaires: string | null;
  reseaux: Reseau[];
};

export function contactDe(cadre: Cadre, messageWhatsapp?: string): Contact {
  const id = identiteLegale(cadre);
  const tel = id.telephone ? id.telephone.replace(/[^\d+]/g, "") : "";
  return {
    telephone: tel.length >= 8 ? { href: `tel:${tel}`, lisible: numeroLisible(tel) } : null,
    whatsapp: cadre.whatsapp
      ? { href: `https://wa.me/${cadre.whatsapp}${messageWhatsapp ? `?text=${encodeURIComponent(messageWhatsapp)}` : ""}`, lisible: numeroLisible(cadre.whatsapp) }
      : null,
    email: id.email ? { href: `mailto:${id.email}`, lisible: id.email } : null,
    adresse: id.adresse,
    magasin: cadre.retrait,
    horaires: cadre.horaires,
    reseaux: cadre.reseaux,
  };
}

export function aUnContact(c: Contact): boolean {
  return Boolean(c.telephone || c.whatsapp || c.email || c.adresse || c.magasin);
}

/** L'itinéraire vers une adresse (Google Maps, recherche par l'adresse). */
export function lienItineraire(adresse: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
}
