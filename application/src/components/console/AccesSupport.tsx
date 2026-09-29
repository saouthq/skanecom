import { dateJournal } from "@/lib/console/libelles";
import { MODES_SUPPORT, dureeSupport, finSupport, heureSupport, type AccesSupport, type ModeSupport } from "@/lib/console/support";
import { initiales } from "./Coquille";
import { Icone } from "./Icone";

/* ============================================================================
   LES ACCÈS SUPPORT D'UNE BOUTIQUE (C7) — qui, de SkanEcom, est entré dans
   son backoffice, quand, combien de temps, dans quel mode et pourquoi. Dans
   la console (page Support) et chez le propriétaire (Équipe) ; et, pendant
   l'accès, le bandeau du backoffice qui le rappelle et le ferme.
   ========================================================================== */

/** La liste des accès, commune à la console et au backoffice du propriétaire.
 *  `fermer` : l'adresse où le propriétaire ferme un accès encore ouvert. */
export function ListeAcces({ acces, maintenant, fermer }: { acces: AccesSupport[]; maintenant: Date; fermer?: string }) {
  return (
    <ul className="sp-liste" role="list">
      {acces.map((a) => (
        <li key={a.id} className="sp-acces" data-ouvert={a.ouvert ? "" : undefined}>
          <span className="avatar" aria-hidden="true">{initiales(a.qui ?? "?")}</span>
          <div className="sp-acces-texte">
            <p className="sp-acces-titre">
              <span>{a.qui ?? "compte supprimé"}</span>
              <span className={a.ouvert ? "ui-etat ui-etat-point ui-etat-vert" : "ui-etat"}>{MODES_SUPPORT[a.role]?.titre ?? a.role}</span>
            </p>
            <p className="sp-acces-quand tabular-nums">
              {dateJournal(a.ouvert_le)} · {finSupport(a)}{a.ouvert ? "" : ` · ${dureeSupport(a, maintenant)}`}
            </p>
            <p className="sp-motif">« {a.motif} »</p>
          </div>
          {fermer && a.ouvert ? (
            <form action={fermer} method="post" className="sp-acces-geste">
              <input type="hidden" name="id" value={a.id} />
              <button type="submit" className="btn btn-second btn-petit">Fermer cet accès</button>
            </form>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** En tête de chaque page du backoffice, pendant un accès support. Fermer
 *  l'accès ramène à la page Support de la boutique, dans la console. */
export function BandeauSupport({ slug, mode, jusqua, motif }: { slug: string; mode: ModeSupport; jusqua: string; motif: string | null }) {
  return (
    <div className="sp-bandeau" role="region" aria-label="Accès support">
      <span className="sp-bandeau-icone" aria-hidden="true"><Icone nom="support" taille={16} /></span>
      <p className="sp-bandeau-texte">
        <b>Accès support</b>
        <span>{MODES_SUPPORT[mode]?.court ?? mode} · jusqu&apos;à <span className="tabular-nums">{heureSupport(jusqua)}</span></span>
        {motif ? <span className="sp-bandeau-motif">« {motif} »</span> : null}
      </p>
      <form action={`/boutiques/${encodeURIComponent(slug)}/support/fermer`} method="post">
        <button type="submit" className="btn btn-petit sp-bandeau-bouton">Fermer l&apos;accès</button>
      </form>
    </div>
  );
}
