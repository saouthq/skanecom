import Link from "next/link";
import { Bulle, Loupe, Personne } from "./Icones";
import { BoutonPanier } from "./BoutonPanier";
import { LienFavoris } from "./LienFavoris";
import { ChampRecherche } from "./ChampRecherche";
import { NavRayons } from "./NavRayons";
import { BandeauDefilant } from "./BandeauDefilant";
import { EnteteDefilant, MenuMobile, type EntreeMenu, type RaccourciMenu } from "./EnteteClient";
import { GrandMenu, type RayonMenu } from "./GrandMenu";
import { champ, t } from "@/lib/i18n";
import { urlFichier } from "@/lib/photos";
import { assurancesPanier, bandeau, faitsDeService, lienConseil } from "@/lib/faits";
import { descendance, type Cadre } from "@/lib/boutique";
import { aUnContact, contactDe } from "@/lib/contact";

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
  // Un site vitrine ne prend pas de commande : rien à suivre dans un compte.
  return cadre.reglages["compte.obligatoire"] !== false && !cadre.siteVitrine;
}

/** Les pièces d'un rayon, sous-rayons compris. */
function piecesDuRayon(cadre: Cadre, slug: string): number {
  return descendance(cadre.categories, slug).reduce((n, c) => n + (c.nb_produits ?? 0), 0);
}

/** Les rayons du menu du téléphone : ceux qui ont des pièces (tous, si le
 *  catalogue est encore vide), avec leur photo — celle du rayon, sinon d'un
 *  sous-rayon — et leurs sous-rayons garnis. */
function entreesMenu(cadre: Cadre): EntreeMenu[] {
  const entrees = cadre.racines.map((c) => ({
    cle: c.slug,
    href: `/categorie/${c.slug}`,
    nom: champ(c, "nom"),
    compte: piecesDuRayon(cadre, c.slug),
    image: c.image_chemin ?? cadre.categories.find((s) => s.parent_id === c.id && s.image_chemin)?.image_chemin ?? null,
    enfants: cadre.categories
      .filter((s) => s.parent_id === c.id && piecesDuRayon(cadre, s.slug) > 0)
      .map((s) => ({ cle: s.slug, href: `/categorie/${s.slug}`, nom: champ(s, "nom") })),
  }));
  const garnis = entrees.filter((e) => e.compte > 0);
  return garnis.length > 0 ? garnis : entrees;
}

/** Les raccourcis du menu du téléphone : ses commandes (ou le suivi, sans
 *  compte), ses favoris, et la boutique au bout du fil (WhatsApp, sinon
 *  le téléphone). */
function raccourcisMenu(cadre: Cadre): RaccourciMenu[] {
  const contact = contactDe(cadre, t.contact.messageWhatsapp(cadre.boutique.nom));
  return [
    ...(avecComptes(cadre) ? [{ cle: "compte", href: "/compte", nom: t.compte.lien, icone: "compte" as const }] : []),
    ...(!avecComptes(cadre) && !cadre.siteVitrine ? [{ cle: "suivi", href: "/suivi", nom: t.menu.suivre, icone: "suivi" as const }] : []),
    ...(cadre.favoris ? [{ cle: "favoris", href: "/favoris", nom: t.favoris.titre, icone: "favoris" as const }] : []),
    ...(contact.whatsapp
      ? [{ cle: "whatsapp", href: contact.whatsapp.href, nom: t.contact.ecrireWhatsapp, icone: "whatsapp" as const, externe: true }]
      : contact.telephone
        ? [{ cle: "contact", href: contact.telephone.href, nom: t.menu.contact, icone: "contact" as const, externe: true }]
        : []),
  ];
}

/** « Besoin d'aide ? » au bas du menu du téléphone : ce que le pied de page
 *  offre déjà — les pages de la boutique (questions, livraison…), le
 *  contact, la garantie. Le suivi d'une commande est dans les raccourcis. */
