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

/* Une faute dans le domaine (« gmial.com », « hotmial.fr », « gmail.con »,
   « yahoo ») : le code partirait vers une adresse qui n'existe pas, et
   l'on attendrait. On propose la correction, sans l'imposer. Les domaines
   courants en Tunisie ; un domaine connu proche d'un autre (mail.com,
   gmx.fr) n'est pas « corrigé ». */
const DOMAINES = ["gmail.com", "yahoo.fr", "yahoo.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.fr", "live.com",
  "icloud.com", "topnet.tn", "gnet.tn", "planet.tn"];
const CONNUS = new Set([...DOMAINES, "mail.com", "gmx.fr", "gmx.com", "orange.fr", "free.fr", "sfr.fr", "laposte.net", "me.com", "msn.com", "aol.com", "proton.me", "protonmail.com", "googlemail.com"]);

/** Distance d'édition, une transposition comptant pour une (« gmial » → « gmail »). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** L'adresse corrigée à proposer (« amel@gmail.com »), ou null. */
export function suggestionEmail(saisie: string): string | null {
  const x = saisie.trim().toLowerCase();
  const at = x.lastIndexOf("@");
  if (at < 1 || at === x.length - 1) return null;
  const local = x.slice(0, at);
  const domaine = x.slice(at + 1);
  if (CONNUS.has(domaine) || domaine.length < 4) return null;
  // « yahoo », « gmail » : l'extension oubliée.
  if (!domaine.includes(".")) {
    const d = DOMAINES.find((c) => c.split(".")[0] === domaine);
    return d ? `${local}@${d}` : null;
  }
  let meilleur: string | null = null;
  let min = 3;
  for (const c of DOMAINES) {
    const n = distance(domaine, c);
    if (n < min) { min = n; meilleur = c; }
  }
  return meilleur && min <= 2 ? `${local}@${meilleur}` : null;
}
