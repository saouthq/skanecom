import Link from "next/link";
import { Photo } from "./Photo";
import { PhotoOuverture } from "./PhotoOuverture";
import { Engagements } from "./AccueilEditorial";
import { SectionBannieres, SectionLookbook, SectionPiece } from "./SectionsCommunes";
import { AvisClients, Marques, QuestionsFrequentes } from "./SectionsBibliotheque";
import { Lignes, SectionContact, SectionEtapes, SectionServices } from "./SectionsVitrine";
import { CarteProjet } from "./Projets";
import { Fleche } from "./Icones";
import { HeureLocale } from "./HeureLocale";
import { descendance, racinesGarnies, type Cadre } from "@/lib/boutique";
import type { Produit } from "@/lib/catalogue";
import type { DonneesAccueil } from "@/lib/accueil";
import { texte, type Section } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";
import { champ, t } from "@/lib/i18n";

/* ============================================================================
   L'ACCUEIL STUDIO — le site vitrine qui se fait contacter : un studio
   d'architecture, une agence, un artisan sur mesure, un restaurant.

   On lit une maison avant de voir un produit : le titre immense d'abord,
   ligne après ligne ; la photo qui s'ouvre au défilement jusqu'à prendre la
   largeur ; le manifeste qui s'allume mot à mot à la lecture ; les
   réalisations en grand, en deux colonnes décalées ; les domaines en liste
   typographique (la photo du domaine suit la souris) ; les services ; la
   méthode qui défile de côté, épinglée ; le récit ; « Parlons de votre
   projet ». Les animations « expressives » (app/studio.css) sont celles que
   la structure conseille ; « sobres » ou coupées, tout est posé d'emblée.
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

/** Le lieu de la maison : la ville de son magasin, sinon le début de son adresse. */
function lieuDe(cadre: Cadre): string {
  const ville = String(cadre.reglages["retrait.ville"] ?? "").trim();
  const adresse = String(cadre.reglages["legal.adresse"] ?? "").split(",")[0]?.trim();
  return ville || adresse || "Tunis";
}

/* Le titre d'abord, immense, qui monte ligne après ligne ; dessous, la photo
   posée en retrait qui s'ouvre au défilement jusqu'à prendre la largeur. */
