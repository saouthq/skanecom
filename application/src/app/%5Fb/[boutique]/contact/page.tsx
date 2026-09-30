import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gabarit } from "@/components/Gabarit";
import { Enveloppe, Facebook, Fleche, Instagram, LogoWhatsApp, Magasin, Telephone, TikTok } from "@/components/Icones";
import { cadre as chargeCadre } from "@/lib/boutique";
import { aUnContact, contactDe, lienItineraire } from "@/lib/contact";
import { t } from "@/lib/i18n";

/* ============================================================================
   CONTACT — les moyens de joindre la boutique, en grand et au doigt :
   WhatsApp d'abord (le canal que les acheteurs préfèrent), le téléphone,
   l'e-mail ; puis le magasin ou l'adresse (et l'itinéraire), les horaires,
   les réseaux, et le suivi d'une commande. Tout vient des réglages : sans
   aucun moyen réglé, la page n'existe pas.
   ========================================================================== */

export const revalidate = 300;

export const metadata: Metadata = { title: t.contact.titre };

const ICONES_RESEAU = { instagram: Instagram, facebook: Facebook, tiktok: TikTok };
const NOMS_RESEAU = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };

export default async function Contact({ params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  const c = contactDe(cadre, t.contact.messageWhatsapp(cadre.boutique.nom));
  if (!aUnContact(c)) notFound();
  const lieu = c.magasin ? `${c.magasin.adresse}, ${c.magasin.ville}` : c.adresse;

  return (
    <Gabarit className="enveloppe flex-1 contact-page">
      <header className="contact-tete">
        <p className="etiquette">{t.contact.etiquette}</p>
        <h1>{t.contact.titre}</h1>
        <p className="chapo">{t.contact.chapo(cadre.boutique.nom)}</p>
      </header>

      <div className="contact-grille">
        <ul className="contact-canaux" role="list">
          {c.whatsapp ? (
            <li>
              <a className="contact-canal" data-canal="whatsapp" href={c.whatsapp.href} target="_blank" rel="noopener noreferrer">
                <span className="contact-canal-icone"><LogoWhatsApp taille={24} /></span>
                <span className="contact-canal-texte">
                  <b>{t.contact.ecrireWhatsapp}</b>
                  <span>{c.whatsapp.lisible}</span>
                  <span className="legende">{t.contact.reponseWhatsapp}</span>
                </span>
                <Fleche taille={18} className="icone-fleche rtl:-scale-x-100" />
              </a>
            </li>
          ) : null}
          {c.telephone ? (
            <li>
              <a className="contact-canal" data-canal="telephone" href={c.telephone.href}>
                <span className="contact-canal-icone"><Telephone taille={22} /></span>
                <span className="contact-canal-texte">
                  <b>{t.contact.appeler}</b>
                  <span>{c.telephone.lisible}</span>
                  {c.horaires ? <span className="legende">{c.horaires}</span> : null}
                </span>
                <Fleche taille={18} className="icone-fleche rtl:-scale-x-100" />
              </a>
            </li>
          ) : null}
          {c.email ? (
            <li>
              <a className="contact-canal" data-canal="email" href={c.email.href}>
                <span className="contact-canal-icone"><Enveloppe taille={22} /></span>
                <span className="contact-canal-texte">
                  <b>{t.contact.ecrire}</b>
                  <span>{c.email.lisible}</span>
                </span>
                <Fleche taille={18} className="icone-fleche rtl:-scale-x-100" />
              </a>
            </li>
          ) : null}
        </ul>

        <div className="contact-infos">
          {lieu ? (
            <section>
              <h2>{c.magasin ? t.contact.magasin : t.contact.adresse}</h2>
              <p className="contact-lieu"><Magasin taille={18} /> <span>{lieu}</span></p>
              {c.magasin?.horaires ? <p className="legende">{c.magasin.horaires}</p> : null}
              <a className="lien-souligne" href={lienItineraire(lieu)} target="_blank" rel="noopener noreferrer">{t.contact.itineraire}</a>
            </section>
          ) : null}
          {c.horaires && !c.telephone ? (
            <section>
              <h2>{t.contact.horaires}</h2>
              <p>{c.horaires}</p>
            </section>
          ) : null}
          {c.reseaux.length ? (
            <section>
              <h2>{t.contact.reseaux}</h2>
              <ul className="contact-reseaux" role="list">
                {c.reseaux.map((r) => {
                  const Icone = ICONES_RESEAU[r.reseau];
                  return (
                    <li key={r.reseau}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer me" aria-label={t.pied.reseauAria(NOMS_RESEAU[r.reseau], r.compte)}>
                        <Icone taille={20} /> <span>{r.compte}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <section className="contact-suivi">
            <h2>{t.contact.suivi}</h2>
            <p>{t.contact.suiviTexte}</p>
            <Link className="btn btn-second" href="/suivi">{t.suivi.titre}</Link>
          </section>
        </div>
      </div>
    </Gabarit>
  );
}
