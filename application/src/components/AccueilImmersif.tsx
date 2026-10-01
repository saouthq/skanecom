import Link from "next/link";
import { CarteProduit } from "./CarteProduit";
import { Photo } from "./Photo";
import { PhotoOuverture } from "./PhotoOuverture";
import { Rail } from "./Rail";
import { Engagements } from "./AccueilEditorial";
import { SectionBannieres, SectionLookbook, SectionPiece } from "./SectionsCommunes";
import { AvisClients, Marques, QuestionsFrequentes } from "./SectionsBibliotheque";
import { Fleche } from "./Icones";
import { descendance, racinesGarnies, type Cadre } from "@/lib/boutique";
import type { Produit } from "@/lib/catalogue";
import type { DonneesAccueil } from "@/lib/accueil";
import { texte, type Section } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";
import { champ, t } from "@/lib/i18n";

/* ============================================================================
   L'ACCUEIL IMMERSIF — mode, luxe, maison haut de gamme.

   La photo d'abord : l'ouverture prend tout l'écran, l'en-tête posé dessus,
   un titre immense ; la pièce de la saison, achetable sans quitter
   l'accueil ; la sélection et les collections glissent en rangées (au
   doigt, ou par les flèches) ; le lookbook pointe les pièces portées ; le
   récit en grand ; le texte devient un manifeste. Les fiches, le catalogue
   et le tunnel restent ceux du gabarit éditorial. Préfixe im-.
   ========================================================================== */

type Props = { cadre: Cadre; donnees: DonneesAccueil };

