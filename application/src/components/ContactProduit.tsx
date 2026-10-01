import { LogoWhatsApp, Telephone } from "./Icones";
import { t } from "@/lib/i18n";

/* ============================================================================
   « CETTE PIÈCE VOUS INTÉRESSE ? » — à la place du panier, sur la fiche d'un
   site vitrine (réglage vitrine.site_vitrine, migration 73) : WhatsApp (le
   message déjà commencé, avec la pièce, sa déclinaison et sa référence),
   l'appel, l'e-mail ; ce que la boutique a renseigné, rien d'autre. Sans
   aucun des trois, la page Contact.
   ========================================================================== */

export type ContactVente = { boutique: string; whatsapp: string | null; telephone: string | null; email: string | null };

/** Les moyens de joindre la boutique, tels que le cadre les donne. */
export function contactVente(cadre: { boutique: { nom: string }; whatsapp: string | null; telephone: string | null; email: string | null }): ContactVente {
  return { boutique: cadre.boutique.nom, whatsapp: cadre.whatsapp, telephone: cadre.telephone, email: cadre.email };
}

/** Le lien WhatsApp d'une pièce, message commencé. */
export function lienWhatsappPiece(contact: ContactVente, piece: string, reference: string | null): string | null {
  return contact.whatsapp ? `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(t.siteVitrine.message(contact.boutique, piece, reference))}` : null;
}

export function ContactProduit({ contact, piece, reference }: { contact: ContactVente; piece: string; reference: string | null }) {
  const whatsapp = lienWhatsappPiece(contact, piece, reference);
  const tel = contact.telephone ? contact.telephone.replace(/[^\d+]/g, "") : null;
  const courriel = contact.email
    ? `mailto:${contact.email}?subject=${encodeURIComponent(t.siteVitrine.sujet(piece))}&body=${encodeURIComponent(t.siteVitrine.message(contact.boutique, piece, reference))}`
    : null;
  return (
    <div className="fiche-contact" role="group" aria-labelledby="fiche-contact-titre">
      <p className="fiche-contact-titre" id="fiche-contact-titre">{t.siteVitrine.interesse}</p>
      <p className="legende">{t.siteVitrine.interesseTexte}</p>
      <div className="fiche-contact-actions">
        {whatsapp ? (
          <a className="btn btn-primaire fiche-contact-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer">
            <LogoWhatsApp taille={18} /> {t.siteVitrine.whatsapp}
          </a>
        ) : null}
        {tel ? (
          <a className={whatsapp ? "btn btn-second" : "btn btn-primaire"} href={`tel:${tel}`}>
            <Telephone taille={18} /> {t.siteVitrine.appeler(contact.telephone ?? "")}
          </a>
        ) : null}
        {courriel ? <a className="lien-souligne fiche-contact-email" href={courriel}>{t.siteVitrine.email}</a> : null}
        {!whatsapp && !tel && !courriel ? <a className="btn btn-primaire" href="/contact">{t.siteVitrine.contact}</a> : null}
      </div>
    </div>
  );
}
