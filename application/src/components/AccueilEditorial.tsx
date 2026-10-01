import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { CarteProduit } from "./CarteProduit";
import { Photo } from "./Photo";
import { PhotoOuverture } from "./PhotoOuverture";
import { TuileFin } from "./TuileFin";
import { AvisClients, Marques, QuestionsFrequentes } from "./SectionsBibliotheque";
import { SectionLookbook, SectionPiece } from "./SectionsCommunes";
import { Billets, Camion, Fleche, Retour, Telephone } from "./Icones";
import { descendance, racinesGarnies, type Cadre } from "@/lib/boutique";
import type { Produit } from "@/lib/catalogue";
import type { DonneesAccueil } from "@/lib/accueil";
import { texte, type Section } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";
import { champ, t } from "@/lib/i18n";
import { formatePrix } from "@/lib/prix";

/* ============================================================================
   L'ACCUEIL ÉDITORIAL — mode, bagages, maroquinerie.

   La page d'une maison, pas d'un entrepôt : une image d'ouverture en plein
   écran, les collections en grandes vignettes, une sélection courte, un
   récit (image et texte côte à côte), les engagements en une ligne. Les
   textes viennent des sections du thème ; à défaut, des libellés sobres.
   ========================================================================== */

type Props = {
  cadre: Cadre;
  donnees: DonneesAccueil;
  /** Une structure bâtie sur l'éditorial (le Monoproduit) rend elle-même
   *  certaines sections : ce qu'elle rend (null : rien) remplace la section
   *  éditoriale ; `undefined` la laisse. */
  propre?: (section: Section, rang: number) => ReactNode | undefined;
};

export function AccueilEditorial({ cadre, donnees, propre }: Props) {
  const { selections } = donnees;
  // Les collections : deux rayons garnis au moins, sinon pas de section (ni
  // de lien « Parcourir par rayon » vers elle).
  const garnis = racinesGarnies(cadre);
  const collections = garnis.length > 1 && cadre.theme.sections.some((s) => s.type === "rayons");
  return (
    <>
      {cadre.theme.sections.map((s, i) => {
        const sienne = propre?.(s, i);
        if (sienne !== undefined) return sienne;
        switch (s.type) {
          case "hero":
            return <Ouverture key={i} rang={i} section={s} cadre={cadre} premiere={i === 0} collections={collections} />;
          case "rayons":
            return collections ? <Collections key={i} rang={i} section={s} cadre={cadre} rayons={garnis} /> : null;
          case "selection": {
            const produits = selections.get(i) ?? [];
            return produits.length || donnees.selectionVide === i ? <Selection key={i} rang={i} section={s} cadre={cadre} produits={produits} /> : null;
          }
          case "editorial":
            return <Recit key={i} rang={i} section={s} cadre={cadre} inverse={i % 2 === 1} />;
          case "engagements":
            return <Engagements key={i} rang={i} section={s} cadre={cadre} />;
          case "texte":
            return <Texte key={i} rang={i} section={s} />;
          case "lookbook":
            return <SectionLookbook key={i} rang={i} section={s} donnees={donnees} cadre={cadre} />;
          case "piece":
            return <SectionPiece key={i} rang={i} section={s} donnees={donnees} cadre={cadre} />;
          case "avis":
            return donnees.avis ? (
              <div key={i} className="enveloppe ed-section" data-section={i}>
                <AvisClients
                  avis={donnees.avis}
                  gabarit="editorial"
                  tete={<TeteSection titre={texte(s.textes, "titre", t.accueil.avisTitre)} etiquette={texte(s.textes, "etiquette", t.accueil.avisEtiquette)} />}
                />
              </div>
            ) : null;
          case "questions": {
            const q = donnees.questions.get(i);
            return q ? (
              <div key={i} className="enveloppe ed-section" data-section={i}>
                <QuestionsFrequentes
                  questions={q}
                  gabarit="editorial"
                  tete={() => <TeteSection titre={texte(s.textes, "titre", t.accueil.questionsTitre)} etiquette={texte(s.textes, "etiquette") || undefined} />}
                />
              </div>
            ) : null;
          }
          case "marques":
            return donnees.marques.length ? (
              <div key={i} className="enveloppe ed-section" data-section={i}>
                <Marques
                  marques={donnees.marques}
                  gabarit="editorial"
                  tete={<TeteSection titre={texte(s.textes, "titre", t.accueil.marquesTitre)} etiquette={texte(s.textes, "etiquette") || undefined} />}
                />
              </div>
            ) : null;
        }
      })}
    </>
  );
}

function Lignes({ texte: brut }: { texte: string }) {
  return (
    <>
      {brut.split("\n").map((ligne, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          {ligne}
        </span>
      ))}
    </>
  );
}

