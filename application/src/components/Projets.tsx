import Link from "next/link";
import { Photo } from "./Photo";
import { FilAriane, type Etape } from "./FilAriane";
import { GalerieProjet } from "./GalerieProjet";
import { TexteDescription } from "./TexteDescription";
import { SectionContact } from "./SectionsVitrine";
import { Fleche } from "./Icones";
import { descendance, type Cadre } from "@/lib/boutique";
import type { Liste, Produit } from "@/lib/catalogue";
import { valeurAvecUnite } from "@/lib/caracteristiques";
import { cheminFiltres, type Filtres } from "@/lib/filtres";
import { photosProduit, urlPhoto } from "@/lib/photos";
import { champ, t } from "@/lib/i18n";

/* ============================================================================
   LES RÉALISATIONS — le catalogue d'un site vitrine en structure Studio : un
   studio d'architecture montre des projets, un artisan ses pièces, un
   traiteur ses tables. Ni prix ni panier : la photo, le nom, ce qui situe le
   projet (les caractéristiques « sur la carte » : le lieu, l'année…), puis
   « Parlons de votre projet ».

   · CarteProjet — l'unité des listes : la photo en grand (la photo partagée
     la mène à la fiche, TransitionsVue), son numéro, son nom, sa ligne.
   · ListeProjets — « Toutes les réalisations » et chaque domaine (rayon) :
     les domaines en puces, les projets en deux colonnes décalées.
   · FicheProjet — la page d'un projet : le titre immense, ses faits (toutes
     ses caractéristiques), la photo d'ouverture, le texte, les photos en
     séquence (la visionneuse au clic), le formulaire qui part « à propos de
     ce projet », et le projet suivant.
   ========================================================================== */

const deux = (n: number) => String(n).padStart(2, "0");

/** La ligne d'une carte : le domaine (rayon), puis les caractéristiques que
 *  la boutique montre sur la carte (le lieu, l'année…). */
function ligneProjet(p: Produit): string {
  const faits = (p.caracteristiques ?? []).filter((c) => c.en_carte).map((c) => valeurAvecUnite(c.valeur, c));
  return [p.categorie ? champ(p.categorie, "nom") : null, ...faits].filter(Boolean).join(" · ");
}

export function CarteProjet({
  produit,
  numero,
  tailles = "(min-width: 900px) 46vw, 100vw",
  prioritaire = false,
  format = "4 / 5",
}: {
  produit: Produit;
  numero: number;
  tailles?: string;
  prioritaire?: boolean;
  format?: string;
}) {
  const nom = champ(produit, "nom");
  const ligne = ligneProjet(produit);
  return (
    <article className="st-projet apparait">
      <Link className="st-projet-lien" href={`/produit/${produit.slug}`} data-curseur={t.studio.curseurProjet}>
        <span className="st-projet-media">
          <Photo photo={urlPhoto(produit)} ratio={format} tailles={tailles} prioritaire={prioritaire} nom={nom} />
          <span className="st-projet-voir" aria-hidden="true">{t.studio.voir}</span>
        </span>
        <span className="st-projet-legende">
          <span className="st-projet-num" aria-hidden="true">{deux(numero)}</span>
          <span className="st-projet-textes">
            <h3 className="st-projet-nom">{nom}</h3>
            {ligne ? <span className="st-projet-ligne">{ligne}</span> : null}
          </span>
          <Fleche taille={18} className="st-projet-fleche rtl:-scale-x-100" />
        </span>
      </Link>
    </article>
  );
}

