import Link from "next/link";
import { CarteProduit } from "./CarteProduit";
import { Photo } from "./Photo";
import { PhotoOuverture } from "./PhotoOuverture";
import { TuileFin } from "./TuileFin";
import { AvisClients, Marques, QuestionsFrequentes } from "./SectionsBibliotheque";
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
  return (
    <>
      {cadre.theme.sections.map((s, i) => {
        switch (s.type) {
          case "hero":
            return <Banniere key={i} section={s} cadre={cadre} />;
          case "rayons":
            return <Rayons key={i} section={s} cadre={cadre} />;
          case "selection": {
            const produits = selections.get(i) ?? [];
            return produits.length || donnees.selectionVide === i ? <Selection key={i} section={s} cadre={cadre} produits={produits} /> : null;
          }
          case "editorial":
            return <Bandeau key={i} section={s} cadre={cadre} />;
          case "engagements":
            return <Services key={i} cadre={cadre} />;
          case "texte":
            return <Texte key={i} section={s} />;
          case "avis":
            return donnees.avis ? (
              <div key={i} className="te-section">
                <AvisClients avis={donnees.avis} gabarit="technique" tete={<Tete titre={texte(s.textes, "titre", t.accueil.avisTitre)} />} />
              </div>
            ) : null;
          case "questions": {
            const q = donnees.questions.get(i);
            return q ? (
              <div key={i} className="te-section">
                <QuestionsFrequentes questions={q} gabarit="technique" tete={(l) => <Tete titre={texte(s.textes, "titre", t.accueil.questionsTitre)} lien={l.href} libelle={l.libelle} />} />
              </div>
            ) : null;
          }
          case "marques":
            return donnees.marques.length ? (
              <div key={i} className="te-section">
                <Marques marques={donnees.marques} gabarit="technique" tete={<Tete titre={texte(s.textes, "titre", t.accueil.marquesTitre)} />} />
              </div>
            ) : null;
        }
      })}
    </>
  );
}

function Banniere({ section, cadre }: { section: Extract<Section, { type: "hero" }>; cadre: Cadre }) {
  const titre = texte(section.textes, "titre", cadre.boutique.nom);
  const chapo = texte(section.textes, "chapo") || texte(cadre.theme.textes, "resume");
  const etiquette = texte(section.textes, "etiquette");
  const image = section.image && !section.image.detouree ? section.image : null;
  return (
    <section className="te-banniere" data-image={image ? "" : undefined}>
      {image ? (
        <PhotoOuverture
          className="te-banniere-image"
          paysage={urlFichier(image.chemin)}
          portrait={image.portrait ? urlFichier(image.portrait) : undefined}
          alt={texte(section.textes, "image_alt", cadre.boutique.nom)}
        />
      ) : null}
      <div className="te-banniere-contenu">
        {etiquette ? <p className="te-surtitre">{etiquette}</p> : null}
        <h1>
          {titre.split("\n").map((l, i) => (
            <span key={i}>
              {i > 0 ? <br /> : null}
              {l}
            </span>
          ))}
        </h1>
        {chapo ? <p className="te-banniere-chapo">{chapo}</p> : null}
        <p className="te-banniere-actions">
          <Link className="btn btn-primaire" href={section.lien ?? "/catalogue"}>
            {texte(section.textes, "cta", t.accueil.heroCta)}
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
      <h2>{titre}</h2>
      {lien ? (
        <Link className="te-lien-fleche" href={lien}>
          {libelle ?? t.commun.toutVoir}
          <Fleche taille={16} className="rtl:-scale-x-100" />
        </Link>
      ) : null}
    </div>
  );
}

function Rayons({ section, cadre }: { section: Extract<Section, { type: "rayons" }>; cadre: Cadre }) {
  const compte = (slug: string) => descendance(cadre.categories, slug).reduce((n, c) => n + (c.nb_produits ?? 0), 0);
  const cartes = cadre.racines.flatMap((r): { c: Categorie; parent: Categorie | null }[] => {
    const enfants = cadre.categories.filter((c) => c.parent_id === r.id);
    // Un rayon qui n'a que des sous-rayons se montre par ses sous-rayons :
    // « Perceuses », « Scies » disent plus que « Outillage ».
    return enfants.length > 0 ? enfants.map((e) => ({ c: e, parent: r })) : [{ c: r, parent: null }];
  }).filter(({ c }) => compte(c.slug) > 0); // pas de vignette vide
  if (cartes.length === 0) return null;
  return (
    <section className="te-section">
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

function Selection({ section, cadre, produits }: { section: Extract<Section, { type: "selection" }>; cadre: Cadre; produits: Produit[] }) {
  const lien = section.lien ?? (section.rayon ? `/categorie/${section.rayon}` : "/catalogue");
  const titre = texte(section.textes, "titre", section.tri === "nouveautes" ? t.accueil.selectionNouveautes : t.accueil.selectionTitreTechnique);
  const total = section.rayon
    ? descendance(cadre.categories, section.rayon).reduce((n, c) => n + (c.nb_produits ?? 0), 0)
    : cadre.boutique.nb_produits;
  return (
    <section className="te-section">
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

function Bandeau({ section, cadre }: { section: Extract<Section, { type: "editorial" }>; cadre: Cadre }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  return (
    <section className="te-section te-bandeau">
      {section.image ? (
        <Photo photo={{ src: urlFichier(section.image.chemin), alt: texte(section.textes, "image_alt", cadre.boutique.nom) }} ratio="4 / 3" tailles="(min-width: 900px) 45vw, 100vw" />
      ) : null}
      <div>
        {titre ? <h2>{titre}</h2> : null}
        {corps ? <p>{corps}</p> : null}
        {section.lien ? (
          <Link className="btn btn-primaire" href={section.lien}>
            {texte(section.textes, "cta", t.commun.decouvrir)}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function Services({ cadre }: { cadre: Cadre }) {
  const { livraison } = cadre;
  const conseil = lienConseil(cadre);
  const services = [
    cadre.retrait ? { icone: <Magasin taille={28} />, titre: t.produit.retraitMagasin, texte: t.produit.retraitMagasinTexte(cadre.retrait.ville, t.commande.pretSous(cadre.retrait.delai_heures)) } : null,
    livraison.cod ? { icone: <Billets taille={28} />, titre: t.produit.payezALaLivraison, texte: t.produit.payezALaLivraisonTexte } : null,
    livraison.delai ? { icone: <Camion taille={28} />, titre: livraison.delai, texte: livraison.frais ?? "" } : null,
    conseil
      ? { icone: <Bulle taille={28} />, titre: t.produit.conseil, texte: t.produit.conseilTexte, lien: conseil }
      : { icone: <Retour taille={28} />, titre: t.produit.refusPossible, texte: t.produit.refusPossibleTexte },
  ].filter((s) => s !== null);

  return (
    <section className="te-section">
      <Tete titre={t.accueil.engagementsTitre} />
      <ul className="te-services">
        {services.map((s) => (
          <li key={s.titre}>
            {s.icone}
            <b>{s.titre}</b>
            <span>{s.texte}</span>
            {"lien" in s && s.lien ? (
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

function Texte({ section }: { section: Extract<Section, { type: "texte" }> }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  return (
    <section className="te-section te-texte">
      {titre ? <h2>{titre}</h2> : null}
      {corps ? <p>{corps}</p> : null}
    </section>
  );
}
