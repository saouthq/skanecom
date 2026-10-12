import Link from "next/link";
import { Photo } from "./Photo";
import { FormulaireContact } from "./FormulaireContact";
import { Enveloppe, Fleche, LogoWhatsApp, Magasin, Telephone } from "./Icones";
import type { Cadre } from "@/lib/boutique";
import { contactDe, lienItineraire } from "@/lib/contact";
import { urlFichier } from "@/lib/photos";
import { elementsNumerotes, MAX_ETAPES, MAX_SERVICES, texte, type Section } from "@/lib/theme";
import { t } from "@/lib/i18n";

/* ============================================================================
   LES SECTIONS DU SITE VITRINE — communes à toutes les structures (migration
   …_structure_studio), habillées par la structure Studio (app/studio.css)
   et, ailleurs, par la feuille commune (même fichier, sous .vi-*).

   · SERVICES — ce que fait la maison : jusqu'à six, numérotés, un titre et
     un texte chacun (s1_titre, s1_texte…), une photo facultative.
   · ÉTAPES — la méthode : jusqu'à cinq étapes numérotées. Sur grand écran,
     en Studio et avec les animations expressives, elles défilent de côté
     pendant que la section reste épinglée.
   · CONTACT — « Parlons de votre projet » : les moyens directs (WhatsApp,
     téléphone, e-mail, l'adresse et son itinéraire, les horaires) et le
     formulaire de la boutique, s'il est ouvert. Une seule par accueil :
     son ancre est #contact.

   Chaque texte porte data-texte (sa clé) : l'éditeur de la vitrine l'écrit
   dans l'aperçu. Une section sans élément ne s'affiche pas (l'éditeur le dit).
   ========================================================================== */

/** Un titre de plusieurs lignes (un saut de ligne dans le texte) : une ligne
 *  par bloc, que les animations expressives dévoilent l'une après l'autre. */
export function Lignes({ texte: valeur }: { texte: string }) {
  return (
    <>
      {valeur.split("\n").map((l, i) => (
        <span key={i} className="vi-ligne" style={{ "--l": i } as React.CSSProperties}>
          <span>{l}</span>
        </span>
      ))}
    </>
  );
}

/** Le libellé d'un bouton qui roule au survol : son double monte de dessous
 *  (animations expressives, app/studio.css). Les lecteurs d'écran lisent le premier. */
export function Roule({ children }: { children: string }) {
  return (
    <span className="st-roule">
      <span>{children}</span>
      <span aria-hidden="true">{children}</span>
    </span>
  );
}

const deux = (n: number) => String(n).padStart(2, "0");

