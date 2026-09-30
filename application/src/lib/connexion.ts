/* ============================================================================
   LA CONNEXION DE L'ACHETEUR — par un code reçu par SMS ou par e-mail
   (réglage compte.verification de la boutique, migration 42) :
   · sms      : le code part par SMS, le numéro est vérifié ;
   · email    : le code part par e-mail, presque gratuit ; le numéro se saisit
     à la commande et se vérifie à l'appel de confirmation ;
   · les_deux : l'acheteur choisit, le SMS proposé d'abord. Par défaut.
   Un compte SMS et un compte e-mail sont deux comptes distincts : on se
   reconnecte comme on s'est inscrit.
   ========================================================================== */

export type Verification = "sms" | "email" | "les_deux";
export type Canal = "sms" | "email";

/** L'acheteur connecté : son numéro (compte SMS) ou son adresse (compte e-mail). */
export type SessionAcheteur = { telephone: string | null; email: string | null };

export function verificationDe(reglages: Record<string, unknown>): Verification {
  const v = reglages["compte.verification"];
  return v === "sms" || v === "email" ? v : "les_deux";
}

export function canauxDe(verification: Verification): Canal[] {
  if (verification === "sms") return ["sms"];
  if (verification === "email") return ["email"];
  return ["sms", "email"];
}

/** La session de supabase-js, ramenée à ce que la vitrine en lit. */
export function sessionAcheteur(u: { phone?: string | null; email?: string | null } | null | undefined): SessionAcheteur | null {
  if (!u) return null;
  const chiffres = (u.phone ?? "").replace(/\D/g, "");
  return { telephone: chiffres ? `+${chiffres}` : null, email: u.email || null };
}

/** Une adresse plausible : ce que la base de la commande accepte aussi. */
export function emailValide(saisie: string): boolean {
  const x = saisie.trim();
  return x.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(x);
}
