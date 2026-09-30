import { LogoWhatsApp } from "./Icones";
import { t } from "@/lib/i18n";

/* ============================================================================
   LE BOUTON WHATSAPP — réglage vitrine.whatsapp_flottant : un rond vert en
   bas de l'écran, sur toutes les pages, qui ouvre la conversation avec la
   boutique (message déjà commencé). Pas pendant la commande : rien ne doit
   détourner de « Confirmer ». Un simple lien : il marche sans script.
   ========================================================================== */

export function BoutonWhatsApp({ numero, nom }: { numero: string; nom: string }) {
  const lien = `https://wa.me/${numero}?text=${encodeURIComponent(t.contact.messageWhatsapp(nom))}`;
  return (
    <a className="whatsapp-flottant" href={lien} target="_blank" rel="noopener noreferrer" aria-label={t.contact.ecrireWhatsapp}>
      <LogoWhatsApp taille={28} />
      <span className="whatsapp-flottant-bulle" aria-hidden="true">{t.contact.ecrireWhatsapp}</span>
    </a>
  );
}