export function SectionServices({ rang, section }: { rang: number; section: Extract<Section, { type: "services" }> }) {
  const elements = elementsNumerotes(section.textes, "s", MAX_SERVICES);
  if (elements.length === 0) return null;
  const etiquette = texte(section.textes, "etiquette");
  const titre = texte(section.textes, "titre", t.studio.servicesTitre);
  const chapo = texte(section.textes, "chapo");
  const cta = texte(section.textes, "cta", t.studio.parlonsEn);
  return (
    <section className="vi-services" id="services" data-section={rang} data-avec-image={section.image ? "" : undefined}>
      <div className="enveloppe vi-services-grille">
        <div className="vi-services-tete">
          {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
          <h2 key={titre} data-texte="titre" data-lignes="" className="vi-titre"><Lignes texte={titre} /></h2>
          {chapo ? <p className="chapo" key={chapo} data-texte="chapo">{chapo}</p> : null}
          {section.lien ? (
            <Link className="vi-lien-fleche" href={section.lien}>
              <span key={cta} data-texte="cta">{cta}</span>
              <Fleche taille={16} className="rtl:-scale-x-100" />
            </Link>
          ) : null}
          {section.image ? (
            <div className="vi-services-image apparait">
              <Photo photo={{ src: urlFichier(section.image.chemin), alt: texte(section.textes, "image_alt") }} ratio="4 / 5" tailles="(min-width: 900px) 30vw, 100vw" />
            </div>
          ) : null}
        </div>
        <ol className="vi-services-liste" role="list">
          {elements.map((e, i) => (
            <li key={e.n} className="vi-service apparait">
              <span className="vi-service-num" aria-hidden="true">{deux(i + 1)}</span>
              <div className="vi-service-corps">
                <h3 key={e.titre} data-texte={`s${e.n}_titre`}>{e.titre}</h3>
                {e.texte ? <p key={e.texte} data-texte={`s${e.n}_texte`}>{e.texte}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function SectionEtapes({ rang, section }: { rang: number; section: Extract<Section, { type: "etapes" }> }) {
  const elements = elementsNumerotes(section.textes, "e", MAX_ETAPES);
  if (elements.length === 0) return null;
  const etiquette = texte(section.textes, "etiquette", t.studio.etapesEtiquette);
  const titre = texte(section.textes, "titre", t.studio.etapesTitre);
  return (
    <section className="vi-etapes" id="methode" data-section={rang} style={{ "--n": elements.length } as React.CSSProperties}>
      <div className="vi-etapes-collant">
        <div className="enveloppe vi-etapes-tete">
          <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p>
          <h2 key={titre} data-texte="titre" data-lignes="" className="vi-titre"><Lignes texte={titre} /></h2>
        </div>
        <ol className="vi-etapes-piste" role="list">
          {elements.map((e, i) => (
            <li key={e.n} className="vi-etape apparait">
              <span className="vi-etape-num" aria-hidden="true">{deux(i + 1)}</span>
              <p className="vi-etape-rang">{t.studio.etape(i + 1)}</p>
              <h3 key={e.titre} data-texte={`e${e.n}_titre`}>{e.titre}</h3>
              {e.texte ? <p key={e.texte} data-texte={`e${e.n}_texte`}>{e.texte}</p> : null}
            </li>
          ))}
        </ol>
        <div className="vi-etapes-jauge" aria-hidden="true"><span /></div>
      </div>
    </section>
  );
}

/** « Parlons de votre projet » : sur l'accueil (une section), sur une fiche
 *  de réalisation (`produit` : la demande part avec elle), rang -1 hors accueil. */
export function SectionContact({
  rang,
  section,
  cadre,
  produit = null,
  principal = false,
}: {
  rang: number;
  section: Extract<Section, { type: "contact" }> | null;
  cadre: Cadre;
  produit?: { slug: string; nom: string } | null;
  /** La page Contact elle-même : le titre est celui de la page (h1). */
  principal?: boolean;
}) {
  const textes = section?.textes ?? {};
  // Sur une fiche, l'encart « Un projet similaire ? » pose déjà la question : la section garde ses mots.
  const etiquette = texte(textes, "etiquette", t.studio.contactEtiquette);
  const titre = texte(textes, "titre", t.studio.contactTitre);
  const chapo = texte(textes, "chapo", t.studio.contactChapo);
  const c = contactDe(cadre, produit ? t.siteVitrine.message(cadre.boutique.nom, produit.nom, null) : t.contact.messageWhatsapp(cadre.boutique.nom));
  const lieu = c.magasin ? `${c.magasin.adresse}, ${c.magasin.ville}` : c.adresse;
  const directs = Boolean(c.whatsapp || c.telephone || c.email || lieu);
  if (!cadre.formulaire && !directs) return null;
  const editable = section !== null;
  return (
    <section className="vi-contact" id="contact" data-section={editable ? rang : undefined}>
      <div className="enveloppe vi-contact-grille">
        <div className="vi-contact-tete">
          <p className="etiquette" key={etiquette} data-texte={editable ? "etiquette" : undefined}>{etiquette}</p>
          {principal ? (
            <h1 key={titre} className="vi-titre vi-contact-titre"><Lignes texte={titre} /></h1>
          ) : (
            <h2 key={titre} data-texte={editable ? "titre" : undefined} data-lignes="" className="vi-titre vi-contact-titre"><Lignes texte={titre} /></h2>
          )}
          {chapo ? <p className="chapo" key={chapo} data-texte={editable ? "chapo" : undefined}>{chapo}</p> : null}
          {directs ? (
            <div className="vi-contact-directs">
              {cadre.formulaire ? <p className="vi-contact-ou">{t.formulaire.ouDirectement}</p> : null}
              <ul role="list">
                {c.whatsapp ? (
                  <li>
                    <a href={c.whatsapp.href} target="_blank" rel="noopener noreferrer" data-canal="whatsapp">
                      <LogoWhatsApp taille={20} /> <span><b>{t.contact.ecrireWhatsapp}</b> {c.whatsapp.lisible}</span>
                    </a>
                  </li>
                ) : null}
                {c.telephone ? (
                  <li>
                    <a href={c.telephone.href} data-canal="telephone">
                      <Telephone taille={20} /> <span><b>{t.contact.appeler}</b> {c.telephone.lisible}</span>
                    </a>
                  </li>
                ) : null}
                {c.email ? (
                  <li>
                    <a href={c.email.href} data-canal="email">
                      <Enveloppe taille={20} /> <span><b>{t.contact.ecrire}</b> {c.email.lisible}</span>
                    </a>
                  </li>
                ) : null}
                {lieu ? (
                  <li>
                    <a href={lienItineraire(lieu)} target="_blank" rel="noopener noreferrer" data-canal="lieu">
                      <Magasin taille={20} /> <span><b>{t.contact.itineraire}</b> {lieu}</span>
                    </a>
                  </li>
                ) : null}
              </ul>
              {c.horaires ? <p className="vi-contact-horaires legende">{c.horaires}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="vi-contact-formulaire">
          {cadre.formulaire ? (
            <FormulaireContact boutique={cadre.boutique.nom} sujets={cadre.formulaire.sujets} produit={produit} apercu={cadre.apercu === true} />
          ) : (
            <Link className="btn btn-primaire" href="/contact">{t.siteVitrine.contact}</Link>
          )}
        </div>
      </div>
    </section>
  );
}
