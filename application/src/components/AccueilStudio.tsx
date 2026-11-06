import Link from "next/link";
import { Photo } from "./Photo";
import { PhotoOuverture } from "./PhotoOuverture";
import { Engagements } from "./AccueilEditorial";
import { SectionBannieres, SectionLookbook, SectionPiece } from "./SectionsCommunes";
import { AvisClients, Marques, QuestionsFrequentes } from "./SectionsBibliotheque";
import { Lignes, SectionContact, SectionEtapes, SectionServices } from "./SectionsVitrine";
import { CarteProjet } from "./Projets";
import { Fleche } from "./Icones";
import { descendance, racinesGarnies, type Cadre } from "@/lib/boutique";
import type { Produit } from "@/lib/catalogue";
import type { DonneesAccueil } from "@/lib/accueil";
import { aUnContact, contactDe } from "@/lib/contact";
import { texte, type Section } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";
import { champ, t } from "@/lib/i18n";

/* ============================================================================
   L'ACCUEIL STUDIO — le site vitrine qui se fait contacter : un studio
   d'architecture, une agence, un artisan sur mesure, un restaurant.

   Une page claire et tenue, à la manière des meilleurs sites de produit :
   l'ouverture centrée (une pastille, le titre, deux gestes), la photo posée
   dans un cadre ; le manifeste en une phrase forte ; les réalisations en
   cartes ; les domaines en tuiles ; les services, la méthode, le récit ;
   « Parlons de votre projet ». Rien ne bouge sans raison : les apparitions
   sobres de la vitrine, et les animations « expressives » si la boutique les
   choisit (app/studio.css).
   Les fiches et le catalogue sont ceux du Studio (components/Projets.tsx).
   Préfixe st- (vi- pour les sections communes).
   ========================================================================== */

type Props = { cadre: Cadre; donnees: DonneesAccueil };

export function AccueilStudio({ cadre, donnees }: Props) {
  const garnis = racinesGarnies(cadre);
  return (
    <div className="st-accueil">
      {cadre.theme.sections.map((s, i) => {
        switch (s.type) {
          case "hero":
            return <Ouverture key={i} rang={i} section={s} cadre={cadre} />;
          case "texte":
            return <Manifeste key={i} rang={i} section={s} />;
          case "selection": {
            const produits = donnees.selections.get(i) ?? [];
            return produits.length ? <Realisations key={i} rang={i} section={s} produits={produits} /> : null;
          }
          case "rayons":
            return garnis.length > 1 ? <Domaines key={i} rang={i} section={s} cadre={cadre} rayons={garnis} /> : null;
          case "editorial":
            return <Recit key={i} rang={i} section={s} cadre={cadre} />;
          case "services":
            return <SectionServices key={i} rang={i} section={s} />;
          case "etapes":
            return <SectionEtapes key={i} rang={i} section={s} />;
          case "contact":
            return <SectionContact key={i} rang={i} section={s} cadre={cadre} />;
          case "piece":
            return <SectionPiece key={i} rang={i} section={s} donnees={donnees} cadre={cadre} />;
          case "lookbook":
            return <SectionLookbook key={i} rang={i} section={s} donnees={donnees} cadre={cadre} />;
          case "bannieres":
            return <SectionBannieres key={i} rang={i} section={s} cadre={cadre} />;
          case "engagements":
            return <Engagements key={i} rang={i} section={s} cadre={cadre} />;
          case "avis":
            return donnees.avis ? (
              <div key={i} className="enveloppe ed-section" data-section={i}>
                <AvisClients avis={donnees.avis} gabarit="editorial"
                  tete={<Tete titre={texte(s.textes, "titre", t.accueil.avisTitre)} etiquette={texte(s.textes, "etiquette", t.accueil.avisEtiquette)} />} />
              </div>
            ) : null;
          case "questions": {
            const q = donnees.questions.get(i);
            return q ? (
              <div key={i} className="enveloppe ed-section" data-section={i}>
                <QuestionsFrequentes questions={q} gabarit="editorial"
                  tete={() => <Tete titre={texte(s.textes, "titre", t.accueil.questionsTitre)} etiquette={texte(s.textes, "etiquette") || undefined} />} />
              </div>
            ) : null;
          }
          case "marques":
            return donnees.marques.length ? (
              <div key={i} className="enveloppe ed-section" data-section={i}>
                <Marques marques={donnees.marques} gabarit="editorial"
                  tete={<Tete titre={texte(s.textes, "titre", t.accueil.marquesTitre)} etiquette={texte(s.textes, "etiquette") || undefined} />} />
              </div>
            ) : null;
        }
      })}
    </div>
  );
}

