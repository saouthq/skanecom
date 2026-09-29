import { initiales, LogoSkanEcom } from "./Coquille";

/* Les pages d'entrée (connexion, double authentification, lien d'accès,
   refus) : une carte centrée sur un fond discret, la marque au-dessus. */
export function Porte({ titre, description, qui, large = false, pied, children }: {
  titre: React.ReactNode;
  description?: React.ReactNode;
  /** Le compte en cours, rappelé en haut (double authentification…). */
  qui?: string | null;
  large?: boolean;
  pied?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <main id="principal" className="porte">
      <div className={`porte-boite${large ? " porte-boite-large" : ""}`}>
        <div className="porte-tete">
          <span className="app-logo" aria-hidden="true"><LogoSkanEcom /></span>
          {qui ? (
            <span className="porte-qui">
              <span className="avatar" aria-hidden="true">{initiales(qui)}</span>
              <span>{qui}</span>
            </span>
          ) : null}
          <h1>{titre}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {children}
        {pied ? <div className="porte-pied">{pied}</div> : null}
      </div>
    </main>
  );
}
