import Link from "next/link";
import { FilAriane } from "./FilAriane";
import { Fleche } from "./Icones";
import { BlocsRendus, Enrichi, questions } from "@/lib/texte-riche";
import { champ, t } from "@/lib/i18n";
import type { Cadre } from "@/lib/boutique";
import type { Page } from "@/lib/pages";

/* ============================================================================
   UNE PAGE DE LA BOUTIQUE — son titre, son texte, dans la colonne de lecture
   du gabarit. Une page de questions devient un accordéon (une question, sa
   réponse repliée), avec l'invitation à écrire à la boutique en bas.
   ========================================================================== */

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Tunis" });

export function PageContenu({ cadre, page }: { cadre: Cadre; page: Page }) {
  const titre = champ(page, "titre");
  const corps = champ(page, "corps");
  const aContact = Boolean(cadre.whatsapp || cadre.reglages["contact.telephone"] || cadre.reglages["legal.email"]);

  return (
    <article className="page-boutique" data-genre={page.genre}>
      <header className="page-boutique-tete">
        <FilAriane etapes={[{ nom: titre }]} />
        <h1>{titre}</h1>
      </header>

      {page.genre === "questions" ? (
        <Questions source={corps} />
      ) : (
        <Enrichi source={corps} className="page-boutique-texte" />
      )}

      <footer className="page-boutique-pied">
        {page.genre === "questions" && aContact ? (
          <p className="page-boutique-aide">
            <span>{t.pages.questionsAide}</span>
            <Link className="lien-souligne page-boutique-lien" href="/contact">
              {t.pages.ecrireNous}
              <Fleche taille={14} className="icone-fleche rtl:-scale-x-100" />
            </Link>
          </p>
        ) : null}
        <p className="legende">{t.pages.miseAJour(JOUR.format(new Date(page.modifiee_le)))}</p>
      </footer>
    </article>
  );
}

function Questions({ source }: { source: string }) {
  const { intro, questions: liste } = questions(source);
  return (
    <div className="page-boutique-texte">
      {intro.length ? <BlocsRendus blocs={intro} cle="intro" /> : null}
      <div className="plis page-questions">
        {liste.map((q, i) => (
          <details key={i} className="pli" open={i === 0}>
            <summary>{q.question}</summary>
            <div>
              <BlocsRendus blocs={q.reponse} cle={`q${i}`} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
