"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavigateur } from "@/lib/supabase-navigateur";
import { chiffresTelephone } from "@/lib/commande";
import { t } from "@/lib/i18n";

/* ============================================================================
   LE NUMÉRO D'UN COMPTE E-MAIL (migration 42) — un acheteur connecté par
   e-mail n'a pas de numéro vérifié. Avant sa première demande dans la
   boutique (devis, compte professionnel), il le donne une fois :
   public.renseigner_telephone crée sa fiche client. public.mon_telephone
   dit si la boutique le connaît déjà (fiche, ou compte SMS) : on ne le
   redemande jamais.
   ========================================================================== */

/** undefined : pas encore lu ; null : la boutique ne connaît pas de numéro au compte. */
export function useTelephoneDuCompte(boutiqueId: string, connecte: boolean) {
  const [telephone, setTelephone] = useState<string | null | undefined>(undefined);
  const [relecture, setRelecture] = useState(0);
  useEffect(() => {
    if (!connecte) return;
    let actif = true;
    supabaseNavigateur()
      .rpc("mon_telephone", { p_boutique_id: boutiqueId })
      .then(({ data, error }) => {
        // Une lecture en échec ne bloque rien : la demande dira « telephone » s'il manque.
        if (actif) setTelephone(error ? "" : ((data as string | null) ?? null));
      });
    return () => {
      actif = false;
    };
  }, [boutiqueId, connecte, relecture]);
  const manque = useCallback(() => setTelephone(null), []);
  const relire = useCallback(() => setRelecture((n) => n + 1), []);
  return { telephone: connecte ? telephone : undefined, manque, relire };
}

/** Donne le numéro saisi à la boutique. Rend null quand c'est fait, sinon le message à afficher. */
export async function renseigneTelephone(boutiqueId: string, saisie: string): Promise<string | null> {
  const huit = chiffresTelephone(saisie);
  if (!huit) return t.commande.telephoneInvalide;
  const { error } = await supabaseNavigateur().rpc("renseigner_telephone", {
    p_boutique_id: boutiqueId,
    p_telephone: `+216${huit}`,
  });
  if (!error) return null;
  return ["telephone", "bloque"].includes(error.hint ?? "") ? error.message : t.commande.erreur;
}

export function ChampTelephoneDuCompte({ id, invalide, decrit }: { id: string; invalide: boolean; decrit?: string }) {
  return (
    <div className="champ telephone-du-compte">
      <label htmlFor={id}>{t.connexion.telephoneDemande}</label>
      <div className="tunnel-tel" data-invalide={invalide ? "" : undefined}>
        <span aria-hidden="true">{t.commande.indicatif}</span>
        <input
          id={id}
          name="telephone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="20 123 456"
          maxLength={20}
          aria-invalid={invalide ? true : undefined}
          aria-describedby={`${id}-aide${decrit ? ` ${decrit}` : ""}`}
        />
      </div>
      <p id={`${id}-aide`} className="legende">{t.connexion.telephoneDemandeAide}</p>
    </div>
  );
}
