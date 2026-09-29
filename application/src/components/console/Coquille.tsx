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
};
export type GroupeCoquille = { titre?: string; liens: LienCoquille[] };

/** Les initiales d'un nom ou d'une adresse : « appels@maymar.test » → « AP ». */
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
      <span className="avatar" aria-hidden="true">{initiales(email)}</span>
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

export function Coquille({ accueil, titre, sousTitre, logo, changer, groupes, email, role, children }: {
  accueil: string;
  titre: string;
  sousTitre: string;
  /** Le carré de la marque : une lettre, ou le monogramme SkanEcom. */
  logo: React.ReactNode;
  changer?: { href: string; libelle: string };
  groupes: GroupeCoquille[];
  email: string;
  role: string;
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
    <div className="app">
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
        <Navigation groupes={groupes} />
        <Compte email={email} role={role} />
      </aside>

      <header className="app-haut">
        {marque}
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
        <div className="app-contenu">{children}</div>
      </main>
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
