import Link from "next/link";
import { Photo } from "./Photo";
import { PhotoOuverture } from "./PhotoOuverture";
import { ChampRecherche } from "./ChampRecherche";
import { Fleche, Loupe } from "./Icones";
import { descendance, type Cadre } from "@/lib/boutique";
import { texte, type Section } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";
import { champ, t } from "@/lib/i18n";
import type { Service } from "./AccueilTechnique";

/* ============================================================================
   L'ACCUEIL COMMERCE — high-tech, électroménager, outillage, grande
   distribution. Il reprend l'accueil technique (sélections, marques, avis,
   questions) et en change trois sections :

   · l'ouverture : la RECHERCHE D'ABORD — le titre de la boutique, une grande
     barre de recherche (les suggestions de l'en-tête), les rayons en
     raccourcis, le nombre de références ;
   · les engagements : une bande de services, juste sous l'ouverture ;
   · les rayons : une tuile par rayon, ses sous-rayons en liens directs.
   Préfixe co-.
   ========================================================================== */

export function OuvertureCommerce({ rang, section, cadre }: { rang: number; section: Extract<Section, { type: "hero" }>; cadre: Cadre }) {
  const titre = texte(section.textes, "titre", cadre.boutique.nom);
  const chapo = texte(section.textes, "chapo") || texte(cadre.theme.textes, "resume");
  const etiquette = texte(section.textes, "etiquette");
  const image = section.image && !section.image.detouree ? section.image : null;
  const cta = texte(section.textes, "cta", t.accueil.heroCta);
  const raccourcis = rayonsGarnis(cadre).slice(0, 6);
  return (
    <section className="co-ouverture" data-section={rang} data-image={image ? "" : undefined}>
      {/* Le fond (photo et voile) a ses coins ; le contenu déborde librement : les suggestions de recherche passent dessous. */}
      <div className="co-ouverture-fond" aria-hidden={image ? undefined : true}>
        {image ? (
          <PhotoOuverture className="co-ouverture-image" paysage={urlFichier(image.chemin)} portrait={image.portrait ? urlFichier(image.portrait) : undefined}
            alt={texte(section.textes, "image_alt", cadre.boutique.nom)} />
        ) : null}
      </div>
      <div className="co-ouverture-contenu">
        {etiquette ? <p className="te-surtitre" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
        <h1 key={titre} data-texte="titre" data-lignes="">
          {titre.split("\n").map((l, i) => (
            <span key={i}>
              {i > 0 ? <br /> : null}
              {l}
            </span>
          ))}
        </h1>
        {chapo ? <p className="co-ouverture-chapo" key={chapo} data-texte="chapo">{chapo}</p> : null}
        <form action="/recherche" method="get" role="search" className="te-recherche co-recherche">
          <label htmlFor="q-accueil" className="sr-only">{t.recherche.champAria}</label>
          <ChampRecherche id="q-accueil" placeholder={t.recherche.placeholder} />
          <button type="submit" aria-label={t.recherche.lancer}>
            <Loupe taille={22} />
          </button>
        </form>
        {raccourcis.length ? (
          <nav className="co-raccourcis" aria-label={t.commerce.rayonsFrequents}>
            {raccourcis.map((r) => (
              <Link key={r.slug} href={`/categorie/${r.slug}`}>{r.nom}</Link>
            ))}
          </nav>
        ) : null}
        <p className="co-ouverture-pied">
          <span>{t.catalogue.references(cadre.boutique.nb_produits)}</span>
          <Link className="co-lien" href={section.lien ?? "/catalogue"}>
            <span key={cta} data-texte="cta">{cta}</span> <Fleche taille={16} className="rtl:-scale-x-100" />
          </Link>
        </p>
      </div>
    </section>
  );
}

/** Les services, en bande sous l'ouverture : une icône, un mot, une ligne. */
export function ServicesCommerce({ rang, services }: { rang: number; services: Service[] }) {
  if (services.length === 0) return null;
  return (
    <section className="co-services" data-section={rang} aria-label={t.accueil.engagementsTitre}>
      <ul role="list">
        {services.map((s) => (
          <li key={s.titre}>
            {s.icone}
            <span>
              <b>{s.titre}</b>
              {s.texte ? <span>{s.texte}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Une tuile par rayon (ceux qui ont des pièces) : sa photo, son compte, ses sous-rayons. */
export function RayonsCommerce({ rang, section, cadre }: { rang: number; section: Extract<Section, { type: "rayons" }>; cadre: Cadre }) {
  const compte = (slug: string) => descendance(cadre.categories, slug).reduce((n, c) => n + (c.nb_produits ?? 0), 0);
  const tuiles = cadre.racines
    .map((r) => {
      const enfants = cadre.categories.filter((c) => c.parent_id === r.id && compte(c.slug) > 0);
      return { r, enfants, total: compte(r.slug), image: r.image_chemin ?? enfants.find((e) => e.image_chemin)?.image_chemin ?? null };
    })
    .filter((x) => x.total > 0);
  if (tuiles.length === 0) return null;
  const titre = texte(section.textes, "titre", t.accueil.rayonsTitreTechnique);
  return (
    <section className="te-section" data-section={rang}>
      <div className="te-section-tete">
        <h2 key={titre} data-texte="titre">{titre}</h2>
        <Link className="te-lien-fleche" href="/catalogue">
          {t.commun.toutLeCatalogue}
          <Fleche taille={16} className="rtl:-scale-x-100" />
        </Link>
      </div>
      <ul className="co-rayons" role="list">
        {tuiles.map(({ r, enfants, total, image }) => (
          <li key={r.slug} className="co-rayon">
            <Link className="co-rayon-tete" href={`/categorie/${r.slug}`}>
              <Photo photo={image ? { src: urlFichier(image), alt: "" } : null} ratio="4 / 3" tailles="(min-width: 1100px) 22vw, (min-width: 700px) 45vw, 92vw" />
              <span className="co-rayon-nom">{champ(r, "nom")}</span>
              <span className="co-rayon-compte">{t.catalogue.references(total)}</span>
            </Link>
            {enfants.length ? (
              <ul className="co-rayon-enfants" role="list">
                {enfants.slice(0, 5).map((e) => (
                  <li key={e.slug}>
                    <Link href={`/categorie/${e.slug}`}>{champ(e, "nom")} <span>{compte(e.slug)}</span></Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Les rayons à pièces, les plus fins d'abord (« Perceuses » dit plus qu'« Outillage »). */
function rayonsGarnis(cadre: Cadre): { slug: string; nom: string }[] {
  const compte = (slug: string) => descendance(cadre.categories, slug).reduce((n, c) => n + (c.nb_produits ?? 0), 0);
  return cadre.racines.flatMap((r) => {
    const enfants = cadre.categories.filter((c) => c.parent_id === r.id);
    return (enfants.length ? enfants : [r]).filter((c) => compte(c.slug) > 0).map((c) => ({ slug: c.slug, nom: champ(c, "nom") }));
  });
}
