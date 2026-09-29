import Link from "next/link";
import { Bulle, Loupe, Personne } from "./Icones";
import { BoutonPanier } from "./BoutonPanier";
import { NavRayons } from "./NavRayons";
import { EnteteDefilant, MenuMobile, type EntreeMenu } from "./EnteteClient";
import { champ, t } from "@/lib/i18n";
import { urlFichier } from "@/lib/photos";
import { faitsDeService, lienConseil } from "@/lib/faits";
import type { Cadre } from "@/lib/boutique";

/* ============================================================================
   L'EN-TÊTE — un par gabarit, parce que les deux métiers ne cherchent pas de
   la même façon :

   · ÉDITORIAL (mode, bagages) : on flâne. Bandeau d'annonce fin, logo au
     centre, rayons en petites capitales, recherche en icône. Posé sur la
     photo d'ouverture de l'accueil.
   · TECHNIQUE (outillage, quincaillerie) : on sait ce qu'on veut. Barre de
     services, en-tête sombre, GRANDE barre de recherche (nom, marque,
     référence), barre des rayons dessous.

   Dans les deux : aucun rayon inventé (les rayons actifs de la boutique),
   la recherche marche sans JavaScript (formulaire ou lien), et l'en-tête vit
   dans le layout — il reste en place d'une page à l'autre.
   ========================================================================== */

export function Logo({ cadre, className = "" }: { cadre: Cadre; className?: string }) {
  const { logo } = cadre.theme;
  if (!logo) return <span className={`marque-texte ${className}`}>{cadre.boutique.nom}</span>;
  if (logo.mode === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`marque-image ${className}`} src={urlFichier(logo.chemin)} alt={cadre.boutique.nom} />;
  }
  return <span className={`marque ${className}`} role="img" aria-label={cadre.boutique.nom} />;
}

/** slug de chaque rayon → slug de son rayon de premier niveau. */
function racines(cadre: Cadre): Record<string, string> {
  const parId = new Map(cadre.categories.map((c) => [c.id, c]));
  const sortie: Record<string, string> = {};
  for (const c of cadre.categories) {
    let r = c;
    for (let garde = 0; r.parent_id && parId.has(r.parent_id) && garde < 10; garde++) r = parId.get(r.parent_id)!;
    sortie[c.slug] = r.slug;
  }
  return sortie;
}

/** Les acheteurs ont-ils un compte (numéro confirmé par SMS) ? C'est le cas
 *  tant que la boutique n'accepte pas les commandes en invité. */
function avecComptes(cadre: Cadre): boolean {
  return cadre.reglages["compte.obligatoire"] !== false;
}

function entreesMenu(cadre: Cadre): EntreeMenu[] {
  return [
    ...cadre.racines.map((c) => ({
      cle: c.slug,
      href: `/categorie/${c.slug}`,
      nom: champ(c, "nom"),
      enfants: cadre.categories
        .filter((s) => s.parent_id === c.id)
        .map((s) => ({ cle: s.slug, href: `/categorie/${s.slug}`, nom: champ(s, "nom") })),
    })),
    { cle: "catalogue", href: "/catalogue", nom: t.commun.toutLeCatalogue },
    { cle: "recherche", href: "/recherche", nom: t.commun.rechercher },
    ...(avecComptes(cadre) ? [{ cle: "compte", href: "/compte", nom: t.compte.lien }] : []),
  ];
}

/** L'accueil s'ouvre-t-il par une photo pleine page (et pas détourée) ? */
function ouvertureSurPhoto(cadre: Cadre): boolean {
  const premiere = cadre.theme.sections[0];
  return premiere?.type === "hero" && Boolean(premiere.image) && !premiere.image?.detouree;
}

export function Entete({ cadre }: { cadre: Cadre }) {
  return cadre.theme.code === "technique" ? <EnteteTechnique cadre={cadre} /> : <EnteteEditorial cadre={cadre} />;
}

