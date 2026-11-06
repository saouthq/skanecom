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

   · CarteProjet — l'unité des listes : une carte (cadre, ombre ou nue selon
     le style « cartes »), la photo, le nom, sa ligne ; la photo partagée la
     mène à la fiche (TransitionsVue).
   · ListeProjets — « Toutes les réalisations » et chaque domaine (rayon) :
     les domaines en onglets, les projets en grille.
   · FicheProjet — la page d'un projet : son titre, ses faits sur une barre,
     la photo d'ouverture dans son cadre, le texte et l'encart « Un projet
     similaire ? », les photos (la visionneuse au clic), le formulaire qui
     part « à propos de ce projet », et le projet suivant.
   ========================================================================== */

/** La ligne d'une carte : le domaine (rayon), puis les caractéristiques que
 *  la boutique montre sur la carte (le lieu, l'année…). */
function ligneProjet(p: Produit): string {
  const faits = (p.caracteristiques ?? []).filter((c) => c.en_carte).map((c) => valeurAvecUnite(c.valeur, c));
  return [p.categorie ? champ(p.categorie, "nom") : null, ...faits].filter(Boolean).join(" · ");
}

export function CarteProjet({
  produit,
  tailles = "(min-width: 1000px) 30vw, (min-width: 640px) 45vw, 92vw",
  prioritaire = false,
}: {
  produit: Produit;
  tailles?: string;
  prioritaire?: boolean;
}) {
  const nom = champ(produit, "nom");
  const ligne = ligneProjet(produit);
  return (
    <article className="st-projet apparait">
      <Link className="st-carte st-projet-lien" href={`/produit/${produit.slug}`}>
        <span className="st-carte-photo">
          <Photo photo={urlPhoto(produit)} ratio="4 / 3" tailles={tailles} prioritaire={prioritaire} nom={nom} />
        </span>
        <span className="st-carte-corps">
          <span className="st-carte-textes">
            <h3 className="st-carte-nom">{nom}</h3>
            {ligne ? <span className="st-carte-ligne">{ligne}</span> : null}
          </span>
          <Fleche taille={16} className="st-carte-fleche rtl:-scale-x-100" />
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
  return (
    <div className="st-liste">
      <header className="enveloppe st-page-tete">
        {fil ? <FilAriane etapes={fil} /> : null}
        <h1 className="vi-titre st-page-titre">{titre}</h1>
        {chapo ? <p className="chapo st-page-chapo">{chapo}</p> : null}
        {domaines.length > 1 ? (
          <nav className="st-onglets" aria-label={t.studio.domainesTitre}>
            <Link href="/catalogue" aria-current={rayonActif === null ? "page" : undefined}>
              {t.studio.toutes} <span className="st-onglet-n">{cadre.boutique.nb_produits}</span>
            </Link>
            {domaines.map((r) => (
              <Link key={r.slug} href={`/categorie/${r.slug}`} aria-current={rayonActif === r.slug ? "page" : undefined}>
                {champ(r, "nom")} <span className="st-onglet-n">{compte(r.slug)}</span>
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      {liste.produits.length ? (
        <div className="enveloppe st-grille-projets">
          {liste.produits.map((p, i) => (
            <CarteProjet key={p.id} produit={p} prioritaire={i < 3} />
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
      <header className="enveloppe st-page-tete st-fiche-tete">
        <FilAriane etapes={fil} />
        {domaine ? <p className="etiquette">{domaine}</p> : null}
        <h1 className="vi-titre st-page-titre st-fiche-titre">{nom}</h1>
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

      <div className="enveloppe st-fiche-ouverture">
        <div className="st-cadre">
          <Photo photo={ouverture ?? null} ratio="16 / 9" tailles="(min-width: 1280px) 1200px, 100vw" prioritaire nom={nom} />
        </div>
      </div>

      <div className="enveloppe st-fiche-corps">
        <div className="st-fiche-texte">
          <h2 className="etiquette">{t.studio.leProjet}</h2>
          {description ? <TexteDescription texte={description} /> : null}
        </div>
        <aside className="st-fiche-appel">
          <p className="st-fiche-appel-titre">{t.studio.projetSimilaire}</p>
          <p className="st-fiche-appel-texte">{t.studio.projetSimilaireTexte}</p>
          <a className="btn btn-primaire st-geste" href="#contact">
            {t.studio.ecrireAuSujet}
            <Fleche taille={16} className="icone-fleche rtl:-scale-x-100" />
          </a>
        </aside>
      </div>

      {suite.length ? <GalerieProjet photos={photos} depuis={1} titre={t.studio.enImages} /> : null}

      <SectionContact rang={-1} section={null} cadre={cadre} produit={{ slug: produit.slug, nom }} />

      {suivant ? (
        <nav className="enveloppe st-suivant" aria-label={t.studio.projetSuivant}>
          <Link className="st-carte st-suivant-lien" href={`/produit/${suivant.slug}`}>
            <span className="st-suivant-photo" aria-hidden="true">
              <Photo photo={urlPhoto(suivant)} ratio="16 / 10" tailles="(min-width: 900px) 40vw, 92vw" />
            </span>
            <span className="st-suivant-textes">
              <span className="st-suivant-etiquette">{t.studio.projetSuivant}</span>
              <span className="st-suivant-nom">{champ(suivant, "nom")}</span>
              {ligneProjet(suivant) ? <span className="st-carte-ligne">{ligneProjet(suivant)}</span> : null}
              <span className="st-suivant-fleche" aria-hidden="true"><Fleche taille={18} className="rtl:-scale-x-100" /></span>
            </span>
          </Link>
        </nav>
      ) : null}
    </article>
  );
}
