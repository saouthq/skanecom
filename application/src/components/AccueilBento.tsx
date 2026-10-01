import Link from "next/link";
import { CarteProduit } from "./CarteProduit";
import { Photo } from "./Photo";
import { PhotoOuverture } from "./PhotoOuverture";
import { TuileFin } from "./TuileFin";
import { Etoiles } from "./Etoiles";
import { AvisClients, Marques, QuestionsFrequentes } from "./SectionsBibliotheque";
import { Billets, Camion, Fleche, Retour, Telephone } from "./Icones";
import { descendance, racinesGarnies, type Cadre } from "@/lib/boutique";
import { prixDepuis, type Produit } from "@/lib/catalogue";
import type { DonneesAccueil } from "@/lib/accueil";
import { texte, type Section } from "@/lib/theme";
import { urlFichier, urlPhoto } from "@/lib/photos";
import { champ, t } from "@/lib/i18n";
import { formatePrix } from "@/lib/prix";

/* ============================================================================
   L'ACCUEIL BENTO — maison, beauté, high-tech, marques jeunes.

   Une mosaïque de tuiles de tailles variées plutôt qu'une suite de bandes :
   l'ouverture partage la première rangée avec la pièce à la une, le
   paiement à la livraison et ce qu'en disent les clients ; les rayons
   forment une grille où le premier tient deux rangées ; le récit pose sa
   photo et son texte en deux tuiles. Les mêmes sections que les autres
   structures, dans l'ordre de la boutique (écran « Page d'accueil ») ; une
   tuile qui n'a rien de vrai à dire ne s'affiche pas — jamais un chiffre
   inventé.
   ========================================================================== */

type Props = { cadre: Cadre; donnees: DonneesAccueil };