function Tete({ titre, etiquette }: { titre: string; etiquette?: string }) {
  return (
    <div className="ed-section-tete st-tete">
      <div>
        {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
        <h2 key={titre} data-texte="titre" data-lignes="" className="vi-titre"><Lignes texte={titre} /></h2>
      </div>
    </div>
  );
}

/* L'ouverture : centrée — la pastille, le titre, le chapô, le geste
   principal et « Parlons de votre projet » ; dessous, la photo dans son
   cadre, sur une lueur de la couleur de la maison. */
function Ouverture({ rang, section, cadre }: { rang: number; section: Extract<Section, { type: "hero" }>; cadre: Cadre }) {
  const titre = texte(section.textes, "titre", cadre.boutique.nom);
  const chapo = texte(section.textes, "chapo") || texte(cadre.theme.textes, "resume");
  const etiquette = texte(section.textes, "etiquette");
  const alt = texte(section.textes, "image_alt", cadre.boutique.nom);
  const lien = section.lien ?? "/catalogue";
  const cta = texte(section.textes, "cta", t.studio.toutesLesRealisations);
  const image = section.image && !section.image.detouree ? section.image : null;
  const contact = aUnContact(contactDe(cadre)) || Boolean(cadre.formulaire);
  return (
    <section className="st-ouverture" data-section={rang} data-sans-image={image ? undefined : ""}>
      <div className="st-ouverture-fond" aria-hidden="true" />
      <div className="enveloppe st-ouverture-tete">
        {etiquette ? <p className="etiquette st-ouverture-etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
        <h1 className="vi-titre st-ouverture-titre" key={titre} data-texte="titre" data-lignes=""><Lignes texte={titre} /></h1>
        {chapo ? <p className="chapo st-ouverture-chapo" key={chapo} data-texte="chapo">{chapo}</p> : null}
        <div className="st-gestes">
          <Link className="btn btn-primaire st-geste" href={lien}>
            <span key={cta} data-texte="cta">{cta}</span>
            <Fleche taille={16} className="icone-fleche rtl:-scale-x-100" />
          </Link>
          {contact && lien !== "/contact" ? <Link className="btn btn-second st-geste" href="/contact">{t.studio.parlonsDeVotreProjet}</Link> : null}
        </div>
      </div>
      {image ? (
        <div className="enveloppe st-ouverture-media">
          <div className="st-cadre">
            <div className="st-ouverture-cadre">
              <PhotoOuverture className="st-ouverture-image" paysage={urlFichier(image.chemin)} portrait={image.portrait ? urlFichier(image.portrait) : undefined} alt={alt} />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Le manifeste en deux temps : sa première phrase, en encre ; la suite, en retrait. */
function deuxTemps(corps: string): [string, string] {
  const m = /^(.+?[.!?…])\s+(\S[\s\S]*)$/.exec(corps.trim());
  return m ? [m[1], m[2]] : [corps.trim(), ""];
}

/* Le manifeste : une seule phrase forte, centrée ; la suite en retrait. */
function Manifeste({ rang, section }: { rang: number; section: Extract<Section, { type: "texte" }> }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  const etiquette = texte(section.textes, "etiquette");
  const [fort, suite] = deuxTemps(corps);
  return (
    <section className="enveloppe st-manifeste" data-section={rang}>
      {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
      {titre ? <h2 className="st-manifeste-titre" key={titre} data-texte="titre">{titre}</h2> : null}
      {corps ? (
        <p className="st-manifeste-texte" key={corps} data-texte="texte">
          <span className="st-manifeste-fort">{fort}</span>
          {suite ? <> <span className="st-manifeste-suite">{suite}</span></> : null}
        </p>
      ) : null}
    </section>
  );
}

/* La tête d'une section : la pastille et le titre ; à droite, son lien. */
function TeteSection({ etiquette, titre, lien }: { etiquette?: string; titre: string; lien?: { href: string; texte: string } }) {
  return (
    <div className="enveloppe st-section-tete">
      <div className="st-section-titres">
        {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
        <h2 className="vi-titre" key={titre} data-texte="titre" data-lignes=""><Lignes texte={titre} /></h2>
      </div>
      {lien ? (
        <Link className="st-lien" href={lien.href}>
          <span key={lien.texte} data-texte="cta">{lien.texte}</span>
          <Fleche taille={16} className="icone-fleche rtl:-scale-x-100" />
        </Link>
      ) : null}
    </div>
  );
}

/* Les réalisations choisies : des cartes, trois de front sur ordinateur. */
function Realisations({ rang, section, produits }: { rang: number; section: Extract<Section, { type: "selection" }>; produits: Produit[] }) {
  const lien = section.lien ?? (section.rayon ? `/categorie/${section.rayon}` : "/catalogue");
  const titre = texte(section.textes, "titre", t.studio.realisations);
  const etiquette = texte(section.textes, "etiquette", t.studio.realisationsEtiquette);
  const cta = texte(section.textes, "cta", t.studio.toutesLesRealisations);
  return (
    <section className="st-realisations st-section" data-section={rang}>
      <TeteSection etiquette={etiquette} titre={titre} lien={{ href: lien, texte: cta }} />
      <div className="enveloppe st-grille-projets">
        {produits.map((p) => (
          <CarteProjet key={p.id} produit={p} />
        ))}
      </div>
    </section>
  );
}

/* Les domaines (les rayons) en tuiles : la photo du domaine, son nom, le nombre de projets. */
function Domaines({ rang, section, cadre, rayons }: { rang: number; section: Extract<Section, { type: "rayons" }>; cadre: Cadre; rayons: Cadre["racines"] }) {
  const compte = (slug: string) => descendance(cadre.categories, slug).reduce((n, c) => n + (c.nb_produits ?? 0), 0);
  const titre = texte(section.textes, "titre", t.studio.domainesTitre);
  const etiquette = texte(section.textes, "etiquette");
  return (
    <section className="st-domaines-section st-section" data-section={rang}>
      <TeteSection etiquette={etiquette || undefined} titre={titre} />
      <ul className="enveloppe st-domaines-grille" role="list">
        {rayons.map((r) => (
          <li key={r.slug} className="apparait">
            <Link className="st-carte st-domaine" href={`/categorie/${r.slug}`}>
              {r.image_chemin ? (
                <span className="st-carte-photo">
                  <Photo photo={{ src: urlFichier(r.image_chemin), alt: "" }} ratio="4 / 3" tailles="(min-width: 1000px) 22vw, (min-width: 640px) 45vw, 92vw" />
                </span>
              ) : null}
              <span className="st-carte-corps">
                <span className="st-carte-textes">
                  <span className="st-carte-nom">{champ(r, "nom")}</span>
                  <span className="st-carte-ligne">{t.studio.domaine(compte(r.slug))}</span>
                </span>
                <Fleche taille={16} className="st-carte-fleche rtl:-scale-x-100" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Le récit : une carte, la photo d'un côté, le texte de l'autre. */
function Recit({ rang, section, cadre }: { rang: number; section: Extract<Section, { type: "editorial" }>; cadre: Cadre }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  const etiquette = texte(section.textes, "etiquette");
  const cta = texte(section.textes, "cta", t.accueil.recitLien);
  return (
    <section className="st-recit st-section" data-section={rang} data-sans-image={section.image ? undefined : ""}>
      <div className="enveloppe">
        <div className="st-recit-carte">
          {section.image ? (
            <div className="st-recit-image">
              <Photo photo={{ src: urlFichier(section.image.chemin), alt: texte(section.textes, "image_alt", cadre.boutique.nom) }} ratio="4 / 5" tailles="(min-width: 900px) 46vw, 100vw" />
            </div>
          ) : null}
          <div className="st-recit-texte">
            {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
            {titre ? <h2 className="vi-titre" key={titre} data-texte="titre" data-lignes=""><Lignes texte={titre} /></h2> : null}
            {corps ? <p className="chapo" key={corps} data-texte="texte">{corps}</p> : null}
            {section.lien ? (
              <Link className="btn btn-second st-geste" href={section.lien}>
                <span key={cta} data-texte="cta">{cta}</span>
                <Fleche taille={16} className="icone-fleche rtl:-scale-x-100" />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