function Ouverture({ rang, section, cadre }: { rang: number; section: Extract<Section, { type: "hero" }>; cadre: Cadre }) {
  const titre = texte(section.textes, "titre", cadre.boutique.nom);
  const chapo = texte(section.textes, "chapo") || texte(cadre.theme.textes, "resume");
  const etiquette = texte(section.textes, "etiquette");
  const alt = texte(section.textes, "image_alt", cadre.boutique.nom);
  const lien = section.lien ?? "/catalogue";
  const cta = texte(section.textes, "cta", t.studio.toutesLesRealisations);
  const image = section.image && !section.image.detouree ? section.image : null;
  return (
    <section className="st-ouverture" data-section={rang} data-sans-image={image ? undefined : ""}>
      <div className="enveloppe st-ouverture-tete">
        <div className="st-ouverture-haut">
          {etiquette ? <p className="etiquette st-ouverture-etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
          <HeureLocale lieu={lieuDe(cadre)} />
        </div>
        <h1 className="vi-titre st-ouverture-titre" key={titre} data-texte="titre" data-lignes=""><Lignes texte={titre} /></h1>
        <div className="st-ouverture-pied">
          {chapo ? <p className="chapo st-ouverture-chapo" key={chapo} data-texte="chapo">{chapo}</p> : null}
          <Link className="st-cta" href={lien}>
            <span key={cta} data-texte="cta">{cta}</span>
            <span className="st-cta-rond" aria-hidden="true" data-aimant=""><Fleche taille={18} className="rtl:-scale-x-100" /></span>
          </Link>
        </div>
      </div>
      {image ? (
        <div className="st-ouverture-media">
          <div className="st-ouverture-cadre">
            <PhotoOuverture className="st-ouverture-image" paysage={urlFichier(image.chemin)} portrait={image.portrait ? urlFichier(image.portrait) : undefined} alt={alt} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* Le manifeste : de grands caractères qui s'allument mot à mot, à mesure
   qu'on les lit (les animations expressives) ; sinon, posés d'emblée. */
function Manifeste({ rang, section }: { rang: number; section: Extract<Section, { type: "texte" }> }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  const etiquette = texte(section.textes, "etiquette");
  return (
    <section className="enveloppe st-manifeste" data-section={rang}>
      {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
      {titre ? <h2 className="st-manifeste-titre" key={titre} data-texte="titre">{titre}</h2> : null}
      {corps ? (
        <p className="st-manifeste-texte" key={corps} data-texte="texte">
          {corps.split(/(\s+)/).map((m, i) => (/^\s+$/.test(m) ? m : <span key={i} className="st-mot">{m}</span>))}
        </p>
      ) : null}
    </section>
  );
}

/* Les réalisations choisies : en deux colonnes décalées, la deuxième plus
   bas, chaque photo glissant doucement dans son cadre au défilement. */
function Realisations({ rang, section, produits }: { rang: number; section: Extract<Section, { type: "selection" }>; produits: Produit[] }) {
  const lien = section.lien ?? (section.rayon ? `/categorie/${section.rayon}` : "/catalogue");
  const titre = texte(section.textes, "titre", t.studio.realisations);
  const etiquette = texte(section.textes, "etiquette", t.studio.realisationsEtiquette);
  const cta = texte(section.textes, "cta", t.studio.toutesLesRealisations);
  return (
    <section className="st-realisations" data-section={rang}>
      <div className="enveloppe st-realisations-tete">
        <div>
          <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p>
          <h2 className="vi-titre" key={titre} data-texte="titre" data-lignes=""><Lignes texte={titre} /></h2>
        </div>
        <Link className="vi-lien-fleche" href={lien}>
          <span key={cta} data-texte="cta">{cta}</span>
          <Fleche taille={16} className="rtl:-scale-x-100" />
        </Link>
      </div>
      <div className="enveloppe st-grille-projets">
        {produits.map((p, i) => (
          <CarteProjet key={p.id} produit={p} numero={i + 1} />
        ))}
      </div>
    </section>
  );
}

/* Les domaines (les rayons) en liste typographique : de grands noms, leur
   nombre de projets ; au survol, la photo du domaine apparaît à côté. */
function Domaines({ rang, section, cadre, rayons }: { rang: number; section: Extract<Section, { type: "rayons" }>; cadre: Cadre; rayons: Cadre["racines"] }) {
  const compte = (slug: string) => descendance(cadre.categories, slug).reduce((n, c) => n + (c.nb_produits ?? 0), 0);
  const titre = texte(section.textes, "titre", t.studio.domainesTitre);
  const etiquette = texte(section.textes, "etiquette");
  return (
    <section className="enveloppe st-domaines-section" data-section={rang}>
      {rayons.length > 1 ? (
        // Les domaines en bandeau, immenses, qui défilent sans fin (plus vite quand on défile).
        <div className="st-bandeau" aria-hidden="true">
          <div className="st-bandeau-piste">
            {[0, 1].map((n) => (
              <span key={n} className="st-bandeau-groupe">
                {rayons.map((r) => <span key={r.slug} className="st-bandeau-mot">{champ(r, "nom")}</span>)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="st-domaines-tete">
        {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
        <h2 className="vi-titre" key={titre} data-texte="titre" data-lignes=""><Lignes texte={titre} /></h2>
      </div>
      <ul className="st-domaines-liste" role="list">
        {rayons.map((r, i) => (
          <li key={r.slug} className="apparait">
            <Link className="st-domaine" href={`/categorie/${r.slug}`}>
              <span className="st-domaine-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <span className="st-domaine-nom">{champ(r, "nom")}</span>
              <span className="st-domaine-compte">{t.studio.domaine(compte(r.slug))}</span>
              {r.image_chemin ? (
                <span className="st-domaine-photo" aria-hidden="true">
                  <Photo photo={{ src: urlFichier(r.image_chemin), alt: "" }} ratio="4 / 5" tailles="(min-width: 900px) 22vw, 96px" />
                </span>
              ) : null}
              <Fleche taille={22} className="st-domaine-fleche rtl:-scale-x-100" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Le récit : une grande photo qui glisse dans son cadre, et le texte à côté. */
function Recit({ rang, section, cadre }: { rang: number; section: Extract<Section, { type: "editorial" }>; cadre: Cadre }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  const etiquette = texte(section.textes, "etiquette");
  const cta = texte(section.textes, "cta", t.accueil.recitLien);
  return (
    <section className="st-recit" data-section={rang} data-sans-image={section.image ? undefined : ""}>
      <div className="enveloppe st-recit-grille">
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
            <Link className="vi-lien-fleche" href={section.lien}>
              <span key={cta} data-texte="cta">{cta}</span>
              <Fleche taille={16} className="rtl:-scale-x-100" />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
