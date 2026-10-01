import Link from "next/link";
import { CarteProduit } from "./CarteProduit";
import { Photo } from "./Photo";
import { PhotoOuverture } from "./PhotoOuverture";
import { TuileFin } from "./TuileFin";
import { AvisClients, Marques, QuestionsFrequentes } from "./SectionsBibliotheque";
import { SectionLookbook, SectionPiece } from "./SectionsCommunes";
import { OuvertureCommerce, RayonsCommerce, ServicesCommerce } from "./AccueilCommerce";
import { Billets, Bulle, Camion, Fleche, Magasin, Retour } from "./Icones";
import { descendance, type Cadre } from "@/lib/boutique";
import type { Categorie, Produit } from "@/lib/catalogue";
import type { DonneesAccueil } from "@/lib/accueil";
import { texte, type Section } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";
import { lienConseil } from "@/lib/faits";
import { champ, t } from "@/lib/i18n";

/* ============================================================================
   L'ACCUEIL TECHNIQUE — outillage, quincaillerie, matériel pro.

   Un artisan vient chercher une référence, pas une ambiance : bannière
   courte, les rayons tout de suite (avec leurs sous-rayons), les références
   en grille dense, les services en clair (retrait, paiement, conseil).
   ========================================================================== */

type Props = { cadre: Cadre; donnees: DonneesAccueil };

export function AccueilTechnique({ cadre, donnees }: Props) {
  const { selections } = donnees;
  // La structure Commerce (AccueilCommerce.tsx) : la recherche d'abord, les
  // services en bande, les rayons et leurs sous-rayons ; le reste à l'identique.
  const commerce = cadre.theme.structure === "commerce";
  return (
    <>
      {cadre.theme.sections.map((s, i) => {
        switch (s.type) {
          case "hero":
            return commerce ? <OuvertureCommerce key={i} rang={i} section={s} cadre={cadre} /> : <Banniere key={i} rang={i} section={s} cadre={cadre} />;
          case "rayons":
            return commerce ? <RayonsCommerce key={i} rang={i} section={s} cadre={cadre} /> : <Rayons key={i} rang={i} section={s} cadre={cadre} />;
          case "selection": {
            const produits = selections.get(i) ?? [];
            return produits.length || donnees.selectionVide === i ? <Selection key={i} rang={i} section={s} cadre={cadre} produits={produits} /> : null;
          }
          case "editorial":
            return <Bandeau key={i} rang={i} section={s} cadre={cadre} />;
          case "engagements":
            return commerce ? <ServicesCommerce key={i} rang={i} services={servicesDe(cadre, 24)} /> : <Services key={i} rang={i} cadre={cadre} />;
          case "texte":
            return <Texte key={i} rang={i} section={s} />;
          case "lookbook":
            return <SectionLookbook key={i} rang={i} section={s} donnees={donnees} cadre={cadre} />;
          case "piece":
            return <SectionPiece key={i} rang={i} section={s} donnees={donnees} cadre={cadre} gabarit="technique" />;
          case "avis":
            return donnees.avis ? (
              <div key={i} className="te-section" data-section={i}>
                <AvisClients avis={donnees.avis} gabarit="technique" tete={<Tete titre={texte(s.textes, "titre", t.accueil.avisTitre)} />} />
              </div>
            ) : null;
          case "questions": {
            const q = donnees.questions.get(i);
            return q ? (
              <div key={i} className="te-section" data-section={i}>
                <QuestionsFrequentes questions={q} gabarit="technique" tete={(l) => <Tete titre={texte(s.textes, "titre", t.accueil.questionsTitre)} lien={l.href} libelle={l.libelle} />} />
              </div>
            ) : null;
          }
          case "marques":
            return donnees.marques.length ? (
              <div key={i} className="te-section" data-section={i}>
                <Marques marques={donnees.marques} gabarit="technique" tete={<Tete titre={texte(s.textes, "titre", t.accueil.marquesTitre)} />} />
              </div>
            ) : null;
        }
      })}
    </>
  );
}