function aideMenu(cadre: Cadre): { href: string; nom: string }[] {
  return [
    ...cadre.pages.filter((p) => p.dans_pied).map((p) => ({ href: `/${p.slug}`, nom: champ(p, "titre") })),
    ...(aUnContact(contactDe(cadre)) ? [{ href: "/contact", nom: t.pied.contact }] : []),
    ...(cadre.sav ? [{ href: "/garantie-et-sav", nom: t.sav.lienPied }] : []),
  ];
}

/** L'accueil s'ouvre-t-il par une photo pleine page (et pas détourée) ? */
function ouvertureSurPhoto(cadre: Cadre): boolean {
  // Le Bento ouvre sur une tuile, pas sur une photo pleine page.
  if (cadre.theme.structure === "bento") return false;
  const premiere = cadre.theme.sections[0];
  return premiere?.type === "hero" && Boolean(premiere.image) && !premiere.image?.detouree;
}

export function Entete({ cadre }: { cadre: Cadre }) {
  return cadre.theme.code === "technique" ? <EnteteTechnique cadre={cadre} /> : <EnteteEditorial cadre={cadre} />;
}

function EnteteEditorial({ cadre }: { cadre: Cadre }) {
  const faits = faitsDeService(cadre);
  const annonces = bandeau(cadre);
  // Cinq rayons au plus à côté du logo ; « Tout le catalogue » s'il reste
  // de la place (sinon, il est dans le menu, les sections et le pied).
  const liens = [
    ...cadre.racines.slice(0, 5).map((c) => ({ cle: c.slug, href: `/categorie/${c.slug}`, nom: champ(c, "nom") })),
    ...(cadre.racines.length <= 3 ? [{ cle: "catalogue", href: "/catalogue", nom: t.commun.toutLeCatalogue }] : []),
  ];
  return (
    <>
      {annonces.length > 0 ? (
        <div className="ed-annonce" data-zone="entete">
          {/* Au téléphone, une à une (BandeauDefilant) ; sur ordinateur, les deux premières côte à côte. */}
          <BandeauDefilant>
            {annonces.slice(0, 5).map((f, i) => (
              <span key={f} data-reglage={i === 0 && cadre.annonce ? "vitrine.annonce" : undefined}>
                {f}
              </span>
            ))}
          </BandeauDefilant>
        </div>
      ) : null}
      <EnteteDefilant className="ed-entete" surImage={ouvertureSurPhoto(cadre)}>
        <div className="enveloppe ed-entete-rang" data-zone="entete">
          <div className="ed-entete-debut">
            <MenuMobile marque={<Logo cadre={cadre} />} entrees={entreesMenu(cadre)} raccourcis={raccourcisMenu(cadre)} faits={faits} aide={aideMenu(cadre)} className="cache-desktop" />
            <NavRayons liens={liens} racineDe={racines(cadre)} libelle={t.commun.navigationPrincipale} className="ed-nav cache-mobile"
              replier={liens.some((l) => l.cle === "catalogue") ? undefined : { cle: "catalogue", href: "/catalogue", nom: t.commun.toutLeCatalogue }} />
          </div>
          <Link href="/" className="ed-logo" aria-label={t.marque.accueilAria(cadre.boutique.nom)}>
            <Logo cadre={cadre} />
          </Link>
          <div className="ed-entete-fin">
            <Link className="icone-btn" href="/recherche" aria-label={t.commun.rechercher}>
              <Loupe />
            </Link>
            {cadre.favoris ? <LienFavoris className="icone-btn cache-mobile lien-favoris" /> : null}
            {avecComptes(cadre) ? (
              <Link className="icone-btn cache-mobile" href="/compte" aria-label={t.compte.lien}>
                <Personne />
              </Link>
            ) : null}
            {cadre.siteVitrine ? null : (
            <BoutonPanier gabarit="editorial" seuilGratuite={cadre.seuilGratuiteMillimes} assurances={assurancesPanier(cadre)} devis={cadre.devis} ensemble={cadre.achetesEnsemble} lots={cadre.promotions} />)}
          </div>
        </div>
      </EnteteDefilant>
    </>
  );
}

/** Les rayons du grand menu (structure Commerce) : ceux qui ont des pièces,
 *  avec leurs sous-rayons garnis, leurs comptes et leur photo. */