export function AccueilImmersif({ cadre, donnees }: Props) {
  const garnis = racinesGarnies(cadre);
  const collections = garnis.length > 1 && cadre.theme.sections.some((s) => s.type === "rayons");
  return (
    <div className="im-accueil">
      {cadre.theme.sections.map((s, i) => {
        switch (s.type) {
          case "hero":
            return <Ouverture key={i} rang={i} section={s} cadre={cadre} premiere={i === 0} />;
          case "piece":
            return <SectionPiece key={i} rang={i} section={s} donnees={donnees} cadre={cadre} />;
          case "selection": {
            const produits = donnees.selections.get(i) ?? [];
            return produits.length || donnees.selectionVide === i ? <Selection key={i} rang={i} section={s} cadre={cadre} produits={produits} /> : null;
          }
          case "rayons":
            return collections ? <Collections key={i} rang={i} section={s} cadre={cadre} rayons={garnis} /> : null;
          case "lookbook":
            return <SectionLookbook key={i} rang={i} section={s} donnees={donnees} cadre={cadre} />;
          case "bannieres":
            return <SectionBannieres key={i} rang={i} section={s} cadre={cadre} />;
          case "editorial":
            return <Recit key={i} rang={i} section={s} cadre={cadre} />;
          case "texte":
            return <Manifeste key={i} rang={i} section={s} />;
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
    <div className="ed-section-tete im-tete">
      <div>
        {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
        <h2 key={titre} data-texte="titre">{titre}</h2>
      </div>
    </div>
  );
}

/* La photo plein écran : le titre en bas à gauche, immense ; le chapô et le
   bouton en bas de l'autre côté. Sans photo : le même titre sur l'encre. */
function Ouverture({ rang, section, cadre, premiere }: { rang: number; section: Extract<Section, { type: "hero" }>; cadre: Cadre; premiere: boolean }) {
  const titre = texte(section.textes, "titre", cadre.boutique.nom);
  const chapo = texte(section.textes, "chapo") || texte(cadre.theme.textes, "resume");
  const etiquette = texte(section.textes, "etiquette");
  const alt = texte(section.textes, "image_alt", cadre.boutique.nom);
  const lien = section.lien ?? "/catalogue";
  const cta = texte(section.textes, "cta", t.commun.decouvrir);
  const image = section.image && !section.image.detouree ? section.image : null;
  return (
    <section className="ed-ouverture im-ouverture" data-section={rang} data-premiere={premiere && image ? "" : undefined}
      data-sans-image={image ? undefined : ""} data-alignement={section.alignement}>
      {image ? (
        <>
          <PhotoOuverture className="ed-ouverture-image" paysage={urlFichier(image.chemin)} portrait={image.portrait ? urlFichier(image.portrait) : undefined} alt={alt} />
          <div className="ed-ouverture-voile" aria-hidden="true" />
        </>
      ) : null}
      <div className="enveloppe im-ouverture-contenu">
        <div className="im-ouverture-titre">
          {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
          <h1 key={titre} data-texte="titre" data-lignes="">
            {titre.split("\n").map((l, i) => (
              <span key={i}>
                {i > 0 ? <br /> : null}
                {l}
              </span>
            ))}
          </h1>
        </div>
        <div className="im-ouverture-action">
          {chapo ? <p className="chapo" key={chapo} data-texte="chapo">{chapo}</p> : null}
          <Link className="im-cta" href={lien}>
            <span key={cta} data-texte="cta">{cta}</span>
            <span className="im-cta-rond" aria-hidden="true"><Fleche taille={18} className="rtl:-scale-x-100" /></span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Selection({ rang, section, cadre, produits }: { rang: number; section: Extract<Section, { type: "selection" }>; cadre: Cadre; produits: Produit[] }) {
  const lien = section.lien ?? (section.rayon ? `/categorie/${section.rayon}` : "/catalogue");
  const titre = texte(section.textes, "titre", section.tri === "nouveautes" ? t.accueil.selectionNouveautes : t.accueil.selectionTitreEditorial);
  const etiquette = texte(section.textes, "etiquette");
  return (
    <section className="im-section" data-section={rang}>
      {produits.length ? (
        <Rail libelle={titre} tete={
          <>
            {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
            <h2 key={titre} data-texte="titre">{titre}</h2>
            <Link className="lien-souligne im-tout" href={lien}>{t.commun.toutVoir}</Link>
          </>
        }>
          {produits.map((p) => (
            <li key={p.id} className="im-rail-piece">
              <CarteProduit produit={p} gabarit="editorial" prixBarres={cadre.prixBarres} tailles="(min-width: 900px) 30vw, 78vw" />
            </li>
          ))}
        </Rail>
      ) : (
        <div className="enveloppe listing-vide">
          <h3>{t.accueil.selectionVideTitre}</h3>
          <p>{t.accueil.selectionVide}</p>
        </div>
      )}
    </section>
  );
}

function Collections({ rang, section, cadre, rayons }: { rang: number; section: Extract<Section, { type: "rayons" }>; cadre: Cadre; rayons: Cadre["racines"] }) {
  const compte = (slug: string) => descendance(cadre.categories, slug).reduce((n, c) => n + (c.nb_produits ?? 0), 0);
  const titre = texte(section.textes, "titre", t.accueil.collectionsTitre);
  const etiquette = texte(section.textes, "etiquette");
  return (
    <section className="im-section" id="collections" data-section={rang}>
      <Rail libelle={titre} className="im-collections" tete={
        <>
          {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
          <h2 key={titre} data-texte="titre">{titre}</h2>
          <Link className="lien-souligne im-tout" href="/catalogue">{t.commun.toutLeCatalogue}</Link>
        </>
      }>
        {rayons.map((c) => (
          <li key={c.slug} className="im-rail-collection">
            <Link href={`/categorie/${c.slug}`} className="im-collection">
              <Photo photo={c.image_chemin ? { src: urlFichier(c.image_chemin), alt: "" } : null} ratio="3 / 4" tailles="(min-width: 900px) 34vw, 82vw" />
              <span className="im-collection-texte">
                <span className="im-collection-nom">{champ(c, "nom")}</span>
                <span className="legende">{t.catalogue.modeles(compte(c.slug))}</span>
              </span>
            </Link>
          </li>
        ))}
      </Rail>
    </section>
  );
}

function Recit({ rang, section, cadre }: { rang: number; section: Extract<Section, { type: "editorial" }>; cadre: Cadre }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  const etiquette = texte(section.textes, "etiquette");
  return (
    <section className="im-recit" data-section={rang} data-sans-image={section.image ? undefined : ""}>
      {section.image ? (
        <div className="im-recit-image">
          <Photo photo={{ src: urlFichier(section.image.chemin), alt: texte(section.textes, "image_alt", cadre.boutique.nom) }} ratio="4 / 5" tailles="(min-width: 900px) 55vw, 100vw" />
        </div>
      ) : null}
      <div className="im-recit-texte">
        {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
        {titre ? (
          <h2 key={titre} data-texte="titre" data-lignes="">
            {titre.split("\n").map((l, i) => (
              <span key={i}>
                {i > 0 ? <br /> : null}
                {l}
              </span>
            ))}
          </h2>
        ) : null}
        {corps ? <p className="chapo" key={corps} data-texte="texte">{corps}</p> : null}
        {section.lien ? (
          <Link className="lien-souligne" href={section.lien}>
            <span key={texte(section.textes, "cta", t.accueil.recitLien)} data-texte="cta">{texte(section.textes, "cta", t.accueil.recitLien)}</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/* Le texte, en manifeste : de grands caractères au centre, sans image. */
function Manifeste({ rang, section }: { rang: number; section: Extract<Section, { type: "texte" }> }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  const etiquette = texte(section.textes, "etiquette");
  return (
    <section className="enveloppe im-manifeste" data-section={rang}>
      {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
      {titre ? <h2 key={titre} data-texte="titre">{titre}</h2> : null}
      {corps ? <p className="im-manifeste-texte" key={corps} data-texte="texte">{corps}</p> : null}
    </section>
  );
}
