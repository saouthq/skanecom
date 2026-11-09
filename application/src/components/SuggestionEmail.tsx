"use client";

import { suggestionEmail } from "@/lib/connexion";
import { t } from "@/lib/i18n";

/** « Vouliez-vous dire amel@gmail.com ? » sous un champ e-mail, quand le
 *  domaine ressemble à une faute (lib/connexion.ts) ; la correction s'applique
 *  d'un toucher, rien n'est imposé. `montre` : le champ quitté, ou un envoi tenté. */
export function SuggestionEmail({ valeur, montre, onChoisir }: { valeur: string; montre: boolean; onChoisir: (corrigee: string) => void }) {
  const s = montre ? suggestionEmail(valeur) : null;
  return (
    <p className="legende suggestion-email" role="status">
      {s ? (
        <>
          {t.connexion.vouliezVous}{" "}
          <button type="button" className="btn-lien" onClick={() => onChoisir(s)}>{s}</button> ?
        </>
      ) : null}
    </p>
  );
}
