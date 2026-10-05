/* ============================================================================
   LA FORMULE PERSONNALISÉE D'UNE BOUTIQUE — ce que rend
   public.console_droits_boutique (migration …_formule_personnalisee) : sa
   formule, son prix propre, et chaque droit (dans la formule ou non, son
   écart pour cette boutique, ce qui est ouvert au bout du compte).
   ========================================================================== */

export type DroitBoutique = {
  code: string; genre: "reglage" | "module"; groupe: string; libelle: string; description: string | null;
  disponible: boolean;
  /** Ouvert par sa formule (sans formule : tout l'est). */
  dans_formule: boolean;
  /** L'écart de cette boutique : true ajouté, false retiré, null aucun. */
  exception: boolean | null;
  effectif: boolean;
};

export type DonneesDroits = {
  formule: { code: string; nom: string; prix: number | null } | null;
  prix_boutique: number | null;
  droits: DroitBoutique[];
};

export function resumeEcarts(d: DonneesDroits): { ajoutes: number; retires: number } {
  return {
    ajoutes: d.droits.filter((x) => x.exception === true).length,
    retires: d.droits.filter((x) => x.exception === false).length,
  };
}
