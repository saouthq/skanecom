import { Coche } from "./Icones";
import { Etoiles } from "./Etoiles";
import { t } from "@/lib/i18n";
import { noteLisible, type AvisProduit as Avis } from "@/lib/avis";

/* ============================================================================
   LES AVIS D'UN PRODUIT (module avis) — sous la fiche : la moyenne, la
   répartition des notes, puis les avis, le plus récent d'abord, chacun
   « Achat vérifié » (seul un client livré note l'article reçu), avec la
   déclinaison achetée et la réponse de la boutique. Rien tant qu'aucun avis
   n'est publié. `section` et `tete` : les classes du gabarit.

   Sous le titre de la fiche, ResumeAvis : les étoiles et le nombre d'avis,
   un lien vers la section.
   ========================================================================== */

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Tunis" });

export function ResumeAvis({ avis }: { avis: Avis | null }) {
  if (!avis || avis.total === 0 || avis.moyenne === null) return null;
  return (
    <a className="fiche-avis-resume" href="#avis">
      <Etoiles note={avis.moyenne} taille={15} />
      <span className="fiche-avis-note">{noteLisible(avis.moyenne)}</span>
      <span className="fiche-avis-total">{t.avis.total(avis.total)}</span>
    </a>
  );
}

export function AvisProduit({ avis, section, tete }: { avis: Avis | null; section: string; tete: string }) {
  if (!avis || avis.total === 0 || avis.moyenne === null) return null;
  const plus = Math.max(1, ...Object.values(avis.repartition));
  return (
    <section id="avis" className={`avis ${section}`} aria-labelledby="avis-titre">
      <div className={tete}>
        <h2 id="avis-titre">{t.avis.titre}</h2>
      </div>
      <div className="avis-grille">
        <div className="avis-synthese">
          <p className="avis-moyenne">
            <span>{noteLisible(avis.moyenne)}</span>
            <span className="avis-sur">/5</span>
          </p>
          <Etoiles note={avis.moyenne} taille={20} />
          <p className="avis-compte">{t.avis.totalVerifies(avis.total)}</p>
          <ol className="avis-repartition" aria-label={t.avis.repartition}>
            {(["5", "4", "3", "2", "1"] as const).map((n) => (
              <li key={n}>
                <span className="avis-repartition-note">{t.avis.etoilesCourt(Number(n))}</span>
                <span className="avis-barre" aria-hidden="true">
                  <i style={{ inlineSize: `${(avis.repartition[n] / plus) * 100}%` }} />
                </span>
                <span className="avis-repartition-compte">{avis.repartition[n]}</span>
              </li>
            ))}
          </ol>
          <p className="legende avis-explique">{t.avis.explication}</p>
        </div>

        <ul className="avis-liste" role="list">
          {avis.avis.map((a) => (
            <li key={a.id} className="avis-item">
              <div className="avis-item-tete">
                <Etoiles note={a.note} taille={14} />
                <b>{a.auteur}</b>
                <span className="avis-verifie"><Coche taille={12} /> {t.avis.achatVerifie}</span>
              </div>
              <p className="legende">
                {JOUR.format(new Date(a.cree_le))}
                {a.variante_libelle ? ` · ${a.variante_libelle}` : null}
              </p>
              {a.texte ? <p className="avis-texte">{a.texte}</p> : null}
              {a.reponse ? (
                <div className="avis-reponse">
                  <b>{t.avis.reponseBoutique}</b>
                  <p>{a.reponse}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