export function AccueilBento({ cadre, donnees }: Props) {
  const { selections } = donnees;
  const garnis = racinesGarnies(cadre);
  const rayons = garnis.length > 1 && cadre.theme.sections.some((s) => s.type === "rayons");
  // La pièce à la une : la première de la première sélection (les mises en avant d'abord).
  const premiere = [...selections.values()].find((l) => l.length > 0)?.[0] ?? null;
  return (
    <div className="bn-accueil">
      {cadre.theme.sections.map((s, i) => {
        switch (s.type) {
          case "hero":
            return <Ouverture key={i} section={s} cadre={cadre} piece={i === 0 ? premiere : null} donnees={donnees} rayons={rayons} />;
          case "rayons":
            return rayons ? <Rayons key={i} section={s} cadre={cadre} liste={garnis} /> : null;
          case "selection": {
            const produits = selections.get(i) ?? [];
            return produits.length || donnees.selectionVide === i ? <Selection key={i} section={s} cadre={cadre} produits={produits} /> : null;
          }
          case "editorial":
            return <Recit key={i} section={s} cadre={cadre} />;
          case "engagements":
            return <Engagements key={i} cadre={cadre} />;
          case "texte": {
            const titre = texte(s.textes, "titre");
            const corps = texte(s.textes, "texte");
            return titre || corps ? (
              <section key={i} className="enveloppe bn-section">
                <div className="bn-tuile bn-texte">
                  {texte(s.textes, "etiquette") ? <p className="etiquette">{texte(s.textes, "etiquette")}</p> : null}
                  {titre ? <h2>{titre}</h2> : null}
                  {corps ? <p className="chapo">{corps}</p> : null}
                </div>
              </section>
            ) : null;
          }
          case "avis":
            return donnees.avis ? (
              <div key={i} className="enveloppe bn-section bn-avis">
                <AvisClients avis={donnees.avis} gabarit="editorial"
                  tete={<Tete titre={texte(s.textes, "titre", t.accueil.avisTitre)} etiquette={texte(s.textes, "etiquette", t.accueil.avisEtiquette)} />} />
              </div>
            ) : null;
          case "questions": {
            const q = donnees.questions.get(i);
            return q ? (
              <div key={i} className="enveloppe bn-section">
                <QuestionsFrequentes questions={q} gabarit="editorial"
                  tete={() => <Tete titre={texte(s.textes, "titre", t.accueil.questionsTitre)} etiquette={texte(s.textes, "etiquette") || undefined} />} />
              </div>
            ) : null;
          }
          case "marques":
            return donnees.marques.length ? (
              <div key={i} className="enveloppe bn-section">
                <Marques marques={donnees.marques} gabarit="editorial"
                  tete={<Tete titre={texte(s.textes, "titre", t.accueil.marquesTitre)} etiquette={texte(s.textes, "etiquette") || undefined} />} />
              </div>
            ) : null;
        }
      })}
    </div>
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

function Tete({ titre, etiquette, lien, libelleLien }: { titre: string; etiquette?: string; lien?: string; libelleLien?: string }) {
  return (
    <div className="bn-tete">
      <div>
        {etiquette ? <p className="etiquette">{etiquette}</p> : null}
        <h2>{titre}</h2>
      </div>
      {lien ? (
        <Link className="bn-lien" href={lien}>
          {libelleLien ?? t.commun.toutVoir}
          <Fleche taille={14} className="rtl:-scale-x-100" />
        </Link>
      ) : null}
    </div>
  );
}

/* La première rangée : l'ouverture, et à côté ce que la boutique a de vrai à
   dire tout de suite — sa pièce à la une, le paiement à la livraison, la note
   de ses clients. */
function Ouverture({ section, cadre, piece, donnees, rayons }: {
  section: Extract<Section, { type: "hero" }>;
  cadre: Cadre;
  piece: Produit | null;
  donnees: DonneesAccueil;
  rayons: boolean;
}) {
  const titre = texte(section.textes, "titre", cadre.boutique.nom);
  const chapo = texte(section.textes, "chapo") || texte(cadre.theme.textes, "resume");
  const etiquette = texte(section.textes, "etiquette");
  const lien = section.lien ?? "/catalogue";
  const cta = texte(section.textes, "cta", t.commun.decouvrir);
  const avis = donnees.avis && donnees.avis.moyenne !== null && donnees.avis.avis.length ? donnees.avis : null;
  const citation = avis?.avis[0] ?? null;
  const photo = piece ? urlPhoto(piece) : null;
  const prix = piece ? prixDepuis(piece) : null;
  const cotes = [piece && photo, cadre.livraison.cod, avis].filter(Boolean).length;

  return (
    <section className="enveloppe bn-ouverture">
      <div className="bn-tuile bn-une" data-photo={section.image ? "" : undefined}>
        {section.image ? (
          <>
            <PhotoOuverture className="bn-une-image" paysage={urlFichier(section.image.chemin)}
              portrait={section.image.portrait ? urlFichier(section.image.portrait) : undefined}
              alt={texte(section.textes, "image_alt", cadre.boutique.nom)} />
            <div className="bn-voile" aria-hidden="true" />
          </>
        ) : null}
        <div className="bn-une-texte">
          {etiquette ? <p className="etiquette">{etiquette}</p> : null}
          <h1><Lignes texte={titre} /></h1>
          {chapo ? <p className="chapo">{chapo}</p> : null}
          <p className="bn-actions">
            <Link className="btn btn-clair" href={lien}>
              {cta}
              <Fleche taille={16} className="rtl:-scale-x-100" />
            </Link>
            {rayons ? <a className="bn-lien-clair" href="#rayons">{t.accueil.parcourirParRayon}</a> : null}
          </p>
        </div>
      </div>

      {cotes ? (
        <div className="bn-cotes" data-n={cotes}>
          {piece && photo ? (
            <Link className="bn-tuile bn-piece" href={`/produit/${piece.slug}`}>
              <Photo photo={photo} ratio="auto" tailles="(min-width: 1100px) 30vw, 90vw" className="bn-piece-photo" />
              <span className="bn-pastille">{t.accueil.bentoUne}</span>
              <span className="bn-piece-pied">
                <span className="bn-piece-texte">
                  <b>{champ(piece, "nom")}</b>
                  {prix !== null ? <span>{piece.variantes.length > 1 ? `${t.catalogue.aPartirDe} ` : ""}{formatePrix(prix)}</span> : null}
                </span>
                <span className="bn-rond" aria-hidden="true"><Fleche taille={18} className="rtl:-scale-x-100" /></span>
              </span>
            </Link>
          ) : null}

          {cadre.livraison.cod ? (
            <div className="bn-tuile bn-fait">
              <Billets taille={28} />
              <span><b>{t.accueil.faitPaiementLivraison}</b><span>{t.accueil.bentoCodTexte}</span></span>
            </div>
          ) : null}

          {avis ? (
            <figure className="bn-tuile bn-note">
              <span className="bn-note-chiffre">
                <b>{avis.moyenne!.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b>
                <Etoiles note={avis.moyenne!} taille={16} />
              </span>
              {citation ? <blockquote>« {citation.texte.length > 110 ? `${citation.texte.slice(0, 107).trimEnd()}…` : citation.texte} »</blockquote> : null}
              <figcaption>{t.accueil.bentoAvisTotal(avis.total)}{citation ? ` · ${citation.auteur}` : ""}</figcaption>
            </figure>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Rayons({ section, cadre, liste }: { section: Extract<Section, { type: "rayons" }>; cadre: Cadre; liste: Cadre["racines"] }) {
  const compte = (slug: string) => descendance(cadre.categories, slug).reduce((n, c) => n + (c.nb_produits ?? 0), 0);
  return (
    <section className="enveloppe bn-section" id="rayons">
      <Tete titre={texte(section.textes, "titre", t.accueil.bentoRayonsTitre)} etiquette={texte(section.textes, "etiquette") || undefined}
        lien="/catalogue" libelleLien={t.commun.toutLeCatalogue} />
      <ul className="bn-rayons" data-n={Math.min(liste.length, 6)}>
        {liste.map((c) => (
          <li key={c.slug}>
            <Link href={`/categorie/${c.slug}`} className="bn-tuile bn-rayon">
              <Photo photo={c.image_chemin ? { src: urlFichier(c.image_chemin), alt: "" } : null} ratio="auto"
                tailles="(min-width: 1100px) 30vw, (min-width: 700px) 45vw, 70vw" />
              <span className="bn-voile" aria-hidden="true" />
              <span className="bn-rayon-texte">
                <b>{champ(c, "nom")}</b>
                <span>{t.catalogue.modeles(compte(c.slug))}</span>
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
  const titre = texte(section.textes, "titre", section.tri === "nouveautes" ? t.accueil.selectionNouveautes : t.accueil.selectionTitreEditorial);
  const total = section.rayon
    ? descendance(cadre.categories, section.rayon).reduce((n, c) => n + (c.nb_produits ?? 0), 0)
    : cadre.boutique.nb_produits;
  return (
    <section className="enveloppe bn-section">
      <Tete titre={titre} etiquette={texte(section.textes, "etiquette") || undefined} lien={lien} />
      {produits.length > 0 ? (
        <div className="bn-grille rail-mobile">
          {produits.map((p) => <CarteProduit key={p.id} produit={p} gabarit="editorial" prixBarres={cadre.prixBarres} />)}
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

function Recit({ section, cadre }: { section: Extract<Section, { type: "editorial" }>; cadre: Cadre }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  return (
    <section className="enveloppe bn-section bn-recit" data-sans-image={section.image ? undefined : ""}>
      {section.image ? (
        <div className="bn-tuile bn-recit-image">
          <Photo photo={{ src: urlFichier(section.image.chemin), alt: texte(section.textes, "image_alt", cadre.boutique.nom) }}
            ratio="auto" tailles="(min-width: 900px) 55vw, 100vw" />
        </div>
      ) : null}
      <div className="bn-tuile bn-recit-texte">
        {texte(section.textes, "etiquette") ? <p className="etiquette">{texte(section.textes, "etiquette")}</p> : null}
        {titre ? <h2><Lignes texte={titre} /></h2> : null}
        {corps ? <p className="chapo">{corps}</p> : null}
        {section.lien ? (
          <Link className="bn-lien" href={section.lien}>
            {texte(section.textes, "cta", t.accueil.recitLien)}
            <Fleche taille={14} className="rtl:-scale-x-100" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function Engagements({ cadre }: { cadre: Cadre }) {
  const { livraison } = cadre;
  const faits = [
    livraison.cod ? { icone: <Billets />, titre: t.produit.payezALaLivraison, texte: t.produit.payezALaLivraisonTexte } : null,
    livraison.delai
      ? { icone: <Camion />, titre: livraison.delai, texte: cadre.seuilGratuiteMillimes ? t.annonce.livraisonOfferte(formatePrix(cadre.seuilGratuiteMillimes)) : (livraison.frais ?? "") }
      : null,
    livraison.cod && livraison.rappel ? { icone: <Telephone />, titre: t.produit.confirmationTelephonique, texte: t.produit.confirmationTelephoniqueTexte } : null,
    { icone: <Retour />, titre: t.produit.refusPossible, texte: t.produit.refusPossibleTexte },
  ].filter((f) => f !== null);
  return (
    <section className="enveloppe bn-section">
      <ul className="bn-engagements" data-n={faits.length}>
        {faits.map((f) => (
          <li key={f.titre} className="bn-tuile">
            {f.icone}
            <b>{f.titre}</b>
            <span>{f.texte}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
