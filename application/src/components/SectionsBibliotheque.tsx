import Link from "next/link";
import type { ReactNode } from "react";
import { Etoiles } from "./Etoiles";
import { Photo } from "./Photo";
import { Fleche } from "./Icones";
import { BlocsRendus } from "@/lib/texte-riche";
import { noteLisible } from "@/lib/avis";
import { urlFichier } from "@/lib/photos";
import { champ, t } from "@/lib/i18n";
import type { AvisAccueil, Marque, QuestionsAccueil } from "@/lib/accueil";

/* ============================================================================
   LA BIBLIOTHÈQUE DE SECTIONS — communes aux gabarits (migration 59). Le
   gabarit fournit la tête de section (son titre, sa typographie) ; la
   section pose sa structure, que la feuille du gabarit habille.
     · Avis      : la note de la boutique, puis des citations d'acheteurs
                   vérifiés, avec la pièce reçue.
     · Questions : les premières questions d'une page, en accordéon, et le
                   lien vers toutes.
     · Marques   : les marques du catalogue, chacune vers ses pièces.
   ========================================================================== */

type Gabarit = "editorial" | "technique";

/* Des rangées pleines : trois colonnes (ou quatre si le nombre s'y prête),
   et les citations d'une rangée incomplète laissées de côté — un trou dans
   la grille se voit plus qu'un avis de moins. */
function colonnes(n: number): { colonnes: number; montrees: number } {
  if (n <= 4) return { colonnes: n, montrees: n };
  const c = n % 3 === 0 ? 3 : n % 4 === 0 ? 4 : 3;
  return { colonnes: c, montrees: n - (n % c) };
}

export function AvisClients({ avis, tete, gabarit }: { avis: AvisAccueil; tete: ReactNode; gabarit: Gabarit }) {
  const grille = colonnes(avis.avis.length);
  return (
    <section className="bi-avis" data-gabarit-section={gabarit}>
      <div className="bi-avis-tete">
        {tete}
        {avis.moyenne !== null ? (
          <p className="bi-avis-note">
            <b>{noteLisible(avis.moyenne)}</b>
            <span>
              <Etoiles note={avis.moyenne} taille={gabarit === "technique" ? 16 : 18} />
              <span className="bi-avis-compte">{t.avis.totalVerifies(avis.total)}</span>
            </span>
          </p>
        ) : null}
      </div>
      <ul className="bi-avis-liste rail-mobile" data-colonnes={grille.colonnes}>
        {avis.avis.slice(0, grille.montrees).map((a) => {
          const nom = champ(a.produit, "nom");
          return (
            <li key={a.id} className="bi-citation">
              <Etoiles note={a.note} taille={14} />
              <blockquote>
                <p>{a.texte}</p>
              </blockquote>
              <p className="bi-citation-auteur">
                <b>{a.auteur}</b>
                <span>{t.avis.achatVerifie}</span>
              </p>
              <Link className="bi-citation-produit" href={`/produit/${a.produit.slug}`}>
                <Photo photo={a.produit.image ? { src: urlFichier(a.produit.image), alt: "" } : null} ratio="1 / 1" tailles="56px" />
                <span>
                  <span className="bi-citation-nom">{nom}</span>
                  {a.variante_libelle ? <span className="legende">{a.variante_libelle}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** `tete` reçoit le lien vers la page : le gabarit technique le pose dans
 *  sa tête de section (à droite du titre, comme ses autres « Tout voir ») ;
 *  l'éditorial le met sous le titre, dans la colonne de gauche. */
export function QuestionsFrequentes({
  questions,
  tete,
  gabarit,
}: {
  questions: QuestionsAccueil;
  tete: (lien: { href: string; libelle: string }) => ReactNode;
  gabarit: Gabarit;
}) {
  const lien = {
    href: `/${questions.slug}`,
    libelle: questions.total > questions.liste.length ? t.accueil.toutesLesQuestions(questions.total) : questions.titre,
  };
  return (
    <section className="bi-questions" data-gabarit-section={gabarit}>
      <div className="bi-questions-tete">
        {tete(lien)}
        {gabarit === "editorial" ? (
          <Link className="lien-souligne bi-lien" href={lien.href}>
            {lien.libelle}
            <Fleche taille={14} className="icone-fleche rtl:-scale-x-100" />
          </Link>
        ) : null}
      </div>
      <div className="plis bi-questions-plis">
        {questions.liste.map((q, i) => (
          <details key={i} className="pli">
            <summary>{q.question}</summary>
            <div>
              <BlocsRendus blocs={q.reponse} cle={`aq${i}`} />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Marques({ marques, tete, gabarit }: { marques: Marque[]; tete: ReactNode; gabarit: Gabarit }) {
  return (
    <section className="bi-marques" data-gabarit-section={gabarit}>
      {tete}
      <ul className="bi-marques-liste">
        {marques.map((m) => (
          <li key={m.nom}>
            <Link href={`/recherche?${new URLSearchParams({ q: m.nom })}`} className="bi-marque">
              <span className="bi-marque-nom">{m.nom}</span>
              <span className="bi-marque-compte">{gabarit === "technique" ? t.catalogue.references(m.compte) : t.catalogue.modeles(m.compte)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