export function ListeProjets({
  cadre,
  liste,
  filtres,
  base,
  titre,
  chapo,
  fil,
  rayonActif,
}: {
  cadre: Cadre;
  liste: Liste;
  filtres: Filtres;
  base: string;
  titre: string;
  chapo: string | null;
  fil: Etape[] | null;
  /** Le domaine montré (son slug) ; `null` : toutes les réalisations. */
  rayonActif: string | null;
}) {
  const pages = Math.max(1, Math.ceil(liste.total / liste.par_page));
  const compte = (slug: string) => descendance(cadre.categories, slug).reduce((n, c) => n + (c.nb_produits ?? 0), 0);
  const domaines = cadre.racines.filter((r) => compte(r.slug) > 0);
  const decalage = (liste.page - 1) * liste.par_page;
  return (
    <div className="st-liste">
      <header className="enveloppe st-liste-tete">
        {fil ? <FilAriane etapes={fil} /> : null}
        <h1 className="vi-titre st-liste-titre">{titre}</h1>
        {chapo ? <p className="chapo">{chapo}</p> : null}
        {domaines.length > 1 ? (
          <nav className="st-domaines" aria-label={t.studio.domainesTitre}>
            <Link href="/catalogue" aria-current={rayonActif === null ? "page" : undefined}>
              {t.studio.toutes} <sup>{cadre.boutique.nb_produits}</sup>
            </Link>
            {domaines.map((r) => (
              <Link key={r.slug} href={`/categorie/${r.slug}`} aria-current={rayonActif === r.slug ? "page" : undefined}>
                {champ(r, "nom")} <sup>{compte(r.slug)}</sup>
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      {liste.produits.length ? (
        <div className="enveloppe st-grille-projets">
          {liste.produits.map((p, i) => (
            <CarteProjet key={p.id} produit={p} numero={decalage + i + 1} prioritaire={i < 2} />
          ))}
        </div>
      ) : (
        <div className="enveloppe listing-vide">
          <h2>{t.accueil.selectionVideTitre}</h2>
          <p>{t.accueil.selectionVide}</p>
        </div>
      )}
      {pages > 1 ? (
        <nav className="enveloppe pagination st-pagination" aria-label={t.catalogue.pageSur(liste.page, pages)}>
          {liste.page > 1 ? (
            <Link className="btn btn-second" rel="prev" href={cheminFiltres(base, { ...filtres, page: liste.page - 1 })}>{t.catalogue.precedente}</Link>
          ) : null}
          <span className="legende">{t.catalogue.pageSur(liste.page, pages)}</span>
          {liste.page < pages ? (
            <Link className="btn btn-second" rel="next" href={cheminFiltres(base, { ...filtres, page: liste.page + 1 })}>{t.catalogue.suivante}</Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

export function FicheProjet({ cadre, produit, fil, suivant }: { cadre: Cadre; produit: Produit; fil: Etape[]; suivant: Produit | null }) {
  const nom = champ(produit, "nom");
  const photos = photosProduit(produit);
  const [ouverture, ...suite] = photos;
  const faits = (produit.caracteristiques ?? []).map((c) => ({ cle: c.cle, label: champ(c, "label"), valeur: valeurAvecUnite(c.valeur, c) }));
  const description = champ(produit, "description");
  const domaine = produit.categorie ? champ(produit.categorie, "nom") : null;
  return (
    <article className="st-fiche" data-fiche={produit.slug}>
      <header className="enveloppe st-fiche-tete">
        <FilAriane etapes={fil} />
        {domaine ? <p className="etiquette">{domaine}</p> : null}
        <h1 className="vi-titre st-fiche-titre">{nom}</h1>
        {faits.length ? (
          <dl className="st-faits">
            {faits.map((f) => (
              <div key={f.cle}>
                <dt>{f.label}</dt>
                <dd>{f.valeur}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>

      <div className="st-fiche-ouverture">
        <Photo photo={ouverture ?? null} ratio="16 / 9" tailles="100vw" prioritaire nom={nom} />
      </div>

      <div className="enveloppe st-fiche-corps">
        <div className="st-fiche-texte">
          <h2 className="etiquette">{t.studio.leProjet}</h2>
          {description ? <TexteDescription texte={description} /> : null}
        </div>
        <aside className="st-fiche-appel">
          <p className="st-fiche-appel-titre">{t.studio.projetSimilaire}</p>
          <p className="legende">{t.studio.projetSimilaireTexte}</p>
          <a className="btn btn-primaire" href="#contact">{t.studio.ecrireAuSujet}</a>
        </aside>
      </div>

      {suite.length ? <GalerieProjet photos={photos} depuis={1} titre={t.studio.enImages} /> : null}

      <SectionContact rang={-1} section={null} cadre={cadre} produit={{ slug: produit.slug, nom }} />

      {suivant ? (
        <nav className="st-suivant" aria-label={t.studio.projetSuivant}>
          <Link className="st-suivant-lien" href={`/produit/${suivant.slug}`} data-curseur={t.studio.projetSuivant} data-rideau={champ(suivant, "nom")}>
            <span className="enveloppe st-suivant-textes">
              <span className="etiquette">{t.studio.projetSuivant}</span>
              <span className="vi-titre st-suivant-nom">{champ(suivant, "nom")}</span>
              <Fleche taille={28} className="rtl:-scale-x-100" />
            </span>
            <span className="st-suivant-media" aria-hidden="true">
              <Photo photo={urlPhoto(suivant)} ratio="21 / 9" tailles="100vw" />
            </span>
          </Link>
        </nav>
      ) : null}
    </article>
  );
}
