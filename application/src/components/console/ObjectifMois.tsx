import Link from "next/link";
import { Icone } from "@/components/console/Icone";
import { duMois, enTnd, moisSuivant, nomMois, nomMoisCourt, suggestion, type Objectif } from "@/lib/gestion/objectif";

/* ============================================================================
   L'OBJECTIF DU MOIS, AU TABLEAU DE BORD — le livré du mois sur le chiffre
   visé, ce qui est en route (une seconde teinte dans la jauge), le rythme
   (dès le cinquième jour : avant, une projection ne veut rien dire) et ce
   qu'il faut livrer par jour ; les six mois d'avant. La direction le lit ;
   propriétaire et administrateur le fixent, ici même (un formulaire
   ordinaire, la page se met à jour en place).
   ========================================================================== */

const TND = enTnd;
const PART = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

/** « 1 500 000 » millimes → « 1500 » : le champ s'écrit en dinars. */
const enDinars = (m: number | null) => (m ? String(Math.round(m / 1000)) : "");

function Fixer({ slug, mois, valeur, libelle, ouvert }: { slug: string; mois: string; valeur: number | null; libelle: string; ouvert?: boolean }) {
  return (
    <details className="ob-fixer" open={ouvert || undefined}>
      <summary className="btn btn-second btn-petit"><Icone nom="crayon" taille={14} /> {libelle}</summary>
      <form action={`/gestion/${slug}/tableau/objectif`} method="post" className="ob-form">
        <input type="hidden" name="mois" value={mois} />
        <div className="champ">
          <label htmlFor={`objectif-${mois}`}>Objectif {duMois(mois)} (TND livrés)</label>
          <input id={`objectif-${mois}`} name="montant" inputMode="numeric" defaultValue={enDinars(valeur)} placeholder="Ex. 20000" autoComplete="off" />
          <span className="aide">Ce qui doit être livré — donc encaissé — dans le mois. Vide : pas d&apos;objectif.</span>
        </div>
        <button type="submit" className="btn btn-primaire btn-petit">Enregistrer</button>
      </form>
    </details>
  );
}