function rayonsDuMenu(cadre: Cadre): RayonMenu[] {
  const compte = (slug: string) => piecesDuRayon(cadre, slug);
  return cadre.racines
    .map((r) => ({
      cle: r.slug,
      href: `/categorie/${r.slug}`,
      nom: champ(r, "nom"),
      compte: compte(r.slug),
      image: r.image_chemin ?? cadre.categories.find((c) => c.parent_id === r.id && c.image_chemin)?.image_chemin ?? null,
      enfants: cadre.categories
        .filter((c) => c.parent_id === r.id)
        .map((c) => ({ cle: c.slug, href: `/categorie/${c.slug}`, nom: champ(c, "nom"), compte: compte(c.slug) }))
        .filter((c) => c.compte > 0),
    }))
    .filter((r) => r.compte > 0);
}

function EnteteTechnique({ cadre }: { cadre: Cadre }) {
  const faits = faitsDeService(cadre);
  const annonces = bandeau(cadre);
  const conseil = lienConseil(cadre);
  // Le Commerce ouvre ses rayons par le grand menu : la barre garde les liens directs.
  const commerce = cadre.theme.structure === "commerce";
  const liens = [
    ...(commerce ? [] : [{ cle: "catalogue", href: "/catalogue", nom: t.commun.tousLesRayons }]),
    ...cadre.racines.slice(0, 7).map((c) => ({ cle: c.slug, href: `/categorie/${c.slug}`, nom: champ(c, "nom") })),
  ];
  return (
    <>
      {annonces.length > 0 ? (
        <div className="te-utilitaire" data-zone="entete">
          {/* Au téléphone, un à un (BandeauDefilant) ; sur ordinateur, tous ceux qui tiennent sur la ligne. */}
          <BandeauDefilant balise="ul" className="enveloppe">
            {annonces.map((f, i) => (
              <li key={f} data-reglage={i === 0 && cadre.annonce ? "vitrine.annonce" : undefined}>
                {f}
              </li>
            ))}
          </BandeauDefilant>
        </div>
      ) : null}
      <header className="te-entete" data-zone="entete">
        <div className="enveloppe te-entete-rang">
          <MenuMobile marque={<Logo cadre={cadre} />} entrees={entreesMenu(cadre)} raccourcis={raccourcisMenu(cadre)} faits={faits} aide={aideMenu(cadre)} className="te-menu cache-desktop" />
          <Link href="/" className="te-logo" aria-label={t.marque.accueilAria(cadre.boutique.nom)}>
            <Logo cadre={cadre} />
          </Link>
          <form action="/recherche" method="get" role="search" className="te-recherche">
            <label htmlFor="q-entete" className="sr-only">
              {t.recherche.champAria}
            </label>
            <ChampRecherche id="q-entete" placeholder={t.recherche.placeholder} />
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
            {cadre.favoris ? <LienFavoris className="te-action cache-mobile lien-favoris" avecLibelle /> : null}
            {avecComptes(cadre) ? (
              <Link className="te-action cache-mobile" href="/compte">
                <Personne taille={22} />
                <span>{t.compte.lien}</span>
              </Link>
            ) : null}
            {cadre.siteVitrine ? null : (
            <BoutonPanier gabarit="technique" seuilGratuite={cadre.seuilGratuiteMillimes} assurances={assurancesPanier(cadre)} devis={cadre.devis} ensemble={cadre.achetesEnsemble} lots={cadre.promotions} />)}
          </div>
        </div>
        <div className="te-barre-rayons cache-mobile">
          {commerce ? (
            <div className="enveloppe co-barre">
              <GrandMenu rayons={rayonsDuMenu(cadre)} />
              <NavRayons liens={liens} racineDe={racines(cadre)} libelle={t.commun.navigationPrincipale} className="te-nav" />
            </div>
          ) : (
            <NavRayons liens={liens} racineDe={racines(cadre)} libelle={t.commun.navigationPrincipale} className="enveloppe te-nav" />
          )}
        </div>
      </header>
    </>
  );
}
