import { initiales, LogoSkanEcom } from "./Coquille";

/* Les pages d'entrée (connexion, double authentification, lien d'accès,
   refus) : sur ordinateur, deux panneaux — la marque à gauche, avec une
   petite scène de ce que l'outil fait (une commande à confirmer, une
   livraison encaissée, le mois qui monte), et le formulaire à droite. Sur
   téléphone, le formulaire seul, la marque au-dessus. La scène est un décor
   (aria-hidden) : elle ne dit rien que le texte ne dise. */
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
      <aside className="porte-marque" aria-hidden="true">
        <p className="porte-marque-nom"><span className="app-logo"><LogoSkanEcom /></span> SkanEcom</p>
        <div className="porte-scene">
          <div className="ps-carte ps-commande">
            <span className="ps-ligne"><b>MAY-2026-00012</b><i className="ps-pastille">À confirmer</i></span>
            <span className="ps-ligne ps-doux">Amel B. · Tunis<b>236,000 TND</b></span>
            <span className="ps-boutons"><i className="ps-bouton ps-bouton-plein">Appeler</i><i className="ps-bouton">WhatsApp</i></span>
          </div>
          <div className="ps-carte ps-livree">
            <i className="ps-coche" />
            <span><b>Livrée</b><span className="ps-doux">paiement encaissé</span></span>
          </div>
          <div className="ps-carte ps-mois">
            <span className="ps-doux">Encaissé ce mois-ci</span>
            <b className="ps-chiffre">18 420 <small>TND</small></b>
            <span className="ps-barres">
              {[38, 52, 44, 66, 58, 80, 72, 94].map((h, i) => <i key={i} style={{ blockSize: `${h}%`, animationDelay: `${700 + i * 70}ms` }} />)}
            </span>
          </div>
        </div>
        <p className="porte-marque-texte">
          <b>Votre boutique, de la commande au paiement.</b>
          <span>Confirmer, préparer, livrer, encaisser : tout au même endroit, sur téléphone comme sur ordinateur.</span>
        </p>
      </aside>

      <div className="porte-cote">
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
      </div>
    </main>
  );
}