function Ouverture({ rang, section, cadre, premiere, collections }: { rang: number; section: Extract<Section, { type: "hero" }>; cadre: Cadre; premiere: boolean; collections: boolean }) {
  const titre = texte(section.textes, "titre", cadre.boutique.nom);
  const chapo = texte(section.textes, "chapo") || texte(cadre.theme.textes, "resume");
  const etiquette = texte(section.textes, "etiquette");
  const alt = texte(section.textes, "image_alt", cadre.boutique.nom);
  const lien = section.lien ?? "/catalogue";
  const cta = texte(section.textes, "cta", t.commun.decouvrir);

  /* Photo détourée (un produit sans fond) : pas de plein écran — le produit
     posé sur un aplat, à côté du titre, comme sur un socle. */
  if (section.image?.detouree) {
    return (
      <section className="ed-ouverture-socle" data-section={rang}>
        <div className="enveloppe ed-ouverture-socle-grille">
          <div className="ed-ouverture-texte">
            {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
            <h1 key={titre} data-texte="titre" data-lignes="">
              <Lignes texte={titre} />
            </h1>
            {chapo ? <p className="chapo" key={chapo} data-texte="chapo">{chapo}</p> : null}
            <p className="ed-ouverture-actions">
              <Link className="btn btn-primaire" href={lien}>
                <span key={cta} data-texte="cta">{cta}</span>
              </Link>
              {cadre.livraison.cod ? <span className="legende">{t.accueil.promesse}</span> : null}
            </p>
          </div>
          <div className="ed-socle">
            <Image src={urlFichier(section.image.chemin)} alt={alt} width={1200} height={1200} priority={premiere} sizes="(min-width: 900px) 40vw, 80vw" />
            {texte(section.textes, "cartel") ? <p className="ed-cartel">{texte(section.textes, "cartel")}</p> : null}
          </div>
        </div>
      </section>
    );
  }

  if (!section.image) {
    return (
      <section className="ed-ouverture-texte-seul enveloppe" data-section={rang}>
        {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
        <h1 key={titre} data-texte="titre" data-lignes="">
          <Lignes texte={titre} />
        </h1>
        {chapo ? <p className="chapo" key={chapo} data-texte="chapo">{chapo}</p> : null}
        <Link className="btn btn-primaire" href={lien}>
          <span key={cta} data-texte="cta">{cta}</span>
        </Link>
      </section>
    );
  }

  return (
    <section className="ed-ouverture" data-section={rang} data-premiere={premiere ? "" : undefined} data-alignement={section.alignement}>
      <PhotoOuverture className="ed-ouverture-image" paysage={urlFichier(section.image.chemin)} portrait={section.image.portrait ? urlFichier(section.image.portrait) : undefined} alt={alt} />
      <div className="ed-ouverture-voile" aria-hidden="true" />
      <div className="enveloppe ed-ouverture-contenu">
        <div className="ed-ouverture-bloc">
          {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
          <h1 key={titre} data-texte="titre" data-lignes="">
            <Lignes texte={titre} />
          </h1>
          {chapo ? <p className="chapo" key={chapo} data-texte="chapo">{chapo}</p> : null}
          <p className="ed-ouverture-actions">
            <Link className="btn btn-clair" href={lien}>
              <span key={cta} data-texte="cta">{cta}</span>
              <Fleche taille={16} className="icone-fleche rtl:-scale-x-100" />
            </Link>
            {collections ? (
              <a className="lien-souligne" href="#collections">
                {t.accueil.parcourirParRayon}
              </a>
            ) : null}
          </p>
        </div>
      </div>
    </section>
  );
}

function TeteSection({ titre, etiquette, lien, libelleLien }: { titre: string; etiquette?: string; lien?: string; libelleLien?: string }) {
  return (
    <div className="ed-section-tete">
      <div>
        {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
        <h2 key={titre} data-texte="titre">{titre}</h2>
      </div>
      {lien ? (
        <Link className="lien-souligne ed-lien-fleche" href={lien}>
          {libelleLien ?? t.commun.toutVoir}
          <Fleche taille={14} className="icone-fleche rtl:-scale-x-100" />
        </Link>
      ) : null}
    </div>
  );
}

function Collections({ rang, section, cadre, rayons }: { rang: number; section: Extract<Section, { type: "rayons" }>; cadre: Cadre; rayons: Cadre["racines"] }) {
  const compte = (slug: string) => descendance(cadre.categories, slug).reduce((n, c) => n + (c.nb_produits ?? 0), 0);
  return (
    <section className="enveloppe ed-section" id="collections" data-section={rang}>
      <TeteSection
        titre={texte(section.textes, "titre", t.accueil.collectionsTitre)}
        etiquette={texte(section.textes, "etiquette") || undefined}
        lien="/catalogue"
        libelleLien={t.commun.toutLeCatalogue}
      />
      <ul className="ed-collections" data-n={rayons.length}>
        {rayons.map((c) => (
          <li key={c.slug}>
            <Link href={`/categorie/${c.slug}`} className="ed-collection">
              <Photo
                photo={c.image_chemin ? { src: urlFichier(c.image_chemin), alt: "" } : null}
                ratio="3 / 4"
                tailles="(min-width: 1100px) 22vw, (min-width: 700px) 30vw, 70vw"
              />
              <span className="ed-collection-nom">{champ(c, "nom")}</span>
              <span className="legende">{t.catalogue.modeles(compte(c.slug))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Selection({ rang, section, cadre, produits }: { rang: number; section: Extract<Section, { type: "selection" }>; cadre: Cadre; produits: Produit[] }) {
  const lien = section.lien ?? (section.rayon ? `/categorie/${section.rayon}` : "/catalogue");
  const unSeulRayon = new Set(produits.map((p) => p.categorie?.slug)).size <= 1;
  const titre = texte(section.textes, "titre", section.tri === "nouveautes" ? t.accueil.selectionNouveautes : t.accueil.selectionTitreEditorial);
  const total = section.rayon
    ? descendance(cadre.categories, section.rayon).reduce((n, c) => n + (c.nb_produits ?? 0), 0)
    : cadre.boutique.nb_produits;
  return (
    <section className="enveloppe ed-section" data-section={rang}>
      <TeteSection titre={titre} etiquette={texte(section.textes, "etiquette") || undefined} lien={lien} />
      {produits.length > 0 ? (
        <div className="ed-grille rail-mobile" data-rayon-unique={unSeulRayon ? "" : undefined}>
          {produits.map((p) => (
            <CarteProduit key={p.id} produit={p} gabarit="editorial" prixBarres={cadre.prixBarres} />
          ))}
          <TuileFin href={lien} titre={titre} compte={total ? t.catalogue.modeles(total) : null} gabarit="editorial" />
        </div>
      ) : (
        <div className="listing-vide">
          <h3>{t.accueil.selectionVideTitre}</h3>
          <p>{t.accueil.selectionVide}</p>
        </div>
      )}
    </section>
  );
}

function Recit({ rang, section, cadre, inverse }: { rang: number; section: Extract<Section, { type: "editorial" }>; cadre: Cadre; inverse: boolean }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  const lien = section.lien;
  return (
    <section className="ed-recit" data-section={rang} data-inverse={inverse ? "" : undefined} data-sans-image={section.image ? undefined : ""}>
      {section.image ? (
        <div className="ed-recit-image">
          <Photo
            photo={{ src: urlFichier(section.image.chemin), alt: texte(section.textes, "image_alt", cadre.boutique.nom) }}
            ratio="4 / 5"
            tailles="(min-width: 900px) 50vw, 100vw"
          />
        </div>
      ) : null}
      <div className="ed-recit-texte">
        {texte(section.textes, "etiquette") ? <p className="etiquette" key={texte(section.textes, "etiquette")} data-texte="etiquette">{texte(section.textes, "etiquette")}</p> : null}
        {titre ? (
          <h2 key={titre} data-texte="titre" data-lignes="">
            <Lignes texte={titre} />
          </h2>
        ) : null}
        {corps ? <p className="chapo" key={corps} data-texte="texte">{corps}</p> : null}
        {lien ? (
          <Link className="lien-souligne" href={lien}>
            <span key={texte(section.textes, "cta", t.accueil.recitLien)} data-texte="cta">{texte(section.textes, "cta", t.accueil.recitLien)}</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function Engagements({ rang, section, cadre }: { rang: number; section: Extract<Section, { type: "engagements" }>; cadre: Cadre }) {
  const { livraison } = cadre;
  const faits = [
    livraison.cod ? { icone: <Billets />, titre: t.produit.payezALaLivraison, texte: t.produit.payezALaLivraisonTexte } : null,
    livraison.delai
      ? {
          icone: <Camion />,
          titre: livraison.delai,
          texte: cadre.seuilGratuiteMillimes
            ? t.annonce.livraisonOfferte(formatePrix(cadre.seuilGratuiteMillimes))
            : (livraison.frais ?? ""),
        }
      : null,
    livraison.cod && livraison.rappel ? { icone: <Telephone />, titre: t.produit.confirmationTelephonique, texte: t.produit.confirmationTelephoniqueTexte } : null,
    { icone: <Retour />, titre: t.produit.refusPossible, texte: t.produit.refusPossibleTexte },
  ].filter((f) => f !== null);

  return (
    <section className="ed-engagements" data-section={rang}>
      <div className="enveloppe">
        {texte(section.textes, "titre") ? <h2 className="sr-only">{texte(section.textes, "titre")}</h2> : null}
        <ul>
          {faits.map((f) => (
            <li key={f.titre}>
              {f.icone}
              <b>{f.titre}</b>
              <span>{f.texte}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Texte({ rang, section }: { rang: number; section: Extract<Section, { type: "texte" }> }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  return (
    <section className="enveloppe ed-section ed-texte" data-section={rang}>
      {texte(section.textes, "etiquette") ? <p className="etiquette" key={texte(section.textes, "etiquette")} data-texte="etiquette">{texte(section.textes, "etiquette")}</p> : null}
      {titre ? <h2 key={titre} data-texte="titre">{titre}</h2> : null}
      {corps ? <p className="chapo" key={corps} data-texte="texte">{corps}</p> : null}
    </section>
  );
}
