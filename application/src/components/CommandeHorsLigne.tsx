import Link from "next/link";
import { LogoWhatsApp, Telephone } from "./Icones";
import type { Cadre } from "@/lib/boutique";
import { t } from "@/lib/i18n";

/* ============================================================================
   UN SITE VITRINE NE PREND PAS DE COMMANDE (réglage vitrine.site_vitrine) —
   ce que montrent /commande et le lien d'un panier gardé : la boutique, et
   comment la joindre pour commander (WhatsApp, l'appel, l'e-mail, ce qu'elle
   a renseigné), puis le catalogue.
   ========================================================================== */

export function CommandeHorsLigne({ cadre }: { cadre: Cadre }) {
  const tel = cadre.telephone ? cadre.telephone.replace(/[^\d+]/g, "") : null;
  return (
    <div className="listing-vide tunnel-vide hors-ligne">
      <h1>{t.siteVitrine.commandeTitre}</h1>
      <p>{t.siteVitrine.commandeTexte(cadre.boutique.nom)}</p>
      <div className="hors-ligne-actions">
        {cadre.whatsapp ? (
          <a className="btn btn-primaire" href={`https://wa.me/${cadre.whatsapp}?text=${encodeURIComponent(t.contact.messageWhatsapp(cadre.boutique.nom))}`}
            target="_blank" rel="noopener noreferrer">
            <LogoWhatsApp taille={18} /> {t.siteVitrine.whatsapp}
          </a>
        ) : null}
        {tel ? (
          <a className={cadre.whatsapp ? "btn btn-second" : "btn btn-primaire"} href={`tel:${tel}`}>
            <Telephone taille={18} /> {t.siteVitrine.appeler(cadre.telephone ?? "")}
          </a>
        ) : null}
        {cadre.email ? <a className="lien-souligne" href={`mailto:${cadre.email}`}>{t.siteVitrine.email}</a> : null}
        <Link className="lien-souligne" href="/catalogue">{t.siteVitrine.voirLeCatalogue}</Link>
      </div>
    </div>
  );
}
