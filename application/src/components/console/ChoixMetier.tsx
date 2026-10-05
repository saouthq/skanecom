import { LIBELLES_THEME } from "@/lib/console/libelles";
import { cePose, type Metier } from "@/lib/console/metiers";

/* ============================================================================
   LE MÉTIER D'UNE BOUTIQUE — des cartes à choisir (une seule) : le nom, ce
   qu'on y vend, la structure et ce que le préréglage pose ; la pastille dit sa
   couleur. « Aucun » laisse la boutique vide (la structure se choisit à part).
   ========================================================================== */

export function ChoixMetier({ metiers, choisi, aucun = true }: { metiers: Metier[]; choisi?: string; aucun?: boolean }) {
  return (
    <fieldset className="choix mt-choix">
      <legend>Métier</legend>
      {aucun ? (
        <label className="choix-carte mt-carte">
          <input type="radio" name="metier" value="" defaultChecked={!choisi} />
          <span>
            <b>Aucun : partir de zéro</b>
            <span className="aide">Ni rayons ni caractéristiques ; la structure se choisit à l&apos;étape suivante.</span>
          </span>
        </label>
      ) : null}
      {metiers.map((m) => (
        <label key={m.code} className="choix-carte mt-carte">
          <input type="radio" name="metier" value={m.code} defaultChecked={choisi === m.code}
            data-gabarit={m.gabarit} data-gabarit-libelle={LIBELLES_THEME[m.gabarit] ?? m.gabarit} />
          <span>
            <b>
              {m.accent ? <span className="mt-pastille" style={{ background: m.accent }} aria-hidden="true" /> : null}
              {m.nom}
            </b>
            <span className="aide">{m.description}</span>
            <span className="aide mt-pose">Structure {LIBELLES_THEME[m.gabarit] ?? m.gabarit} · {cePose(m)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