function Banniere({ rang, section, cadre }: { rang: number; section: Extract<Section, { type: "hero" }>; cadre: Cadre }) {
  const titre = texte(section.textes, "titre", cadre.boutique.nom);
  const chapo = texte(section.textes, "chapo") || texte(cadre.theme.textes, "resume");
  const etiquette = texte(section.textes, "etiquette");
  const image = section.image && !section.image.detouree ? section.image : null;
  return (
    <section className="te-banniere" data-section={rang} data-image={image ? "" : undefined}>
      {image ? (
        <PhotoOuverture
          className="te-banniere-image"
          paysage={urlFichier(image.chemin)}
          portrait={image.portrait ? urlFichier(image.portrait) : undefined}
          alt={texte(section.textes, "image_alt", cadre.boutique.nom)}
        />
      ) : null}
      <div className="te-banniere-contenu">
        {etiquette ? <p className="te-surtitre" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
        <h1 key={titre} data-texte="titre" data-lignes="">
          {titre.split("\n").map((l, i) => (
            <span key={i}>
              {i > 0 ? <br /> : null}
              {l}
            </span>
          ))}
        </h1>
        {chapo ? <p className="te-banniere-chapo" key={chapo} data-texte="chapo">{chapo}</p> : null}
        <p className="te-banniere-actions">
          <Link className="btn btn-primaire" href={section.lien ?? "/catalogue"}>
            <span key={texte(section.textes, "cta", t.accueil.heroCta)} data-texte="cta">{texte(section.textes, "cta", t.accueil.heroCta)}</span>
            <Fleche taille={18} className="rtl:-scale-x-100" />
          </Link>
          <span className="te-banniere-compte">{t.catalogue.references(cadre.boutique.nb_produits)}</span>
        </p>
      </div>
    </section>
  );
}

function Tete({ titre, lien, libelle }: { titre: string; lien?: string; libelle?: string }) {
  return (
    <div className="te-section-tete">
      <h2 key={titre} data-texte="titre">{titre}</h2>
      {lien ? (
        <Link className="te-lien-fleche" href={lien}>
          {libelle ?? t.commun.toutVoir}
          <Fleche taille={16} className="rtl:-scale-x-100" />
        </Link>
      ) : null}
    </div>
  );
}

function Rayons({ rang, section, cadre }: { rang: number; section: Extract<Section, { type: "rayons" }>; cadre: Cadre }) {
  const compte = (slug: string) => descendance(cadre.categories, slug).reduce((n, c) => n + (c.nb_produits ?? 0), 0);
  const cartes = cadre.racines.flatMap((r): { c: Categorie; parent: Categorie | null }[] => {
    const enfants = cadre.categories.filter((c) => c.parent_id === r.id);
    // Un rayon qui n'a que des sous-rayons se montre par ses sous-rayons :
    // « Perceuses », « Scies » disent plus que « Outillage ».
    return enfants.length > 0 ? enfants.map((e) => ({ c: e, parent: r })) : [{ c: r, parent: null }];
  }).filter(({ c }) => compte(c.slug) > 0); // pas de vignette vide
  if (cartes.length === 0) return null;
  return (
    <section className="te-section" data-section={rang}>
      <Tete titre={texte(section.textes, "titre", t.accueil.rayonsTitreTechnique)} lien="/catalogue" libelle={t.commun.toutLeCatalogue} />
      <ul className="te-rayons">
        {cartes.map(({ c, parent }) => (
          <li key={c.slug}>
            <Link className="te-rayon" href={`/categorie/${c.slug}`}>
              <Photo photo={c.image_chemin ? { src: urlFichier(c.image_chemin), alt: "" } : null} ratio="4 / 3" tailles="(min-width: 1100px) 18vw, (min-width: 700px) 30vw, 46vw" />
              <span className="te-rayon-corps">
                {parent ? <span className="te-rayon-parent">{champ(parent, "nom")}</span> : null}
                <span className="te-rayon-nom">{champ(c, "nom")}</span>
                <span className="te-rayon-compte">{t.catalogue.references(compte(c.slug))}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Selection({ rang, section, cadre, produits }: { rang: number; section: Extract<Section, { type: "selection" }>; cadre: Cadre; produits: Produit[] }) {
  const lien = section.lien ?? (section.rayon ? `/categorie/${section.rayon}` : "/catalogue");
  const titre = texte(section.textes, "titre", section.tri === "nouveautes" ? t.accueil.selectionNouveautes : t.accueil.selectionTitreTechnique);
  const total = section.rayon
    ? descendance(cadre.categories, section.rayon).reduce((n, c) => n + (c.nb_produits ?? 0), 0)
    : cadre.boutique.nb_produits;
  return (
    <section className="te-section" data-section={rang}>
      <Tete titre={titre} lien={lien} />
      {produits.length > 0 ? (
        <div className="te-grille te-grille-rang rail-mobile">
          {produits.map((p) => (
            <CarteProduit key={p.id} produit={p} gabarit="technique" prixBarres={cadre.prixBarres} />
          ))}
          <TuileFin href={lien} titre={titre} compte={total ? t.catalogue.references(total) : null} gabarit="technique" />
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

function Bandeau({ rang, section, cadre }: { rang: number; section: Extract<Section, { type: "editorial" }>; cadre: Cadre }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  return (
    <section className="te-section te-bandeau" data-section={rang}>
      {section.image ? (
        <Photo photo={{ src: urlFichier(section.image.chemin), alt: texte(section.textes, "image_alt", cadre.boutique.nom) }} ratio="4 / 3" tailles="(min-width: 900px) 45vw, 100vw" />
      ) : null}
      <div>
        {titre ? <h2 key={titre} data-texte="titre">{titre}</h2> : null}
        {corps ? <p key={corps} data-texte="texte">{corps}</p> : null}
        {section.lien ? (
          <Link className="btn btn-primaire" href={section.lien}>
            <span key={texte(section.textes, "cta", t.commun.decouvrir)} data-texte="cta">{texte(section.textes, "cta", t.commun.decouvrir)}</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export type Service = { icone: React.ReactNode; titre: string; texte: string; lien?: string };

/** Ce que la boutique assure, tiré de ses réglages (rien d'écrit d'avance). */
export function servicesDe(cadre: Cadre, taille = 28): Service[] {
  const { livraison } = cadre;
  const conseil = lienConseil(cadre);
  return [
    cadre.retrait ? { icone: <Magasin taille={taille} />, titre: t.produit.retraitMagasin, texte: t.produit.retraitMagasinTexte(cadre.retrait.ville, t.commande.pretSous(cadre.retrait.delai_heures)) } : null,
    livraison.cod ? { icone: <Billets taille={taille} />, titre: t.produit.payezALaLivraison, texte: t.produit.payezALaLivraisonTexte } : null,
    livraison.delai ? { icone: <Camion taille={taille} />, titre: livraison.delai, texte: livraison.frais ?? "" } : null,
    conseil
      ? { icone: <Bulle taille={taille} />, titre: t.produit.conseil, texte: t.produit.conseilTexte, lien: conseil }
      : { icone: <Retour taille={taille} />, titre: t.produit.refusPossible, texte: t.produit.refusPossibleTexte },
  ].filter((s) => s !== null);
}

function Services({ rang, cadre }: { rang: number; cadre: Cadre }) {
  const services = servicesDe(cadre);

  return (
    <section className="te-section" data-section={rang}>
      <Tete titre={t.accueil.engagementsTitre} />
      <ul className="te-services">
        {services.map((s) => (
          <li key={s.titre}>
            {s.icone}
            <b>{s.titre}</b>
            <span>{s.texte}</span>
            {s.lien ? (
              <a className="te-lien-fleche" href={s.lien} target="_blank" rel="noopener noreferrer">
                {t.produit.conseilLien}
                <Fleche taille={16} className="rtl:-scale-x-100" />
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Texte({ rang, section }: { rang: number; section: Extract<Section, { type: "texte" }> }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  return (
    <section className="te-section te-texte" data-section={rang}>
      {titre ? <h2 key={titre} data-texte="titre">{titre}</h2> : null}
      {corps ? <p key={corps} data-texte="texte">{corps}</p> : null}
    </section>
  );
}
