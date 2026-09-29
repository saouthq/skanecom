import Link from "next/link";
import { Icone } from "./Icone";
import { ETAPES_MISE_EN_PLACE, detailEtape, jourDe, type EtapeBrute, type MiseEnPlace as Donnees } from "@/lib/console/mise-en-place";
import { dateJournal } from "@/lib/console/libelles";

/* ============================================================================
   LA MISE EN PLACE D'UNE BOUTIQUE (C6), en tête de sa vue d'ensemble : les
   dix étapes du PRD §7, datées (« J+3 » : le jour de la mise en place où
   l'étape a été faite — c'est ce qu'on mesure pour la réduire), avec ce
   qu'on en sait et le chemin pour la faire. Les étapes qui ne se voient pas
   dans la base (recueil, commande test, formation) se cochent ici.
   ========================================================================== */

/** Où faire une étape qui reste à faire, depuis la console. */
function chemin(slug: string, e: EtapeBrute): string | null {
  if (e.fait) return null;
  switch (e.cle) {
    case "marque": return `/boutiques/${slug}/marque`;
    case "catalogue": return `/boutiques/${slug}/import`;
    case "domaine": return `/boutiques/${slug}#t-domaines`;
    case "equipe": return `/boutiques/${slug}/equipe`;
    default: return null;
  }
}

export function MiseEnPlace({ slug, boutiqueId, donnees }: { slug: string; boutiqueId: string; donnees: Donnees }) {
  const faites = donnees.etapes.filter((e) => e.fait).length;
  const total = donnees.etapes.length;
  const suivante = donnees.etapes.find((e) => !e.fait);

  return (
    <section className="carte mp" aria-labelledby="t-mise-en-place">
      <div className="carte-tete">
        <div>
          <h2 id="t-mise-en-place" className="carte-titre-icone"><Icone nom="coche" /> Mise en place</h2>
          <p>
            {faites === total
              ? "Toutes les étapes sont faites."
              : `Prochaine étape : ${ETAPES_MISE_EN_PLACE[suivante!.cle].titre.toLowerCase()}.`}{" "}
            Chaque étape est datée depuis la création de la boutique ({dateJournal(donnees.creee_le).split(" ")[0]}).
          </p>
        </div>
        <div className="mp-avancement" aria-label={`${faites} étapes faites sur ${total}`}>
          <span className="mp-compte"><b>{faites}</b> sur {total}</span>
          <span className="mp-barre" aria-hidden="true"><span style={{ inlineSize: `${(faites / total) * 100}%` }} /></span>
        </div>
      </div>
      <ol className="mp-liste">
        {donnees.etapes.map((e, i) => {
          const def = ETAPES_MISE_EN_PLACE[e.cle];
          const detail = detailEtape(e);
          const vers = chemin(slug, e);
          return (
            <li key={e.cle} className="mp-etape" data-etape={e.cle} data-fait={e.fait ? "" : undefined}>
              <span className="mp-puce" aria-hidden="true">{e.fait ? <Icone nom="coche" taille={13} /> : i + 1}</span>
              <div className="mp-texte">
                <p className="mp-titre">
                  {def.titre}
                  {e.fait && e.le ? <span className="mp-quand">{jourDe(e.le, donnees.creee_le)} · {dateJournal(e.le)}</span> : null}
                  {e.manuelle ? <span className="ui-etat">À cocher</span> : null}
                </p>
                <p className="aide">{e.fait && detail ? detail : def.aide}</p>
                {!e.fait && detail ? <p className="mp-detail">{detail}</p> : null}
                {e.fait && e.par ? <p className="mp-detail">Cochée par {e.par}</p> : null}
              </div>
              <div className="mp-action">
                {e.manuelle ? (
                  <form action={`/boutiques/${slug}/mise-en-place`} method="post">
                    <input type="hidden" name="boutique_id" value={boutiqueId} />
                    <input type="hidden" name="etape" value={e.cle} />
                    {e.fait ? (
                      <button type="submit" name="fait" value="false" className="btn btn-fantome btn-petit" aria-label={`${def.titre} : de nouveau à faire`}>Annuler</button>
                    ) : (
                      <button type="submit" name="fait" value="true" className="btn btn-second btn-petit" aria-label={`${def.titre} : faite`}>
                        <Icone nom="coche" taille={14} /> Faite
                      </button>
                    )}
                  </form>
                ) : vers ? (
                  <Link href={vers} className="btn btn-fantome btn-petit" aria-label={`Aller à l'étape : ${def.titre.toLowerCase()}`}>
                    Y aller <Icone nom="droite" taille={13} />
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
