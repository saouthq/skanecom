import Link from "next/link";
import { Gabarit } from "./Gabarit";
import { PAGES_LEGALES, MODELE_LEGAL, dateLisible } from "@/lib/legal";

/* ============================================================================
   LA MISE EN PAGE D'UN TEXTE LÉGAL — commune aux deux gabarits : un titre,
   la date de la version, un sommaire (collant sur grand écran), des
   sections numérotées, et les deux autres pages au pied. Un texte que l'on
   peut lire, pas un mur gris.
   ========================================================================== */

export type SectionLegale = { id: string; titre: string; corps: React.ReactNode };

export function PageLegale({
  chemin,
  titre,
  boutique,
  intro,
  sections,
}: {
  chemin: string;
  titre: string;
  boutique: string;
  intro: React.ReactNode;
  sections: SectionLegale[];
}) {
  const autres = PAGES_LEGALES.filter((p) => p.chemin !== chemin);
  return (
    <Gabarit className="enveloppe flex-1 legal-page">
      <article className="legal">
        <header className="legal-tete">
          <p className="legal-surtitre">{boutique}</p>
          <h1>{titre}</h1>
          <p className="legal-version">Version du {dateLisible(MODELE_LEGAL)}</p>
          <div className="legal-intro">{intro}</div>
        </header>

        <div className="legal-corps">
          <nav className="legal-sommaire" aria-label="Sommaire">
            <p className="legal-sommaire-titre">Sommaire</p>
            <ol>
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}><span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span> {s.titre}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="legal-texte">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-titre`}>
                <h2 id={`${s.id}-titre`}><span className="legal-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>{s.titre}</h2>
                {s.corps}
              </section>
            ))}
          </div>
        </div>

        <footer className="legal-pied">
          <p>Voir aussi</p>
          <ul>
            {autres.map((p) => (
              <li key={p.chemin}><Link href={p.chemin}>{p.titre}</Link></li>
            ))}
          </ul>
        </footer>
      </article>
    </Gabarit>
  );
}
