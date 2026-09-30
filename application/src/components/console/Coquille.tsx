import Link from "next/link";
import { Icone, type NomIcone } from "./Icone";
import { LienNav, MenuMobile } from "./LienNav";

/* ============================================================================
   LA COQUILLE DE LA CONSOLE ET DU BACKOFFICE — barre latérale sur ordinateur
   (marque, navigation, compte), barre du haut et menu sur téléphone. Le
   contenu se pose sur un panneau clair, décollé du fond.
   ========================================================================== */

export type LienCoquille = {
  href: string;
  libelle: string;
  icone: NomIcone;
  exact?: boolean;
  aussi?: string[];
  /** Après le libellé : un compteur tenu à jour (la veille des commandes). */
  extra?: React.ReactNode;
  /** Le libellé court de la barre d'onglets du téléphone. */
  court?: string;
};
export type GroupeCoquille = { titre?: string; liens: LienCoquille[] };

/** Les initiales d'un nom ou d'une adresse : « appels@maymar.test » → « AP ». */
/** Une teinte stable par personne (0–359) : la même pastille d'une page à
 *  l'autre, des listes qu'on distingue d'un coup d'œil. */
export function teinte(texte: string): number {
  let h = 0;
  for (const c of texte.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Le style d'une pastille d'initiales (`.avatar`, `.initiale`) à sa teinte. */
export function styleAvatar(texte: string, autre: React.CSSProperties = {}): React.CSSProperties {
  return { ...autre, "--teinte": teinte(texte) } as React.CSSProperties;
}

export function initiales(texte: string): string {
  const base = texte.split("@")[0].replace(/[._-]+/g, " ").trim();
  const mots = base.split(/\s+/).filter(Boolean);
  const i = mots.length > 1 ? mots[0][0] + mots[1][0] : base.slice(0, 2);
  return i.toUpperCase();
}

function Navigation({ groupes }: { groupes: GroupeCoquille[] }) {
  return (
    <nav className="app-nav" aria-label="Navigation principale">
      {groupes.map((g, i) => (
        <div key={g.titre ?? i} className="app-nav-groupe">
          {g.titre ? <p className="app-nav-titre">{g.titre}</p> : null}
          <ul role="list">
            {g.liens.map((l) => (
              <li key={l.href}>
                <LienNav href={l.href} exact={l.exact} aussi={l.aussi} className="app-nav-lien">
                  <Icone nom={l.icone} taille={16} />
                  <span>{l.libelle}</span>
                  {l.extra}
                </LienNav>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Compte({ email, role }: { email: string; role: string }) {
  return (
    <div className="app-compte">
      <span className="avatar" style={styleAvatar(email)} aria-hidden="true">{initiales(email)}</span>
      <span className="app-compte-texte">
        <span className="app-compte-email">{email}</span>
        <span className="app-compte-role">{role}</span>
      </span>
      <form action="/session/fermer" method="post">
        <button type="submit" className="btn-icone" aria-label="Se déconnecter" title="Se déconnecter">
          <Icone nom="sortie" taille={16} />
        </button>
      </form>
    </div>
  );
}

/** Sur téléphone, les destinations principales en bas de l'écran. */
function Onglets({ liens }: { liens: LienCoquille[] }) {
  return (
    <nav className="app-onglets" aria-label="Accès rapide">
      {liens.map((l) => (
        <LienNav key={l.href} href={l.href} exact={l.exact} aussi={l.aussi}>
          <Icone nom={l.icone} taille={20} />
          <span>{l.court ?? l.libelle}</span>
          {l.extra}
        </LienNav>
      ))}
    </nav>
  );
}

export function Coquille({ accueil, titre, sousTitre, logo, changer, groupes, onglets, email, role, bandeau, recherche, rechercheCompacte, palette, children }: {
  accueil: string;
  titre: string;
  sousTitre: string;
  /** Le carré de la marque : une lettre, ou le monogramme SkanEcom. */
  logo: React.ReactNode;
  changer?: { href: string; libelle: string };
  groupes: GroupeCoquille[];
  /** Sur téléphone, les quatre ou cinq destinations du quotidien, en bas. */
  onglets?: LienCoquille[];
  email: string;
  role: string;
  /** Au-dessus du contenu, sur toutes les pages : l'accès support en cours. */
  bandeau?: React.ReactNode;
  /** Le bouton de recherche de la barre latérale, et celui de l'en-tête du téléphone. */
  recherche?: React.ReactNode;
  rechercheCompacte?: React.ReactNode;
  /** La fenêtre qu'ils ouvrent (une seule par page). */
  palette?: React.ReactNode;
  children: React.ReactNode;
}) {
  const marque = (
    <Link href={accueil} className="app-marque">
      <span className="app-logo" aria-hidden="true">{logo}</span>
      <span className="app-marque-texte">
        <span className="app-marque-nom">{titre}</span>
        <span className="app-marque-sous">{sousTitre}</span>
      </span>
    </Link>
  );
  return (
    <div className={onglets?.length ? "app app-avec-onglets" : "app"}>
      <a className="saut-contenu" href="#principal">Aller au contenu</a>

      <aside className="app-cote">
        <div className="app-cote-tete">
          {marque}
          {changer ? (
            <Link href={changer.href} className="btn-icone" aria-label={changer.libelle} title={changer.libelle}>
              <Icone nom="selecteur" taille={16} />
            </Link>
          ) : null}
        </div>
        {recherche ? <div className="app-cote-recherche">{recherche}</div> : null}
        <Navigation groupes={groupes} />
        <Compte email={email} role={role} />
      </aside>

      <header className="app-haut">
        {marque}
        {rechercheCompacte ? <span className="app-haut-recherche">{rechercheCompacte}</span> : null}
        <MenuMobile>
          <summary className="btn-icone" aria-label="Menu">
            <Icone nom="menu" taille={20} />
          </summary>
          <div className="app-menu-feuille">
            <Navigation groupes={changer ? [...groupes, { liens: [{ href: changer.href, libelle: changer.libelle, icone: "selecteur", exact: true }] }] : groupes} />
            <Compte email={email} role={role} />
          </div>
        </MenuMobile>
      </header>

      <main id="principal" className="app-principal">
        {bandeau}
        <div className="app-contenu">{children}</div>
      </main>
      {onglets?.length ? <Onglets liens={onglets} /> : null}
      {palette}
      {/* Un repère neuf à chaque rendu du serveur : le geste en place sait
          ainsi quand la page rafraîchie est posée (Retours.tsx). */}
      <span hidden data-rendu={crypto.randomUUID()} />
    </div>
  );
}

/** Le monogramme de SkanEcom. */
export function LogoSkanEcom() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M16.5 7.2c-.8-1.3-2.4-2.1-4.4-2.1-2.7 0-4.5 1.4-4.5 3.4 0 4.6 9 2.5 9 7.1 0 2.1-1.9 3.5-4.7 3.5-2.2 0-4-.9-4.9-2.4"
        fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** L'en-tête d'une page : titre, phrase d'aide, actions à droite. */
export function EnTetePage({ titre, description, avant, actions, children }: {
  titre: React.ReactNode;
  description?: React.ReactNode;
  avant?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-tete">
      {avant ? <div className="page-avant">{avant}</div> : null}
      <div className="page-tete-rang">
        <div className="page-tete-texte">
          <h1>{titre}</h1>
          {description ? <p className="page-description">{description}</p> : null}
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