export function ObjectifMois({ o, slug, peutFixer }: { o: Objectif; slug: string; peutFixer: boolean }) {
  const suivant = moisSuivant(o.mois);
  const nom = nomMois(o.mois);
  const restants = o.jours_mois - o.jours_ecoules + 1;
  const max = Math.max(1, ...o.historique.map((h) => Math.max(h.livre, h.objectif ?? 0)));

  if (o.objectif === null) {
    const propose = suggestion(o.mois_dernier);
    return (
      <section id="objectif" className="carte ob-carte ob-vide" aria-labelledby="ob-titre">
        <div className="carte-tete">
          <div>
            <h2 id="ob-titre" className="carte-titre-icone"><Icone nom="graphique" /> Objectif {duMois(o.mois)}</h2>
            <p>
              Pas encore de chiffre visé. {TND(o.livre)} livrés depuis le 1<sup>er</sup>
              {o.mois_dernier > 0 ? ` ; ${TND(o.mois_dernier)} le mois dernier.` : "."}
            </p>
          </div>
        </div>
        {peutFixer ? (
          <Fixer slug={slug} mois={o.mois} valeur={propose} libelle={`Fixer l'objectif ${duMois(o.mois)}`} ouvert />
        ) : (
          <p className="discret">La direction fixe l&apos;objectif du mois.</p>
        )}
      </section>
    );
  }

  const partLivre = Math.min(1, o.livre / o.objectif);
  const partRoute = Math.min(1 - partLivre, o.en_route / o.objectif);
  const atteint = o.livre >= o.objectif;
  const fiable = o.jours_ecoules >= 5;
  return (
    <section id="objectif" className="carte ob-carte" data-atteint={atteint ? "" : undefined} aria-labelledby="ob-titre">
      <div className="carte-tete">
        <div>
          <h2 id="ob-titre" className="carte-titre-icone"><Icone nom="graphique" /> Objectif {duMois(o.mois)}</h2>
          <p>Jour {o.jours_ecoules} sur {o.jours_mois}.</p>
        </div>
        {peutFixer ? <Fixer slug={slug} mois={o.mois} valeur={o.objectif} libelle="Changer…" /> : null}
      </div>

      <p className="ob-chiffres">
        <span className="ob-livre">{TND(o.livre)}</span>
        <span className="ob-sur"> livrés sur {TND(o.objectif)}</span>
        <span className="ob-part">{PART.format(o.livre / o.objectif)}</span>
      </p>
      <div className="ob-jauge" role="img"
        aria-label={`${PART.format(o.livre / o.objectif)} de l'objectif livrés${o.en_route ? `, ${TND(o.en_route)} en route` : ""}`}>
        <span className="ob-jauge-livre" style={{ inlineSize: `${partLivre * 100}%` }} />
        <span className="ob-jauge-route" style={{ inlineSize: `${partRoute * 100}%` }} />
      </div>
      <ul className="ob-faits" role="list">
        {o.en_route > 0 ? (
          <li><span className="ob-pastille ob-pastille-route" aria-hidden="true" /> {TND(o.en_route)} en route (confirmées ou expédiées, pas encore livrées)</li>
        ) : null}
        {atteint ? (
          <li className="ob-bravo"><Icone nom="succes" taille={14} /> Objectif atteint, avec {restants > 1 ? `${restants - 1} jour${restants - 1 > 1 ? "s" : ""} d'avance` : "le dernier jour"}.</li>
        ) : (
          <>
            {o.par_jour ? <li>Il faut <b>{TND(o.par_jour)}</b> livrés par jour d&apos;ici la fin {duMois(o.mois)} ({restants} jour{restants > 1 ? "s" : ""}, aujourd&apos;hui compris).</li> : null}
            {fiable ? (
              <li className={o.projection >= o.objectif ? "ob-bon" : "ob-juste"}>
                Au rythme actuel : environ <b>{TND(o.projection)}</b> fin {nom}{o.projection >= o.objectif ? " — l'objectif sera atteint." : "."}
              </li>
            ) : (
              <li className="discret">Le rythme du mois se lira à partir du 5.</li>
            )}
          </>
        )}
      </ul>

      <div className="ob-bas">
        <ol className="ob-histoire" aria-label="Les six mois d'avant : visé et livré">
          {o.historique.map((h) => (
            <li key={h.mois} title={`${nomMois(h.mois)} : ${TND(h.livre)} livrés${h.objectif ? ` sur ${TND(h.objectif)} visés` : ""}`}>
              <span className="ob-histoire-barre">
                <span className="ob-histoire-livre" style={{ blockSize: `${(h.livre / max) * 100}%` }}
                  data-atteint={h.objectif && h.livre >= h.objectif ? "" : undefined} />
                {h.objectif ? <span className="ob-histoire-vise" style={{ insetBlockEnd: `${(h.objectif / max) * 100}%` }} /> : null}
              </span>
              <span className="ob-histoire-mois">{nomMoisCourt(h.mois)}</span>
              <span className="sr-only">{nomMois(h.mois)} : {TND(h.livre)} livrés{h.objectif ? `, ${TND(h.objectif)} visés` : ""}</span>
            </li>
          ))}
        </ol>
        <div className="ob-liens">
          {o.en_route > 0 ? <Link className="aide" href={`/gestion/${slug}?etape=expediees`}>Les commandes chez le livreur</Link> : null}
          {peutFixer ? (
            <div className="ob-suivant">
              <span className="aide">
                {o.objectif_suivant
                  ? <>Objectif {duMois(suivant)} : {TND(o.objectif_suivant)}.</>
                  : <>Pas encore d&apos;objectif {duMois(suivant)}.</>}
              </span>
              <Fixer slug={slug} mois={suivant} valeur={o.objectif_suivant ?? o.objectif} libelle={o.objectif_suivant ? "Changer" : "Le préparer"} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