function EnteteEditorial({ cadre }: { cadre: Cadre }) {
  const faits = faitsDeService(cadre);
  // Cinq rayons au plus à côté du logo ; « Tout le catalogue » s'il reste
  // de la place (sinon, il est dans le menu, les sections et le pied).
  const liens = [
    ...cadre.racines.slice(0, 5).map((c) => ({ cle: c.slug, href: `/categorie/${c.slug}`, nom: champ(c, "nom") })),
    ...(cadre.racines.length <= 3 ? [{ cle: "catalogue", href: "/catalogue", nom: t.commun.toutLeCatalogue }] : []),
  ];
  return (
    <>
      {faits.length > 0 ? (
        <div className="ed-annonce">
          <p>
            {faits.slice(0, 2).map((f, i) => (
              <span key={f} className={i > 0 ? "cache-mobile" : undefined}>
                {f}
              </span>
            ))}
          </p>
        </div>
      ) : null}
      <EnteteDefilant className="ed-entete" surImage={ouvertureSurPhoto(cadre)}>
        <div className="enveloppe ed-entete-rang">
          <div className="ed-entete-debut">
            <MenuMobile entrees={entreesMenu(cadre)} faits={faits} className="cache-desktop" />
            <NavRayons liens={liens} racineDe={racines(cadre)} libelle={t.commun.navigationPrincipale} className="ed-nav cache-mobile" />
          </div>
          <Link href="/" className="ed-logo" aria-label={t.marque.accueilAria(cadre.boutique.nom)}>
            <Logo cadre={cadre} />
          </Link>
          <div className="ed-entete-fin">
            <Link className="icone-btn" href="/recherche" aria-label={t.commun.rechercher}>
              <Loupe />
            </Link>
            {avecComptes(cadre) ? (
              <Link className="icone-btn cache-mobile" href="/compte" aria-label={t.compte.lien}>
                <Personne />
              </Link>
            ) : null}
            <BoutonPanier gabarit="editorial" seuilGratuite={cadre.seuilGratuiteMillimes} />
          </div>
        </div>
      </EnteteDefilant>
    </>
  );
}

function EnteteTechnique({ cadre }: { cadre: Cadre }) {
  const faits = faitsDeService(cadre);
  const conseil = lienConseil(cadre);
  const liens = [
    { cle: "catalogue", href: "/catalogue", nom: t.commun.tousLesRayons },
    ...cadre.racines.slice(0, 7).map((c) => ({ cle: c.slug, href: `/categorie/${c.slug}`, nom: champ(c, "nom") })),
  ];
  return (
    <>
      {faits.length > 0 ? (
        <div className="te-utilitaire">
          <ul className="enveloppe">
            {faits.map((f, i) => (
              <li key={f} className={i > 0 ? "cache-mobile" : undefined}>
                {f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <header className="te-entete">
        <div className="enveloppe te-entete-rang">
          <MenuMobile entrees={entreesMenu(cadre)} faits={faits} className="te-menu cache-desktop" />
          <Link href="/" className="te-logo" aria-label={t.marque.accueilAria(cadre.boutique.nom)}>
            <Logo cadre={cadre} />
          </Link>
          <form action="/recherche" method="get" role="search" className="te-recherche">
            <label htmlFor="q-entete" className="sr-only">
              {t.recherche.champAria}
            </label>
            <input id="q-entete" name="q" type="search" placeholder={t.recherche.placeholder} autoComplete="off" enterKeyHint="search" />
            <button type="submit" aria-label={t.recherche.lancer}>
              <Loupe />
            </button>
          </form>
          <div className="te-entete-fin">
            {conseil ? (
              <a className="te-action cache-mobile" href={conseil} target="_blank" rel="noopener noreferrer">
                <Bulle taille={22} />
                <span>{t.annonce.conseil}</span>
              </a>
            ) : null}
            {avecComptes(cadre) ? (
              <Link className="te-action cache-mobile" href="/compte">
                <Personne taille={22} />
                <span>{t.compte.lien}</span>
              </Link>
            ) : null}
            <BoutonPanier gabarit="technique" seuilGratuite={cadre.seuilGratuiteMillimes} />
          </div>
        </div>
        <div className="te-barre-rayons cache-mobile">
          <NavRayons liens={liens} racineDe={racines(cadre)} libelle={t.commun.navigationPrincipale} className="enveloppe te-nav" />
        </div>
      </header>
    </>
  );
}
